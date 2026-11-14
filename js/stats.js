// Hollow Chess — product analytics.
//
// Fire-and-forget event logging into the existing Supabase project. Answers the
// questions the hosting stats cannot: how many people actually START a game,
// how many finish one, guest vs signed-in, and whether anybody uses the board
// mechanic the whole game is built around.
//
// Privacy: no personal data, ever. An anonymous per-visit id (sessionStorage,
// dies with the tab), an anonymous device id (a random string kept in this
// browser's storage, never tied to an account, so "how many players come back"
// can be counted), coarse event props, and the referring domain — nothing
// that identifies a person. Never blocks, never throws, never breaks play.
//
// Exposed as window.WCSTATS.

(function () {
  'use strict';

  const cfg = window.WCCONFIG || {};
  const ON = !!(cfg.supabaseUrl && cfg.supabaseKey);
  // Local development must never pollute the real numbers.
  const DEV = !(window.HC && HC.native) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);  // the app also lives at localhost, and must count

  // Anonymous visit id: one per tab-session, not a user identifier.
  let session = '';
  try {
    session = sessionStorage.getItem('wc.sid') || '';
    if (!session) {
      session = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem('wc.sid', session);
    }
  } catch (e) { session = 'nostore'; }

  // Anonymous device id: survives tabs and restarts so returning players can be
  // counted. Random, local, deleted with the site's data; never linked to the
  // account. `day` = days since this device was first seen, `n` = visit number.
  const DAY = 86400000;
  let device = '', firstSeen = Date.now(), visitNo = 1;
  try {
    device = localStorage.getItem('wc.did') || '';
    firstSeen = +localStorage.getItem('wc.first') || 0;
    visitNo = (+localStorage.getItem('wc.visits') || 0) + 1;
    if (!device) {
      device = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('wc.did', device);
    }
    if (!firstSeen) { firstSeen = Date.now(); localStorage.setItem('wc.first', String(firstSeen)); }
    localStorage.setItem('wc.visits', String(visitNo));
  } catch (e) { device = ''; }
  const dayNo = Math.max(0, Math.floor((Date.now() - firstSeen) / DAY));

  function withDevice(props) {
    const p = Object.assign({}, props || {});
    if (device) p.dev = device;
    return p;
  }

  function track(name, props) {
    if (!ON || DEV) return;
    try {
      fetch(cfg.supabaseUrl + '/rest/v1/events', {
        method: 'POST',
        headers: {
          apikey: cfg.supabaseKey,
          Authorization: 'Bearer ' + cfg.supabaseKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ name: name, props: withDevice(props), session: session }),
        keepalive: true,          // still sends if the tab is closing
      }).catch(function () {});   // analytics must never surface an error
    } catch (e) { /* storage or network blocked: silently skip */ }
  }

  // Where did they come from? Domain only — no query strings, no paths that
  // might carry identifiers.
  function refDomain() {
    try {
      if (!document.referrer) return 'direct';
      const h = new URL(document.referrer).hostname.replace(/^www\./, '');
      return h === location.hostname ? 'internal' : h.slice(0, 60);
    } catch (e) { return 'unknown'; }
  }

  window.WCSTATS = {
    track: track,
    enabled: function () { return ON && !DEV; },
    session: function () { return session; },
    device: function () { return device; },
  };

  track('visit', {
    ref: refDomain(),
    w: window.innerWidth,
    mobile: window.innerWidth < 760,
    platform: window.HC ? HC.platform : 'web',
    pwa: window.matchMedia && window.matchMedia('(display-mode: standalone)').matches,
    day: dayNo,                 // 0 = first day; 1+ = a returning device
    n: visitNo,                 // this device's visit count
  });
})();

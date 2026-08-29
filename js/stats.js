// Hollow Chess — product analytics.
//
// Fire-and-forget event logging into the existing Supabase project. Answers the
// questions the hosting stats cannot: how many people actually START a game,
// how many finish one, guest vs signed-in, and whether anybody uses the board
// mechanic the whole game is built around.
//
// Privacy: no personal data, ever. An anonymous per-visit id (sessionStorage,
// dies with the tab), coarse event props, and the referring domain — nothing
// that identifies a person. Never blocks, never throws, never breaks play.
//
// Exposed as window.WCSTATS.

(function () {
  'use strict';

  const cfg = window.WCCONFIG || {};
  const ON = !!(cfg.supabaseUrl && cfg.supabaseKey);
  // Local development must never pollute the real numbers.
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  // Anonymous visit id: one per tab-session, not a user identifier.
  let session = '';
  try {
    session = sessionStorage.getItem('wc.sid') || '';
    if (!session) {
      session = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem('wc.sid', session);
    }
  } catch (e) { session = 'nostore'; }

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
        body: JSON.stringify({ name: name, props: props || {}, session: session }),
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
  };

  track('visit', {
    ref: refDomain(),
    w: window.innerWidth,
    mobile: window.innerWidth < 760,
    pwa: window.matchMedia && window.matchMedia('(display-mode: standalone)').matches,
  });
})();

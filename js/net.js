// Wildcard Chess — real-time peer-to-peer play.
//
// One link, shared once. After that, moves stream over a WebRTC data channel
// straight between the two browsers; there is no game server. A free public
// PeerJS broker is used only to introduce the two peers, and carries no moves.
//
// Matchmaking with strangers works without a backend too: a player who is
// waiting parks on a predictable "lobby slot" id inside their rating bucket,
// and a searcher probes those slots. First successful connection is the match.
//
// Exposed as window.WCNET.

(function () {
  'use strict';

  const BUCKET = 200;            // rating bucket width for lobby slots
  const SLOTS = 3;               // slots per bucket
  const PROBE_MS = 700;          // how long to wait on one slot probe
  const PROBE_SHARE = 0.35;      // fraction of the budget spent looking before waiting
  const OPEN_MS = 6000;          // how long to wait for our own peer to open

  let peer = null;               // current Peer
  let conn = null;               // active DataConnection
  let handlers = {};             // { onOpen, onPeer, onData, onClose, onError }

  const available = () => typeof window.Peer === 'function';
  const bucketOf = (elo) => Math.max(0, Math.floor(elo / BUCKET) * BUCKET);
  const slotId = (bucket, i) => 'wcxq-' + bucket + '-' + i;
  const roomId = (code) => 'wcxr-' + String(code).toLowerCase();

  function makeCode() {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';   // no look-alike characters
    let s = '';
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  function destroy() {
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conn = null; peer = null;
  }

  // Build a Peer with a specific id. Resolves when open, rejects on failure.
  function newPeer(id) {
    return new Promise((resolve, reject) => {
      let done = false;
      let p;
      try { p = id ? new window.Peer(id) : new window.Peer(); }
      catch (e) { return reject(e); }
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { p.destroy(); } catch (e) {}
        reject(new Error('timeout opening peer'));
      }, OPEN_MS);
      p.on('open', () => {
        if (done) return;
        done = true; clearTimeout(timer); resolve(p);
      });
      p.on('error', (err) => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { p.destroy(); } catch (e) {}
        reject(err);
      });
    });
  }

  function wireConn(c) {
    conn = c;
    c.on('data', (msg) => { if (handlers.onData) handlers.onData(msg); });
    c.on('close', () => { if (handlers.onClose) handlers.onClose(); });
    c.on('error', (e) => { if (handlers.onError) handlers.onError(e); });
  }

  // Try to connect to an existing peer id. Resolves with the connection, or null.
  function probe(fromPeer, targetId, ms) {
    return new Promise((resolve) => {
      let settled = false;
      let c;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };
      const timer = setTimeout(() => {
        try { if (c) c.close(); } catch (e) {}
        finish(null);
      }, ms || PROBE_MS);
      try { c = fromPeer.connect(targetId, { reliable: true }); }
      catch (e) { return finish(null); }
      if (!c) return finish(null);
      c.on('open', () => finish(c));
      c.on('error', () => finish(null));
    });
  }

  // ---- host / join by room code -------------------------------------------

  // Open a room and wait for a friend. Returns { code, link, cancel }.
  function host(h) {
    handlers = h || {};
    const code = makeCode();
    const link = location.origin + location.pathname + '#room=' + code;
    let cancelled = false;

    destroy();
    newPeer(roomId(code)).then((p) => {
      if (cancelled) { try { p.destroy(); } catch (e) {} return; }
      peer = p;
      if (handlers.onOpen) handlers.onOpen({ code, link });
      p.on('connection', (c) => {
        if (conn) { try { c.close(); } catch (e) {} return; }   // room is full
        wireConn(c);
        c.on('open', () => { if (handlers.onPeer) handlers.onPeer({ host: true }); });
      });
    }).catch((e) => {
      if (!cancelled && handlers.onError) handlers.onError(e);
    });

    return { code, link, cancel: () => { cancelled = true; destroy(); } };
  }

  // Join a friend's room by code.
  function join(code, h) {
    handlers = h || {};
    let cancelled = false;
    destroy();
    newPeer(null).then(async (p) => {
      if (cancelled) { try { p.destroy(); } catch (e) {} return; }
      peer = p;
      const c = await probe(p, roomId(code), 8000);
      if (cancelled) return;
      if (!c) { if (handlers.onError) handlers.onError(new Error('room not found')); return; }
      wireConn(c);
      if (handlers.onPeer) handlers.onPeer({ host: false });
    }).catch((e) => {
      if (!cancelled && handlers.onError) handlers.onError(e);
    });
    return { cancel: () => { cancelled = true; destroy(); } };
  }

  // ---- matchmaking ---------------------------------------------------------
  // Look for a waiting stranger near your rating; if none, park as a waiter so
  // someone can find you. Gives up after budgetMs and reports no human found.
  function findHuman(elo, budgetMs, h) {
    handlers = h || {};
    let cancelled = false;
    const deadline = Date.now() + (budgetMs || 10000);
    const buckets = [bucketOf(elo), bucketOf(elo) - BUCKET, bucketOf(elo) + BUCKET]
      .filter(b => b >= 0);

    (async function run() {
      destroy();
      let p;
      try { p = await newPeer(null); } catch (e) { return finishNone(); }
      if (cancelled) { try { p.destroy(); } catch (e) {} return; }
      peer = p;

      // Phase 1 — look for someone already waiting. This is deliberately short:
      // if every client spent the whole budget probing, nobody would ever be
      // waiting to be found and no two players could ever meet.
      const probeUntil = Date.now() + (budgetMs || 10000) * PROBE_SHARE;
      for (const b of buckets) {
        for (let i = 1; i <= SLOTS; i++) {
          if (cancelled) return;
          if (Date.now() > probeUntil) break;
          if (handlers.onTick) handlers.onTick({ phase: 'probing', bucket: b });
          const c = await probe(p, slotId(b, i), PROBE_MS);
          if (cancelled) return;
          if (c) {
            wireConn(c);
            if (handlers.onPeer) handlers.onPeer({ host: false });
            return;
          }
        }
        if (Date.now() > probeUntil) break;
      }

      // Phase 2 — nobody was waiting, so become the one who waits. Whoever
      // queues next will find us here.
      try { p.destroy(); } catch (e) {}
      peer = null;
      const mine = bucketOf(elo);
      for (let i = 1; i <= SLOTS; i++) {
        if (cancelled || Date.now() >= deadline) return finishNone();
        let wp;
        try {
          wp = await newPeer(slotId(mine, i));
        } catch (e) {
          continue;                        // that slot is taken; try the next
        }
        if (cancelled) { try { wp.destroy(); } catch (e) {} return; }
        peer = wp;
        if (handlers.onTick) handlers.onTick({ phase: 'waiting', bucket: mine });
        wp.on('connection', (c) => {
          if (conn) { try { c.close(); } catch (e) {} return; }
          wireConn(c);
          c.on('open', () => { if (handlers.onPeer) handlers.onPeer({ host: true }); });
        });
        await new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())));
        if (cancelled) return;
        if (conn) return;                  // someone arrived while we waited
        return finishNone();
      }
      return finishNone();
    })();

    function finishNone() {
      if (cancelled) return;
      destroy();
      if (handlers.onNoHuman) handlers.onNoHuman();
    }

    return { cancel: () => { cancelled = true; destroy(); } };
  }

  function send(msg) {
    if (!conn || !conn.open) return false;
    try { conn.send(msg); return true; } catch (e) { return false; }
  }

  const connected = () => !!(conn && conn.open);

  // Read a room code out of the URL, if present.
  function roomFromLocation() {
    const m = /[#&]room=([a-z0-9]+)/i.exec(location.hash || '');
    return m ? m[1].toLowerCase() : null;
  }

  window.WCNET = { available, host, join, findHuman, send, connected, destroy, roomFromLocation, makeCode };
})();

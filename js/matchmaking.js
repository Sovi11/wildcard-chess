// Wildcard Chess — matchmaking.
// You never pick an opponent. You queue, and the pool answers: a human if one
// is available, otherwise one of the resident bots rated near you, so the queue
// is never empty. Bots are ordinary members of the pool — same ratings, same
// Elo maths — they simply happen to be running locally.
// Exposed as window.WCMATCH.

(function () {
  'use strict';

  // Plug a real backend in here and humans get preferred automatically.
  // find(elo, cb) must call cb(opponent|null); cancel() must abort cleanly.
  let humanBackend = null;
  function setBackend(b) { humanBackend = b; }
  const hasHumans = () => !!humanBackend;

  const LAST_KEY = 'wildcardchess.lastopp.v1';
  const lastOpponent = () => { try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; } };
  const rememberOpponent = (id) => { try { localStorage.setItem(LAST_KEY, id); } catch (e) {} };

  // How the search band opens up, in rating points, one step per tick.
  const BAND_START = 45;
  const BAND_STEP = 70;
  const TICK_MS = 620;
  const MAX_TICKS = 6;

  // Pick from everyone inside the band, weighted hard toward the closest match.
  // The opponent you just played is damped so you are not fed the same bot twice.
  function pickFromPool(playerElo, band) {
    const pool = WCLADDER.livePool();
    const last = lastOpponent();
    const inBand = pool.filter(b => Math.abs(b.elo - playerElo) <= band);
    const field = inBand.length ? inBand : pool;

    let total = 0;
    const weighted = field.map(b => {
      const gap = Math.abs(b.elo - playerElo);
      let w = Math.exp(-gap / 110);
      if (b.id === last) w *= 0.25;              // avoid instant rematches
      total += w;
      return { bot: b, w };
    });
    if (total <= 0) return field[0] || null;

    let roll = Math.random() * total;
    for (const e of weighted) {
      roll -= e.w;
      if (roll <= 0) return e.bot;
    }
    return weighted[weighted.length - 1].bot;
  }

  // Queue for a game. handlers: { onTick({band, elapsed}), onFound(opponent, isHuman) }
  // Returns a cancel function.
  function find(playerElo, handlers) {
    const h = handlers || {};
    let ticks = 0;
    let cancelled = false;
    let timer = null;
    let humanCancel = null;

    if (humanBackend) {
      try {
        humanCancel = humanBackend.find(playerElo, (opp) => {
          if (cancelled || !opp) return;
          stop();
          if (h.onFound) h.onFound(opp, true);
        });
      } catch (e) {
        humanBackend = null;                      // backend misbehaved: fall back quietly
      }
    }

    function stop() {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof humanCancel === 'function') { try { humanCancel(); } catch (e) {} }
    }

    function step() {
      if (cancelled) return;
      ticks++;
      const band = BAND_START + BAND_STEP * (ticks - 1);
      if (h.onTick) h.onTick({ band, ticks, searchingHumans: hasHumans() });

      // Once the band has opened up, settle for whoever is closest in the pool.
      if (ticks >= MAX_TICKS || (ticks >= 2 && pickFromPool(playerElo, band))) {
        const opp = pickFromPool(playerElo, band);
        if (opp) {
          rememberOpponent(opp.id);
          stop();
          if (h.onFound) h.onFound(opp, false);
          return;
        }
      }
      timer = setTimeout(step, TICK_MS);
    }

    timer = setTimeout(step, TICK_MS);
    return stop;
  }

  window.WCMATCH = { find, pickFromPool, setBackend, hasHumans };
})();

// Hollow Chess — service worker.
// Cache-first for our own static files so the app opens instantly and bot games
// work offline. Everything cross-origin (Supabase, PeerJS broker, CDNs) is left
// alone: auth and matchmaking must always hit the network.

const CACHE = 'hollow-chess-v59';

const CORE = [
  './',
  './index.html',
  './styles.css?v=59',
  './js/config.js?v=59',
  './js/stats.js?v=59',
  './js/cloud.js?v=59',
  './js/engine.js?v=59',
  './js/pieces.js?v=59',
  './js/themes.js?v=59',
  './js/sound.js?v=59',
  './js/tutorial.js?v=59',
  './js/ai.js?v=59',
  './js/ladder.js?v=59',
  './js/matchmaking.js?v=59',
  './js/net.js?v=59',
  './js/share.js?v=59',
  './js/analysis.js?v=59',
  './js/solver.js?v=59',
  './js/puzzles.js?v=59',
  './js/puzzle-data.json?v=59',
  './js/main.js?v=59',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // network only

  // Navigations are network-first so a deploy reaches returning users; the
  // cached copy is only the offline fallback.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Everything else (versioned statics) is cache-first.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});

// Hollow Chess — service worker.
// Cache-first for our own static files so the app opens instantly and bot games
// work offline. Everything cross-origin (Supabase, PeerJS broker, CDNs) is left
// alone: auth and matchmaking must always hit the network.

const CACHE = 'hollow-chess-v32';

const CORE = [
  './',
  './index.html',
  './styles.css?v=32',
  './js/config.js?v=32',
  './js/cloud.js?v=32',
  './js/engine.js?v=32',
  './js/pieces.js?v=32',
  './js/themes.js?v=32',
  './js/sound.js?v=32',
  './js/tutorial.js?v=32',
  './js/ai.js?v=32',
  './js/ladder.js?v=32',
  './js/matchmaking.js?v=32',
  './js/net.js?v=32',
  './js/share.js?v=32',
  './js/analysis.js?v=32',
  './js/main.js?v=32',
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

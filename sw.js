// Hollow Chess — service worker.
// Cache-first for our own static files so the app opens instantly and bot games
// work offline. Everything cross-origin (Supabase, PeerJS broker, CDNs) is left
// alone: auth and matchmaking must always hit the network.
// Also shows the arena reminder when the server pushes one.

const CACHE = 'hollow-chess-v116';

const CORE = [
  './',
  './index.html',
  './styles.css?v=116',
  './js/platform.js?v=116',
  './js/config.js?v=116',
  './js/stats.js?v=116',
  './js/cloud.js?v=116',
  './js/postgame-feedback.js?v=116',
  './js/engine.js?v=116',
  './js/pieces.js?v=116',
  './js/themes.js?v=116',
  './js/sound.js?v=116',
  './js/tutorial.js?v=116',
  './js/ai.js?v=116',
  './js/ladder.js?v=116',
  './js/matchmaking.js?v=116',
  './js/net.js?v=116',
  './js/share.js?v=116',
  './js/analysis.js?v=116',
  './js/solver.js?v=116',
  './js/puzzles.js?v=116',
  './js/puzzle-data.json?v=116',
  './js/main.js?v=116',
  './js/ui.js?v=116',
  './js/native.js?v=116',
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

// ---- push: the arena reminder (supabase/functions/arena-remind) ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Hollow Chess', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/favicon-96.png',
    tag: d.tag || 'hollow-chess',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) return open.focus().then((c) => (c && c.navigate ? c.navigate(url) : null)).catch(() => null);
      return self.clients.openWindow(url);
    })
  );
});

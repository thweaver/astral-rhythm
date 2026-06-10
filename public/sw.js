const CACHE = 'astral-rhythm-v1';

// Only pre-cache the shell HTML — JS/CSS always fetched fresh from network
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.add('/')).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls or audio streams
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for everything — fall back to cache only for the HTML shell
  e.respondWith(
    fetch(e.request).catch(() => caches.match('/'))
  );
});

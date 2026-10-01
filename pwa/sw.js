const CACHE = 'voice-fitness-v28';
const FILES = ['./', './index.html', './styles.css', './neon.css', './app.mjs?v=20261001-21', './db.mjs', './domain.mjs', './parser.mjs', './dictation.mjs', './csv.mjs', './workout-guide.mjs', './progression.mjs', './records.mjs', './rest.mjs', './manifest.webmanifest', './icon.svg', './icon-192.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(async response => {
    if (response.ok) {
      try { const cache = await caches.open(CACHE); await cache.put(event.request, response.clone()); }
      catch { /* A storage limit must not hide a successful network response. */ }
    }
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});

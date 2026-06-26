// 2026-06-26 23:20 KST | 수정: CACHE_NAME v128 (linkedAccounts 백업/복원 포함)
'use strict';

const CACHE_NAME = 'gaegyebu-v128';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './xlsx-js-style.min.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (!e.request.url.startsWith('http')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        const url = new URL(e.request.url);
        const isAsset = ASSETS.some(a => url.pathname.endsWith(a.replace('./', '/'))) ||
                        url.pathname === '/' || url.pathname.endsWith('/');
        if (isAsset && response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

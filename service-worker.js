// 2026-07-05 KST | CACHE_NAME v2087 (totalAssets 이중합산 방지 안전장치)
'use strict';
const CACHE_NAME = 'gaegyebu-v2087';
const ASSETS = ['./', './index.html', './app.js', './xlsx-js-style.min.js', './jspdf.umd.min.js', './html2canvas.min.js', './manifest.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  e.respondWith(caches.match(e.request).then(cached => {
    if (cached) return cached;
    return fetch(e.request).then(response => {
      const url = new URL(e.request.url);
      const isAsset = ASSETS.some(a => url.pathname.endsWith(a.replace('./', '/'))) || url.pathname === '/' || url.pathname.endsWith('/');
      if (isAsset && response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return response;
    });
  }).catch(() => caches.match('./index.html')));
});

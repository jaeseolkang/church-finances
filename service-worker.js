// 2026-09-19 KST | CACHE_NAME v4104 (특정 교회 이름 제거 — "교회회계 프로그램"으로 일괄 표기)
// 캐시 이름에 SW scope(저장소 경로)를 자동 포함시켜, 같은 오리진
// (jaeseolkang.github.io)을 쓰는 여러 교회 저장소가 activate 시
// 서로의 캐시를 지우지 않도록 함. 이 값은 모든 교회 저장소에서
// 그대로 두면 되고, 버전 문자열('v4104')만 배포 시 올리면 됨.
'use strict';
const CACHE_PREFIX = 'gaegyebu-' + self.registration.scope;
const CACHE_NAME = CACHE_PREFIX + '-v4104';
const ASSETS = ['./', './index.html', './app.js', './xlsx-js-style.min.js', './jspdf.umd.min.js', './html2canvas.min.js', './manifest.json'];
// caches.addAll()은 내부적으로 일반 fetch()를 쓰기 때문에 브라우저의 HTTP 캐시를
// 그대로 따른다. 즉 SW 캐시 이름(v4103)을 새로 올려도 서버의 Cache-Control
// 설정에 따라 브라우저가 들고 있던 옛 app.js를 그대로 넘겨줄 수 있음.
// {cache:'reload'}로 각 파일을 직접 fetch해서 HTTP 캐시를 건너뛰고
// 항상 서버 원본을 받아오도록 강제한다.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.all(ASSETS.map(a => fetch(a, { cache: 'reload' }).then(res => c.put(a, res)))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
// 이 scope(내 저장소) 소유의 옛 캐시만 지운다 — CACHE_PREFIX로 시작하지 않는
// 캐시(다른 교회 저장소의 캐시)는 절대 건드리지 않음.
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
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

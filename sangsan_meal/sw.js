const CACHE_NAME = 'sangsan-meal-v5';
const V = '20260527';
const STATIC_ASSETS = [
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  `js/app.js?v=${V}`,
  `js/image-analysis.js?v=${V}`,
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;700;900&family=Space+Mono:wght@400;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

/* ── 설치: 정적 파일 캐시 ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

/* ── 활성화: 이전 캐시 삭제 ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── 요청 처리 전략 ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* 외부 API 요청은 SW가 절대 건드리지 않음 */
  const isExternal =
    url.hostname.includes('neis.go.kr') ||
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('corsproxy.io') ||
    url.hostname.includes('codetabs.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('deepseek.com');

  if (isExternal) return; /* SW 개입 없이 브라우저가 직접 처리 */

  /* 구글 폰트 / CDN → 캐시 우선 */
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  /* JS 파일 → 네트워크 우선 (업데이트 반영), 폴백 캐시 */
  if (url.pathname.endsWith('.js')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  /* 앱 셸 → 캐시 우선, 네트워크 폴백 */
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

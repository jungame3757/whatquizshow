const cacheName = "DefaultCompany-QuizShow-1.0-" + Date.now();
const contentToCache = [
    "Build/WhatQuizShow.loader.js",
    "Build/WhatQuizShow.framework.js",
    "Build/WhatQuizShow.data",
    "Build/WhatQuizShow.wasm",
    "TemplateData/style.css"
];

// 기존 캐시 삭제 함수
async function deleteOldCaches() {
    const cacheNames = await caches.keys();
    const oldCacheNames = cacheNames.filter(name =>
        name.startsWith("DefaultCompany-QuizShow") && name !== cacheName
    );

    return Promise.all(oldCacheNames.map(name => caches.delete(name)));
}

self.addEventListener('install', function (e) {
    console.log('[Service Worker] Install');

    e.waitUntil((async function () {
        await deleteOldCaches(); // 설치 시 이전 캐시 삭제
        const cache = await caches.open(cacheName);
        console.log('[Service Worker] Caching all: app shell and content');
        await cache.addAll(contentToCache);
        await self.skipWaiting(); // 즉시 활성화
    })());
});

self.addEventListener('activate', function(e) {
    console.log('[Service Worker] Activate');
    e.waitUntil((async function() {
        await deleteOldCaches(); // 활성화 시에도 이전 캐시 삭제
        await self.clients.claim(); // 제어권 즉시 획득
    })());
});

self.addEventListener('fetch', function (e) {
    // 네트워크 우선 전략: 항상 네트워크에서 먼저 가져오고 실패할 경우에만 캐시 사용
    e.respondWith((async function () {
        console.log(`[Service Worker] Fetching resource: ${e.request.url}`);

        try {
            // 네트워크에서 리소스 가져오기 시도
            const response = await fetch(e.request, { cache: 'no-store' });

            // 성공하면 캐시 업데이트
            const cache = await caches.open(cacheName);
            console.log(`[Service Worker] Caching new resource: ${e.request.url}`);
            cache.put(e.request, response.clone());

            return response;
        } catch (error) {
            // 네트워크 요청 실패 시 캐시에서 가져오기
            console.log(`[Service Worker] Network request failed, using cache for: ${e.request.url}`);
            const cachedResponse = await caches.match(e.request);
            if (cachedResponse) {
                return cachedResponse;
            }

            // 캐시에도 없으면 오류 표시
            return new Response('Network error, and no cached version available', {
                status: 408,
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    })());
});
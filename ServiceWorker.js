const cacheName = "DefaultCompany-QuizShow-1.0-" + new Date().getTime(); // 타임스탬프 추가
const contentToCache = [
    "Build/WhatQuizShow.loader.js",
    "Build/WhatQuizShow.framework.js",
    "Build/WhatQuizShow.data",
    "Build/WhatQuizShow.wasm",
    "TemplateData/style.css"
];

self.addEventListener('install', function (e) {
    console.log('[Service Worker] Install');

    e.waitUntil((async function () {
        // 이전 캐시 삭제
        const cacheKeys = await caches.keys();
        for (const key of cacheKeys) {
            if (key.startsWith("DefaultCompany-QuizShow")) {
                if (key !== cacheName) {
                    console.log('[Service Worker] Deleting old cache: ' + key);
                    await caches.delete(key);
                }
            }
        }

        const cache = await caches.open(cacheName);
        console.log('[Service Worker] Caching all: app shell and content');
        await cache.addAll(contentToCache);
    })());
});

self.addEventListener('fetch', function (e) {
    // 캐시를 우회하고 항상 네트워크에서 가져오기
    if (e.request.url.includes('WhatQuizShow')) {
        e.respondWith((async function () {
            console.log(`[Service Worker] Fetching resource directly: ${e.request.url}`);
            try {
                // 항상 네트워크에서 새로 가져옴
                const response = await fetch(e.request, { cache: 'no-store' });
                // 새 응답으로 캐시 업데이트
                const cache = await caches.open(cacheName);
                console.log(`[Service Worker] Caching new resource: ${e.request.url}`);
                cache.put(e.request, response.clone());
                return response;
            } catch (err) {
                // 네트워크 요청 실패시 캐시에서 가져옴
                const response = await caches.match(e.request);
                if (response) {
                    return response;
                }
                throw err;
            }
        })());
    } else {
        // 다른 리소스들은 기존 방식대로 처리
        e.respondWith((async function () {
            let response = await caches.match(e.request);
            console.log(`[Service Worker] Fetching resource: ${e.request.url}`);
            if (response) { return response; }

            response = await fetch(e.request);
            const cache = await caches.open(cacheName);
            console.log(`[Service Worker] Caching new resource: ${e.request.url}`);
            cache.put(e.request, response.clone());
            return response;
        })());
    }
});

// 활성화 이벤트에서 이전 캐시 정리
self.addEventListener('activate', function(e) {
    e.waitUntil((async function() {
        const cacheKeys = await caches.keys();
        return Promise.all(cacheKeys
            .filter(key => key.startsWith("DefaultCompany-QuizShow") && key !== cacheName)
            .map(key => {
                console.log('[Service Worker] Removing old cache:', key);
                return caches.delete(key);
            })
        );
    })());
});
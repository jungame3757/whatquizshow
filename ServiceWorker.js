const cacheName = "DefaultCompany-QuizShow-1.0-" + new Date().toISOString();
const contentToCache = [
    "Build/WhatQuizShow.loader.js",
    "Build/WhatQuizShow.framework.js",
    "Build/WhatQuizShow.data",
    "Build/WhatQuizShow.wasm",
    "TemplateData/style.css"
];

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keyList) {
            return Promise.all(keyList.map(function(key) {
                if (key.indexOf("DefaultCompany-QuizShow-1.0") !== -1 && key !== cacheName) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

self.addEventListener('install', function (e) {
    console.log('[Service Worker] Install');

    e.waitUntil((async function () {
        const cache = await caches.open(cacheName);
        console.log('[Service Worker] Caching all: app shell and content');
        await cache.addAll(contentToCache);
    })());
});

self.addEventListener('fetch', function (e) {
    if (e.request.url.includes('WhatQuizShow')) {
        // Unity 관련 파일은 항상 네트워크에서 가져오기
        e.respondWith(
            fetch(e.request).catch(function() {
                return caches.match(e.request);
            })
        );
    } else {
        // 다른 리소스는 기존 방식으로 처리
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
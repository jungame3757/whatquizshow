// 타임스탬프 없이 고정된 캐시 이름 사용 (항상 최신 버전만 유지)
const cacheName = "whatquiz-cache-v1";

// 캐싱할 필수 콘텐츠 목록 (더 포괄적으로 업데이트)
const contentToCache = [
    "/",
    "index.html",
    "Build/WhatQuizShow.loader.js",
    "Build/WhatQuizShow.framework.js",
    "Build/WhatQuizShow.data",
    "Build/WhatQuizShow.wasm",
    "TemplateData/favicon.ico",
    "manifest.webmanifest",
    "StreamingAssets"
];

// 이전 캐시 제거 함수
const clearOldCaches = async () => {
    const cacheList = await caches.keys();
    const oldCaches = cacheList.filter(cache =>
        cache.startsWith("whatquiz-cache") &&
        cache !== cacheName
    );
    console.log('[Service Worker] 이전 캐시 제거:', oldCaches);
    return Promise.all(oldCaches.map(cache => caches.delete(cache)));
};

// 설치 이벤트
self.addEventListener('install', function(e) {
    console.log('[Service Worker] 설치 중');

    // 즉시 활성화
    self.skipWaiting();

    e.waitUntil((async function() {
        try {
            // 이전 캐시 정리
            await clearOldCaches();

            // 새 캐시 생성 및 리소스 저장
            const cache = await caches.open(cacheName);
            console.log('[Service Worker] 콘텐츠 캐싱 중');
            await cache.addAll(contentToCache);
            console.log('[Service Worker] 콘텐츠 캐싱 완료');
        } catch (error) {
            console.error('[Service Worker] 캐싱 중 오류 발생:', error);
        }
    })());
});

// 활성화 이벤트
self.addEventListener('activate', function(e) {
    console.log('[Service Worker] 활성화 중');

    // 모든 클라이언트에 대한 제어권 즉시 확보
    e.waitUntil(clients.claim());

    // 이전 캐시 정리
    e.waitUntil(clearOldCaches());
});

// 네트워크 요청 이벤트
self.addEventListener('fetch', function(e) {
    // 요청 URL 경로 추출 (쿼리 매개변수 제외)
    const requestUrl = new URL(e.request.url);

    // 캐시 무시할 요소 확인 (쿼리 매개변수가 있는 요청은 캐시하지 않음)
    const shouldBypassCache = requestUrl.search.length > 0;

    // 이미 캐시 버스팅 매개변수가 있는지 확인
    const hasCacheBustParam = requestUrl.searchParams.has('v') ||
        requestUrl.searchParams.has('cache-bust');

    // 다음 경우에만 캐싱 전략 적용:
    // 1. GET 요청인 경우
    // 2. 같은 오리진 요청인 경우
    // 3. 캐시 무시 플래그가 false인 경우
    const shouldApplyCachingStrategy =
        e.request.method === 'GET' &&
        requestUrl.origin === location.origin &&
        !shouldBypassCache;

    if (!shouldApplyCachingStrategy) {
        // 캐싱 전략을 적용하지 않는 요청은 기본 fetch로 처리
        return;
    }

    e.respondWith((async function() {
        try {
            // 먼저 캐시 확인
            const cachedResponse = await caches.match(e.request);

            // 캐시에 있고 Unity 파일이 아니면 캐시 반환
            if (cachedResponse && !e.request.url.includes('WhatQuizShow')) {
                console.log(`[Service Worker] 캐시에서 반환: ${e.request.url}`);
                return cachedResponse;
            }

            // 네트워크 요청 생성 (Unity 파일에 대해서는 항상 캐시 버스팅)
            const networkRequestUrl = e.request.url.includes('WhatQuizShow') && !hasCacheBustParam ?
                `${e.request.url}${requestUrl.search ? '&' : '?'}v=${Date.now()}` :
                e.request.url;

            // 네트워크 요청
            console.log(`[Service Worker] 네트워크 요청: ${networkRequestUrl}`);
            const response = await fetch(networkRequestUrl, {
                cache: 'no-store',
                headers: e.request.headers,
                mode: e.request.mode,
                credentials: e.request.credentials
            });

            // 유효한 응답이면 캐시에 저장
            if (response && response.status === 200) {
                const cache = await caches.open(cacheName);
                cache.put(e.request, response.clone());
                console.log(`[Service Worker] 응답 캐싱: ${e.request.url}`);
            }

            return response;
        } catch (error) {
            console.error(`[Service Worker] 네트워크 오류: ${e.request.url}`, error);

            // 네트워크 실패 시 캐시 확인
            const cachedResponse = await caches.match(e.request);
            if (cachedResponse) {
                console.log(`[Service Worker] 오류 후 캐시 사용: ${e.request.url}`);
                return cachedResponse;
            }

            // 최종 폴백
            return new Response('네트워크 연결 실패 및 캐시 없음', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    })());
});

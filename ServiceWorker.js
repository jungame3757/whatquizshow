// 타임스탬프 없이 고정된 캐시 이름 사용 (항상 최신 버전만 유지)
const cacheName = "whatquiz-cache-v2"; // 버전 번호 업데이트

// 캐싱할 필수 콘텐츠 목록 (최소 필수 파일만 나열)
const contentToCache = [
    "/",
    "index.html",
    "manifest.webmanifest",
    "TemplateData/favicon.ico"
];

// Unity 빌드 파일 리스트 (개별적으로 캐싱할 대상)
const unityBuildFiles = [
    "Build/WhatQuizShow.loader.js",
    "Build/WhatQuizShow.framework.js",
    "Build/WhatQuizShow.data",
    "Build/WhatQuizShow.wasm"
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

// 파일 안전하게 캐싱 함수
const cacheFileSafely = async (cache, url) => {
    try {
        // 상대 경로 시도
        await cache.add(url);
        console.log(`[Service Worker] 파일 캐싱 성공: ${url}`);
        return true;
    } catch (error) {
        console.warn(`[Service Worker] 상대 경로 캐싱 실패 (${url}): ${error.message}`);
        
        // 절대 경로 시도 (서브 디렉토리에 배포된 경우를 위해)
        try {
            // GitHub Pages 경로 패턴 가정
            const basePath = self.registration.scope;
            const absoluteUrl = new URL(url, basePath).href;
            
            if (absoluteUrl !== url) {
                await cache.add(absoluteUrl);
                console.log(`[Service Worker] 절대 경로 캐싱 성공: ${absoluteUrl}`);
                return true;
            }
        } catch (err) {
            console.warn(`[Service Worker] 절대 경로 캐싱 실패: ${err.message}`);
        }
        
        return false;
    }
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

            // 새 캐시 생성
            const cache = await caches.open(cacheName);
            console.log('[Service Worker] 콘텐츠 캐싱 중');
            
            // 필수 콘텐츠 개별 캐싱 (실패해도 계속 진행)
            for (const url of contentToCache) {
                await cacheFileSafely(cache, url);
            }
            
            // Unity 빌드 파일 개별 캐싱 시도 (덜 중요함)
            for (const url of unityBuildFiles) {
                try {
                    await cacheFileSafely(cache, url);
                } catch (err) {
                    console.warn(`[Service Worker] Unity 파일 캐싱 건너뜀: ${url}`);
                }
            }
            
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
            const networkRequestUrl = e.request.url.includes('WhatQuizShow') ?
                `${e.request.url}${requestUrl.search ? '&' : '?'}v=${Date.now()}` :
                e.request.url;

            // 네트워크 요청
            console.log(`[Service Worker] 네트워크 요청: ${networkRequestUrl}`);
            try {
                const response = await fetch(networkRequestUrl, {
                    cache: 'no-store',
                    headers: e.request.headers,
                    mode: e.request.mode === 'no-cors' ? 'no-cors' : 'cors',
                    credentials: e.request.credentials
                });

                // 유효한 응답이면 캐시에 저장
                if (response && response.status === 200) {
                    const cache = await caches.open(cacheName);
                    cache.put(e.request, response.clone());
                    console.log(`[Service Worker] 응답 캐싱: ${e.request.url}`);
                }

                return response;
            } catch (networkError) {
                console.error(`[Service Worker] 네트워크 오류: ${e.request.url}`, networkError);
                
                // 네트워크 실패 시 캐시 재확인 (다른 버전일 수 있음)
                const cachedResponse = await caches.match(e.request);
                if (cachedResponse) {
                    console.log(`[Service Worker] 오류 후 캐시 사용: ${e.request.url}`);
                    return cachedResponse;
                }
                
                // 최종 폴백 - 정적 파일만 한정
                if (e.request.url.endsWith('.js') || 
                    e.request.url.endsWith('.wasm') || 
                    e.request.url.endsWith('.data')) {
                    
                    console.log(`[Service Worker] 정적 파일 요청 실패, 폴백 사용: ${e.request.url}`);
                    // 실패한 정적 요청을 위한 빈 응답
                    return new Response('', {
                        status: 200,
                        headers: {'Content-Type': 'application/javascript'}
                    });
                }

                // 일반 폴백 응답
                return new Response('네트워크 연결 실패 및 캐시 없음', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain' }
                });
            }
        } catch (error) {
            console.error(`[Service Worker] 요청 처리 오류: ${e.request.url}`, error);
            
            // 최종 폴백
            return new Response('서비스 워커 오류: ' + error.message, {
                status: 500,
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    })());
});

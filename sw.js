const CACHE_NAME = 'nasdaq-dca-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // 使用相对路径尝试缓存基本框架。忽略可能的404（例如icon.png还没放）
                return cache.addAll(urlsToCache).catch(err => console.log('部分资源缓存失败，不影响主流程', err));
            })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    // 对于 data.json，总是倾向于从网络获取最新数据
    if (event.request.url.includes('data.json')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // 对于其他静态资源，采用 stale-while-revalidate 策略
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                    }
                    return networkResponse;
                }).catch(() => {
                    // 忽略网络加载失败
                });

                // 如果缓存里有就立刻返回缓存，同时后台静默更新缓存
                return response || fetchPromise;
            })
    );
});

self.addEventListener('activate', event => {
    // 清理旧缓存
    const cacheAllowlist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheAllowlist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

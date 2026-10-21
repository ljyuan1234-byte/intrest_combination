const CACHE_NAME = 'life-assistant-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// 不做离线缓存：所有请求都直接走网络，避免把登录后的私人数据写进缓存。
self.addEventListener('fetch', () => {});

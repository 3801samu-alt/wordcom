const CACHE_NAME = 'vocab-app-v1';

// スマホに取り込みたいファイルの一覧
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    './icon-512.png'
];

// ① インストール時にスマホ本体へダウンロード
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] ファイルをスマホに保存中...');
            return cache.addAll(urlsToCache);
        })
    );
});

// ② アプリ起動時はスマホの中のデータ（キャッシュ）を優先して使う
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});
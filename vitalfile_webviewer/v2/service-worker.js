/**
 * Service Worker for Vital File Viewer
 * Enables offline functionality
 */

// Cache name - update this version when resources change
const CACHE_NAME = 'vital-viewer-cache-v1';

// Resources to cache
const RESOURCES_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/static/css/style.css',
    '/static/css/font-awesome/css/font-awesome.min.css',
    '/static/css/font-awesome/fonts/fontawesome-webfont.woff2',
    '/static/css/font-awesome/fonts/fontawesome-webfont.woff',
    '/static/css/font-awesome/fonts/fontawesome-webfont.ttf',
    '/static/js/jquery.min.js',
    '/static/js/bootstrap.min.js',
    '/static/js/pako.min.js',
    '/static/js/app.js',
    '/static/js/file-handler.js',
    '/static/js/vital-file.js',
    '/static/js/vital-file-manager.js',
    '/static/js/track-view.js',
    '/static/js/monitor-view.js',
    '/static/js/ui-controller.js',
    '/static/js/constants.js',
    '/static/js/utils.js',
    '/static/img/logo-white.png'
];

// Install event - cache resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app resources');
                return cache.addAll(RESOURCES_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache if available
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached response if found
                if (response) {
                    return response;
                }

                // Clone the request
                const fetchRequest = event.request.clone();

                // Make network request
                return fetch(fetchRequest).then(response => {
                    // Check if we received a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    // Cache the response
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            // Don't cache .vital files
                            if (!event.request.url.endsWith('.vital')) {
                                cache.put(event.request, responseToCache);
                            }
                        });

                    return response;
                });
            })
    );
});
// Service Worker untuk PWA - Versi Sederhana
const CACHE_NAME = "organisasi-app-v3";

// Install event - cache resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll([
          "/css/output.css",
          "/js/api.js",
          "/js/theme.js",
          "/js/responsive.js",
        ]);
      })
      .catch(() => {
        // Silently fail
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - hanya handle static resources yang sudah di-cache
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Skip HTML pages - biarkan browser handle
  const url = new URL(event.request.url);
  const isHtmlPage =
    event.request.destination === "document" ||
    event.request.headers.get("accept")?.includes("text/html");

  if (isHtmlPage) {
    return;
  }

  // Skip external domains
  if (url.origin !== self.location.origin) {
    return;
  }

  // Hanya handle static resources yang sudah di-cache
  const isStaticResource =
    url.pathname.includes("/css/") ||
    url.pathname.includes("/js/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js");

  if (!isStaticResource) {
    return;
  }

  // Cache-first strategy untuk static resources
  // Hanya intercept jika ada di cache, jika tidak biarkan browser handle
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      // Jika tidak ada cache, biarkan browser handle (fetch langsung)
      return fetch(event.request).then((response) => {
        // Cache response yang berhasil untuk next time
        if (response && response.ok && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});

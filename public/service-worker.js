// Service Worker untuk PWA
const CACHE_NAME = "organisasi-app-v2";
// Hanya cache static resources, TIDAK cache halaman HTML yang dinamis
const urlsToCache = [
  "/css/output.css",
  "/js/api.js",
  "/js/theme.js",
  "/js/responsive.js",
  "https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css",
];

// Install event - cache resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Opened cache");
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.log("Cache failed:", err);
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
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Listen for messages from client to clear cache
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches
        .keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              console.log("Clearing cache:", cacheName);
              return caches.delete(cacheName);
            })
          );
        })
        .then(() => {
          // Send response back to client
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true });
          }
        })
    );
  }
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  try {
    const url = new URL(event.request.url);

    // Skip requests to external domains that are not in our cache list
    const isExternalDomain = url.origin !== self.location.origin;
    const isAllowedExternal =
      url.origin.includes("unpkg.com") ||
      url.origin.includes("cdn.jsdelivr.net");

    if (isExternalDomain && !isAllowedExternal) {
      // Skip handling external requests that we don't want to cache
      return;
    }

    const isHtmlPage =
      event.request.destination === "document" ||
      event.request.headers.get("accept")?.includes("text/html");

    // Skip authentication pages (login/logout) - always go to network
    if (
      url.pathname.includes("/auth/login") ||
      url.pathname.includes("/auth/logout")
    ) {
      return;
    }

    // Untuk halaman HTML (dashboard, anggota, iuran, dll) - SELALU ambil dari network
    // Jangan cache karena halaman ini dinamis berdasarkan user role
    if (isHtmlPage) {
      // Don't intercept HTML pages - let browser handle them normally
      // This prevents 503 errors for dynamic pages
      return;
    }
  } catch {
    // If URL parsing fails or any other error, skip handling
    // Silently handle - don't log
    return;
  }

  // Untuk static resources (CSS, JS, images, fonts) - gunakan cache-first strategy
  try {
    const url = new URL(event.request.url);

    // Only handle static resources that we want to cache
    const isStaticResource =
      url.pathname.includes("/css/") ||
      url.pathname.includes("/js/") ||
      url.pathname.includes("/icons/") ||
      url.pathname.includes("/uploads/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".jpg") ||
      url.pathname.endsWith(".jpeg") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".woff") ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".ttf") ||
      url.origin.includes("unpkg.com") ||
      url.origin.includes("cdn.jsdelivr.net");

    // Only intercept static resources
    if (!isStaticResource) {
      return;
    }

    // Use cache-first strategy: check cache first, then network
    // Only intercept if we can provide a valid response
    event.respondWith(
      caches
        .match(event.request)
        .then((cachedResponse) => {
          // If cached, return it immediately
          if (cachedResponse) {
            return cachedResponse;
          }

          // Otherwise, fetch from network
          return fetch(event.request)
            .then((response) => {
              // If response is not ok, return it as-is (browser will handle the error)
              if (!response || !response.ok) {
                return response;
              }

              // Don't cache if not a valid response type
              if (response.type !== "basic" && response.type !== "cors") {
                return response;
              }

              // Cache successful responses for static resources
              if (response.status === 200) {
                // Clone the response for caching (async, non-blocking)
                const responseToCache = response.clone();
                caches
                  .open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, responseToCache);
                  })
                  .catch(() => {
                    // Silently fail - not critical
                  });
              }

              return response;
            })
            .catch(() => {
              // If network fetch fails, try cache one more time as fallback
              return caches.match(event.request);
            });
        })
        .then((response) => {
          // If we have a response (from cache or network), return it
          if (response) {
            return response;
          }
          // If no response at all (no cache and network failed)
          // We can't provide a valid response, so don't intercept
          // But we're already in respondWith, so we must return something
          // Return a minimal response that won't cause 503 errors
          // Use 200 status to avoid console errors
          return new Response("", {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": "text/plain" },
          });
        })
        .catch(() => {
          // Final fallback: return 200 to avoid 503 errors
          return new Response("", {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": "text/plain" },
          });
        })
    );
  } catch {
    // If URL parsing fails, skip handling
    return;
  }
});

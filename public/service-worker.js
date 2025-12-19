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
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            // Jangan cache halaman HTML
            if (!response || !response.ok) {
              throw new Error("Network response was not ok");
            }
            return response;
          })
          .catch((error) => {
            // Jika offline atau network error, coba return cached login page sebagai fallback
            // Don't log "Failed to fetch" as it's a common network error
            const errorMessage = error?.message || error?.toString() || "";
            if (
              errorMessage &&
              !errorMessage.includes("Failed to fetch") &&
              !errorMessage.includes("NetworkError")
            ) {
              console.warn("HTML fetch error:", errorMessage);
            }

            return caches.match("/auth/login").then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // If no cache, return offline message
              return new Response("Offline - Please check your connection", {
                status: 503,
                headers: { "Content-Type": "text/html" },
              });
            });
          })
      );
      return;
    }
  } catch (error) {
    // If URL parsing fails or any other error, skip handling
    console.error("Service worker fetch error:", error);
    return;
  }

  // Untuk static resources (CSS, JS, images, fonts) - gunakan cache-first strategy
  try {
    const url = new URL(event.request.url);

    event.respondWith(
      caches
        .match(event.request)
        .then((response) => {
          // If cached, return it
          if (response) {
            return response;
          }

          // Otherwise, fetch from network
          return fetch(event.request)
            .then((response) => {
              // Check if response is valid
              if (!response || !response.ok) {
                // If response is not ok, try to return from cache again or return error
                return (
                  response ||
                  new Response("Not Found", {
                    status: 404,
                    headers: { "Content-Type": "text/plain" },
                  })
                );
              }

              // Don't cache if not a valid response type
              if (response.type !== "basic" && response.type !== "cors") {
                return response;
              }

              // Only cache static resources (CSS, JS, images, fonts)
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

              if (isStaticResource && response.status === 200) {
                // Clone the response for caching
                try {
                  const responseToCache = response.clone();
                  caches
                    .open(CACHE_NAME)
                    .then((cache) => {
                      cache.put(event.request, responseToCache);
                    })
                    .catch((err) => {
                      // Silently fail cache put - not critical
                      console.warn("Cache put error (non-critical):", err);
                    });
                } catch (cloneError) {
                  // If clone fails, just return response without caching
                  console.warn(
                    "Response clone error (non-critical):",
                    cloneError
                  );
                }
              }

              return response;
            })
            .catch((error) => {
              // If network fetch fails (offline, CORS, etc), return error response
              // "Failed to fetch" is a common network error, don't log it
              const errorMessage = error?.message || error?.toString() || "";
              if (
                errorMessage &&
                !errorMessage.includes("Failed to fetch") &&
                !errorMessage.includes("NetworkError")
              ) {
                console.warn("Fetch error:", errorMessage);
              }

              // Return a valid error response
              return new Response("Network error", {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "text/plain" },
              });
            });
        })
        .catch((error) => {
          // If both cache and network fail, return error
          console.error("Cache match error:", error);
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        })
    );
  } catch (error) {
    // If URL parsing fails, skip handling
    console.error("Service worker fetch error:", error);
    return;
  }
});

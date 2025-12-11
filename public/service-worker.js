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

  const url = new URL(event.request.url);
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
          return response;
        })
        .catch(() => {
          // Jika offline, coba return cached login page sebagai fallback
          return caches.match("/auth/login").catch(() => {
            return new Response("Offline - Please check your connection", {
              status: 503,
              headers: { "Content-Type": "text/html" },
            });
          });
        })
    );
    return;
  }

  // Untuk static resources (CSS, JS, images, fonts) - gunakan cache-first strategy
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        // If cached, return it
        if (response) {
          return response;
        }

        // Otherwise, fetch from network
        return fetch(event.request).then((response) => {
          // Don't cache if not a valid response
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
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

          if (isStaticResource) {
            // Clone the response for caching
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, return error
        return new Response("Offline", { status: 503 });
      })
  );
});

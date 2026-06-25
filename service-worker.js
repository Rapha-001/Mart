const CACHE_NAME = "unimart-v15";

const assetsToCache = [
  "./",
  "./index.html",
  "./offline.html",
  "./style.css",
  "./manifest.json",
  "./app.js",
  "./firebase.js",
  "./cloudinary.js",
  "./marketplace.js",
  "./auth.js",
  "./inbox.js",
  "./notifications.js",
  "./dashboard.js",
  "./ui.js",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(assetsToCache))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.origin === self.location.origin && (request.destination === "document" || request.mode === "navigate")) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("./offline.html");
          return cached || caches.match("./index.html");
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        const cached = caches.match(request);
        return cached.then(match => match || caches.match("./offline.html"));
      })
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", event => {
  const payload = event.data ? event.data.json() : null;
  const title = payload?.title || "UniMart";
  const options = {
    body: payload?.body || "You have a new update",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: payload?.data || {}
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("./index.html");
      }
    })
  );
});

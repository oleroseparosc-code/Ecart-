const CACHE_NAME = "hospital-inventory-app-v40";
const APP_SHELL = [
  "/Ecart-/inventory/",
  "/Ecart-/viewer/",
  "/Ecart-/pharmacy-viewer/",
  "/Ecart-/pharmacy-label-editor/",
  "/Ecart-/pharmacy-label-editor/v2/",
  "/Ecart-/pharmacy-drug-locator/",
  "/Ecart-/narcotic-viewer/",
  "/Ecart-/manifest.webmanifest?v=20260713a",
  "/Ecart-/viewer.webmanifest?v=20260713a",
  "/Ecart-/pharmacy-viewer.webmanifest?v=20260713a",
<<<<<<< HEAD
  "/Ecart-/pharmacy-label-editor.webmanifest?v=20260814e",
  "/Ecart-/pharmacy-drug-locator.webmanifest?v=20260814f",
=======
  "/Ecart-/pharmacy-label-editor.webmanifest?v=20260814f",
  "/Ecart-/pharmacy-drug-locator.webmanifest?v=20260814b",
>>>>>>> 4091d5d (Deploy app update)
  "/Ecart-/narcotic-viewer.webmanifest?v=20260713a",
  "/Ecart-/icons/app-icon-192.png?v=20260713a",
  "/Ecart-/icons/app-icon-desktop-512.png?v=20260713a",
  "/Ecart-/icons/viewer-icon-192.png?v=20260713a",
  "/Ecart-/icons/viewer-icon-desktop-512.png?v=20260713a",
  "/Ecart-/icons/narcotic-icon-192.png?v=20260713a",
  "/Ecart-/icons/narcotic-icon-desktop-512.png?v=20260713a",
  "/Ecart-/icons/pharmacy-drug-locator-icon-192.png?v=20260814b",
  "/Ecart-/icons/pharmacy-drug-locator-icon-512.png?v=20260814b",
  "/Ecart-/icons/pharmacy-label-editor-icon-192.png?v=20260814f",
  "/Ecart-/icons/pharmacy-label-editor-icon-512.png?v=20260814f",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.pathname.includes("/api/")) return;

  if (url.pathname.endsWith("/sync-config.json") || url.pathname.includes("/app-state/") || url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/Ecart-/inventory/")));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});

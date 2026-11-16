// Service worker: la app abre al instante y funciona sin conexión.
// Subí la versión cada vez que cambies archivos para forzar la actualización.
const VERSION = "habitos-v2";
const CORE = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/store.js", "js/sound.js", "js/icons.js", "js/dates.js", "js/config.js",
  "vendor/supabase.js", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca cachear la API de Supabase
  if (url.hostname.endsWith("supabase.co") || url.pathname.includes("/auth/") || url.pathname.includes("/rest/")) return;
  // Archivos propios: red primero (para tener siempre lo último), caché si no hay conexión
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
    );
    return;
  }
  // Fuentes de Google: caché primero
  if (url.hostname.includes("fonts.g")) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
  }
});

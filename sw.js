/*
 * sw.js — Service Worker
 * Uygulama kabuğunu önbelleğe alır; ikinci açılıştan itibaren tamamen
 * çevrimdışı çalışır. Whisper model dosyalarına dokunmaz (transformers.js
 * onları zaten kendi Cache Storage alanında saklar).
 */
const CACHE_VERSION = "tymm-v1";

const PRECACHE = [
  "./",
  "index.html",
  "app.html",
  "styles.css",
  "landing.css",
  "app.js",
  "audio.js",
  "rubric.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("tymm-") && k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Whisper model/CDN istekleri: SW karışmaz (transformers.js kendi önbelleğini kullanır)
  if (url.hostname.includes("huggingface") || url.hostname.includes("hf.co")) return;

  // Google Fonts: cache-first (çevrimdışında da yazı tipleri çalışsın)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(CACHE_VERSION).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Aynı origin: önbellekten hızlı yanıt + arkaplanda tazele (stale-while-revalidate)
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(async (c) => {
        const hit = await c.match(e.request);
        const refresh = fetch(e.request)
          .then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; })
          .catch(() => null);
        return hit || refresh.then((r) => r || caches.match("app.html"));
      })
    );
  }
});

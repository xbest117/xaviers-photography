/* Service worker: makes the site installable and lets it open offline.
   Keep VERSION matching SITE_VERSION in index.html. Changing it is what
   tells installed copies that an update is available. */
const VERSION = "1.8.2";
const SHELL = `xp-shell-${VERSION}`;
const IMAGES = "xp-images";
const FONTS = "xp-fonts";
const MAX_IMAGES = 150;
const ASSETS = ["./", "./index.html", "./config.js", "./demo.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png", "./icons/logo.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("xp-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

async function trim(cacheName, max){
  const c = await caches.open(cacheName), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The site's own files: try the network first (so edits show up), fall back to the saved copy offline.
  if (url.origin === location.origin){
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch (err){
        return (await caches.match(req, { ignoreSearch: true })) ||
               (req.mode === "navigate" ? caches.match("./index.html") : Response.error());
      }
    })());
    return;
  }

  // Photos from Google Drive / Sites: keep recently viewed ones for offline browsing.
  if (/(^|\.)googleusercontent\.com$/.test(url.hostname)){
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        const c = await caches.open(IMAGES); c.put(req, res.clone()); trim(IMAGES, MAX_IMAGES);
        return res;
      } catch (err){ return Response.error(); }
    })());
    return;
  }

  // Fonts: serve saved copy, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith((async () => {
      const c = await caches.open(FONTS), hit = await c.match(req);
      const net = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
  }
  // Everything else (the Google Sheet, Drive/Calendar API) goes straight to the network.
  // Your content is also saved in the browser, so the site still shows it offline.
});

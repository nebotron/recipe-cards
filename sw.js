// Bypasses the browser's HTTP cache for this site. GitHub Pages serves every
// file with a 10-minute max-age that can't be changed, so without this an
// edit can take that long to show up. Every same-origin GET goes straight to
// the network; nothing is ever stored.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: "no-store" }));
});

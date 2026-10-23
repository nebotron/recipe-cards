// Registers sw.js, which keeps the browser from serving stale copies of the
// site's files (see sw.js).
(function () {
  if (!("serviceWorker" in navigator)) return;
  // Site root, resolved from this script's own URL (it lives in assets/).
  var root = new URL("../", document.currentScript.src).href;
  navigator.serviceWorker.register(root + "sw.js").catch(function () {});
})();

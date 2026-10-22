// Renders one recipe card. Shared by 404.html, which serves pretty URLs like
// /recipe-cards/<slug> on GitHub Pages, and recipe.html?r=<slug>, which works
// on any static server.
(function () {
  // Site root, resolved from this script's own URL (it lives in assets/).
  var root = new URL("../", document.currentScript.src).href;
  var card = document.getElementById("card");
  var slug = new URLSearchParams(location.search).get("r") ||
    location.pathname.replace(/\/+$/, "").split("/").pop().replace(/\.html$/, "");
  if (!/^[a-z0-9-]+$/.test(slug)) {
    card.innerHTML = "<p class=\"error\">No recipe selected.</p>";
    return;
  }
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  // Keep the screen on while a recipe is showing. The browser drops the lock
  // whenever the tab is hidden, so take it again when the tab comes back.
  function keepAwake() {
    if (!("wakeLock" in navigator)) return;
    function request() {
      if (document.visibilityState === "visible") {
        navigator.wakeLock.request("screen").catch(function () {});
      }
    }
    request();
    document.addEventListener("visibilitychange", request);
  }
  fetch(root + "recipes/" + slug + ".yaml").then(function (r) {
    if (r.status === 404) throw new Error("No recipe named \"" + slug + "\".");
    if (!r.ok) throw new Error("recipes/" + slug + ".yaml: HTTP " + r.status);
    return r.text();
  }).then(function (text) {
    var data = jsyaml.load(text);
    Recent.touch(slug);
    document.title = data.title || slug;
    var html = TRN.render(data);
    if (data.notes && data.notes.length) {
      html += "<div class=\"notes\"><p>" + data.notes.map(esc).join("</p><p>") + "</p></div>";
    }
    if (data.source) {
      var src = /^https?:\/\//.test(data.source)
        ? "<a href=\"" + esc(data.source) + "\">" + esc(data.source) + "</a>" : esc(data.source);
      html += "<p class=\"source\">Source: " + src + "</p>";
    }
    card.innerHTML = html;
    keepAwake();
  }).catch(function (e) {
    card.innerHTML = "<p class=\"error\">" + esc(e.message) + "</p>";
  });
})();

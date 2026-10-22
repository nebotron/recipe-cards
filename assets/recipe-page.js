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
  // Tapping a quantity (data-qty) shows it in other units in a popup.
  // Tapping outside the popup, or its close button, dismisses it.
  function showConversionsOnTap() {
    var dialog = document.createElement("dialog");
    dialog.className = "info-popup";
    dialog.innerHTML = "<div class=\"body\"></div><form method=\"dialog\"><button>Close</button></form>";
    document.body.appendChild(dialog);
    var body = dialog.querySelector(".body");
    card.addEventListener("click", function (e) {
      var button = e.target.closest("button.qty");
      if (!button) return;
      var qty = button.getAttribute("data-qty");
      body.innerHTML = "<p class=\"qty-from\">" + esc(qty) + " =</p><ul class=\"conversions\">" +
        Units.convert(Units.parse(qty)).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") +
        "</ul>";
      dialog.showModal();
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
  }
  // Tapping an ingredient or step cell marks it done (or not done again). The
  // marks are kept by cell position, so they survive re-rendering on rescale.
  var done = {};
  function markDone() {
    card.querySelectorAll("table.trn td").forEach(function (td, i) {
      td.setAttribute("data-cell", i);
      td.classList.toggle("done", !!done[i]);
    });
  }
  function doneOnTap() {
    card.addEventListener("click", function (e) {
      if (e.target.closest("button, a")) return;
      var td = e.target.closest("table.trn td");
      if (!td) return;
      var i = td.getAttribute("data-cell");
      done[i] = !done[i];
      td.classList.toggle("done", done[i]);
    });
  }
  // The shopping list: one line per ingredient, "amount ingredient", at the
  // current scale. Prep is left off, since it's about cooking, not buying. An
  // ingredient split across steps is listed once with its amounts joined.
  function shoppingList(data, scale) {
    var items = [], byName = {};
    (function walk(node) {
      if (node.inputs) { node.inputs.forEach(walk); return; }
      var name = String(node.ingredient), key = name.toLowerCase();
      if (!byName[key]) { byName[key] = { name: name, amounts: [] }; items.push(byName[key]); }
      if (node.amount != null && node.amount !== "") byName[key].amounts.push(TRN.scaleText(node.amount, scale));
    })(data.recipe);
    return items.map(function (it) {
      return (it.amounts.length ? it.amounts.join(" + ") + " " : "") + it.name;
    }).join("\n");
  }
  // The share button hands the shopping list to the phone's share sheet, so it
  // can go straight to a list app like AnyList, which adds each line as its
  // own item. Only the list is shared, not the title, so the title doesn't
  // become an item too. Without the share sheet, it copies the list instead.
  function shareOnTap(data, getScale) {
    var button = card.querySelector("button.share");
    var status = card.querySelector(".share-status");
    function say(msg) {
      status.textContent = msg;
      clearTimeout(say.timer);
      say.timer = setTimeout(function () { status.textContent = ""; }, 3000);
    }
    function copy(text) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      ta.remove();
      return ok ? Promise.resolve() : Promise.reject(new Error("copy failed"));
    }
    button.addEventListener("click", function () {
      var text = shoppingList(data, getScale());
      var shared = navigator.share && (!navigator.canShare || navigator.canShare({ text: text }))
        ? navigator.share({ text: text }).catch(function (e) {
          if (e.name !== "AbortError") return copy(text).then(function () { say("Copied ingredients"); });
        })
        : copy(text).then(function () { say("Copied ingredients"); });
      shared.catch(function () { say("Couldn't share or copy"); });
    });
  }
  var SCALES = [[0.5, "\u00bd\u00d7"], [1, "1\u00d7"], [1.5, "1\u00bd\u00d7"], [2, "2\u00d7"], [3, "3\u00d7"]];
  // The scale buttons multiply every amount and the yield, then re-render the
  // table. The chosen scale stays in the URL (?x=2) so a reload keeps it.
  var currentScale = 1;
  function scaleOnTap(data) {
    var table = card.querySelector(".table");
    var buttons = card.querySelectorAll(".scale button");
    function apply(scale) {
      currentScale = scale;
      table.innerHTML = TRN.render(data, scale);
      markDone();
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-scale")) === scale));
      });
    }
    card.querySelector(".scale").addEventListener("click", function (e) {
      var button = e.target.closest("button");
      if (!button) return;
      var scale = Number(button.getAttribute("data-scale"));
      var params = new URLSearchParams(location.search);
      if (scale === 1) params.delete("x"); else params.set("x", scale);
      var query = params.toString();
      history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
      apply(scale);
    });
    var initial = Number(new URLSearchParams(location.search).get("x"));
    apply(initial > 0 ? initial : 1);
  }
  fetch(root + "recipes/" + slug + ".yaml").then(function (r) {
    if (r.status === 404) throw new Error("No recipe named \"" + slug + "\".");
    if (!r.ok) throw new Error("recipes/" + slug + ".yaml: HTTP " + r.status);
    return r.text();
  }).then(function (text) {
    var data = jsyaml.load(text);
    Recent.touch(slug);
    document.title = data.title || slug;
    var html = "<div class=\"scale\" role=\"group\" aria-label=\"Scale recipe\">Scale:" +
      SCALES.map(function (x) {
        return " <button type=\"button\" data-scale=\"" + x[0] + "\">" + x[1] + "</button>";
      }).join("") + "</div><div class=\"share\"><button type=\"button\" class=\"share\">" +
      "Share ingredients</button> <span class=\"share-status\" role=\"status\"></span></div>" +
      "<div class=\"table\"></div>";
    if (data.source) {
      var src = /^https?:\/\//.test(data.source)
        ? "<a href=\"" + esc(data.source) + "\">" + esc(data.source) + "</a>" : esc(data.source);
      html += "<p class=\"source\">Source: " + src + "</p>";
    }
    card.innerHTML = html;
    scaleOnTap(data);
    shareOnTap(data, function () { return currentScale; });
    doneOnTap();
    showConversionsOnTap();
    keepAwake();
  }).catch(function (e) {
    card.innerHTML = "<p class=\"error\">" + esc(e.message) + "</p>";
  });
})();

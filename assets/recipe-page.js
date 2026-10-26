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
  // The parsed recipe. The editor (editor.js) can replace it.
  var data;
  // While editing, taps edit cells instead of marking them done or showing
  // conversions.
  function editing() {
    return card.classList.contains("editing");
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
      if (!button || editing()) return;
      var qty = button.getAttribute("data-qty"), q = Units.parse(qty);
      var dens = Units.density(button.getAttribute("data-ingredient"));
      function list(items) {
        return "<ul class=\"conversions\">" + items.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>";
      }
      var html = "<p class=\"qty-from\">" + esc(qty) + " =</p>" + list(Units.convert(q));
      var cross = dens ? Units.convert(q, dens) : [];
      if (cross.length) {
        html += "<p class=\"density\">As " + (q.unit && /^(oz|lb|g|kg)$/.test(q.unit) ? "volume" : "weight") +
          ", for " + esc(dens.name) + " (" + esc(dens.basis) + ")" +
          " <a class=\"info\" href=\"" + esc(dens.source) + "\" target=\"_blank\" rel=\"noopener\"" +
          " title=\"Source: King Arthur Baking ingredient weight chart\"" +
          " aria-label=\"Source: King Arthur Baking ingredient weight chart\">i</a>:</p>" + list(cross);
      }
      body.innerHTML = html;
      dialog.showModal();
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
  }
  // Tapping an ingredient or step cell marks it done (or not done again). The
  // marks are kept by the cell's place in the tree, so they survive
  // re-rendering on rescale.
  var done = {};
  function markDone() {
    card.querySelectorAll("table.trn td").forEach(function (td) {
      td.classList.toggle("done", !!done[td.getAttribute("data-path")]);
    });
  }
  function doneOnTap() {
    card.addEventListener("click", function (e) {
      if (editing() || e.target.closest("button, a")) return;
      var td = e.target.closest("table.trn td");
      if (!td) return;
      var i = td.getAttribute("data-path");
      done[i] = !done[i];
      td.classList.toggle("done", done[i]);
    });
  }
  // The shopping list: one line per ingredient, "amount ingredient", at the
  // current scale. Ingredients marked done are left out. Prep is left off,
  // since it's about cooking, not buying. An ingredient split across steps is
  // listed once with its amounts joined.
  function shoppingList(scale) {
    // Each ingredient has its own row, in the same depth-first order as the
    // tree, so the nth ingredient cell belongs to the nth ingredient.
    var cells = card.querySelectorAll("table.trn td.i");
    var items = [], byName = {}, n = 0;
    (function walk(node) {
      if (node.inputs) { node.inputs.forEach(walk); return; }
      if (cells[n++].classList.contains("done")) return;
      var name = String(node.ingredient), key = name.toLowerCase();
      if (!byName[key]) { byName[key] = { name: name, amounts: [] }; items.push(byName[key]); }
      if (node.amount != null && node.amount !== "") byName[key].amounts.push(TRN.scaleText(node.amount, scale));
    })(data.recipe);
    return items.map(function (it) {
      return (it.amounts.length ? it.amounts.join(" + ") + " " : "") + it.name;
    });
  }
  // The copy button puts the shopping list on the clipboard, one item per
  // line, so it can be pasted into a list app like AnyList, which adds each
  // line as its own item.
  function copyOnTap() {
    var button = card.querySelector("button.copy");
    var status = card.querySelector(".copy-status");
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
      var items = shoppingList(currentScale);
      if (!items.length) { say("Every ingredient is marked done"); return; }
      copy(items.join("\n")).then(function () {
        say("Copied " + items.length + (items.length === 1 ? " ingredient" : " ingredients"));
      }, function () { say("Couldn't copy"); });
    });
  }
  var SCALES = [[0.5, "½×"], [1, "1×"], [1.5, "1½×"], [2, "2×"], [3, "3×"]];
  var currentScale = 1;
  // Draws the table at the current scale, plus the title and source, from data.
  function render() {
    document.title = data.title || slug;
    card.querySelector(".table").innerHTML = TRN.render(data, currentScale);
    markDone();
    card.querySelectorAll(".scale button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-scale")) === currentScale));
    });
    var source = card.querySelector(".source");
    source.hidden = !data.source;
    source.innerHTML = !data.source ? "" : "Source: " + (/^https?:\/\//.test(data.source)
      ? "<a href=\"" + esc(data.source) + "\">" + esc(data.source) + "</a>" : esc(data.source));
  }
  // The scale buttons multiply every amount and the yield, then re-render the
  // table. The chosen scale stays in the URL (?x=2) so a reload keeps it.
  function setScale(scale) {
    var params = new URLSearchParams(location.search);
    if (scale === 1) params.delete("x"); else params.set("x", scale);
    var query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
    currentScale = scale;
    render();
  }
  function scaleOnTap() {
    card.querySelector(".scale").addEventListener("click", function (e) {
      var button = e.target.closest("button");
      if (button) setScale(Number(button.getAttribute("data-scale")));
    });
    var initial = Number(new URLSearchParams(location.search).get("x"));
    currentScale = initial > 0 ? initial : 1;
  }
  fetch(root + "recipes/" + slug + ".yaml", { cache: "no-store" }).then(function (r) {
    if (r.status === 404) throw new Error("No recipe named \"" + slug + "\".");
    if (!r.ok) throw new Error("recipes/" + slug + ".yaml: HTTP " + r.status);
    return r.text();
  }).then(function (text) {
    data = jsyaml.load(Editor.latest(slug, text));
    Recent.touch(slug);
    card.innerHTML = "<div class=\"scale\" role=\"group\" aria-label=\"Scale recipe\">Scale:" +
      SCALES.map(function (x) {
        return " <button type=\"button\" data-scale=\"" + x[0] + "\">" + x[1] + "</button>";
      }).join("") + "</div><div class=\"copy\"><button type=\"button\" class=\"copy\">" +
      "Copy ingredients</button> <span class=\"copy-status\" role=\"status\"></span></div>" +
      "<div class=\"table\"></div><p class=\"source\"></p>";
    scaleOnTap();
    render();
    copyOnTap();
    doneOnTap();
    showConversionsOnTap();
    keepAwake();
    Editor.attach({
      card: card,
      slug: slug,
      getData: function () { return data; },
      setData: function (d) { data = d; done = {}; render(); },
      setScale: setScale
    });
  }).catch(function (e) {
    card.innerHTML = "<p class=\"error\">" + esc(e.message) + "</p>";
  });
})();

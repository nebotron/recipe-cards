// Renders a recipe (parsed from YAML) as a tabular recipe notation table.
//
// Layout rules:
//   - Every ingredient gets one row, in depth-first order of the tree.
//   - An ingredient sits in column 0; a step sits one column right of its
//     right-most input.
//   - A cell spans the rows of all ingredients beneath it, and spans
//     columns until its parent step's column (the root spans one column).
(function () {
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isStep(node) {
    return node && typeof node === "object" && "step" in node;
  }

  // A longer note shown inline at the bottom of its cell.
  function infoHtml(info) {
    return info ? "<div class=\"note\">" + esc(info) + "</div>" : "";
  }

  // Formats n as a mixed number in eighths or thirds ("1-1/2", "2/3"), the way
  // the cards write amounts, falling back to a decimal.
  function formatQty(n) {
    var whole = Math.floor(n + 1e-9), frac = n - whole;
    var best = null;
    [2, 3, 4, 8].forEach(function (d) {
      var k = Math.round(frac * d);
      if (!best && Math.abs(frac - k / d) < 0.02) best = [k, d];
    });
    if (!best) return String(Math.round(n * 100) / 100);
    if (best[0] === best[1]) { whole++; best[0] = 0; }
    if (!best[0]) return String(whole);
    return (whole ? whole + "-" : "") + best[0] + "/" + best[1];
  }

  // Multiplies each quantity in text by scale: whole numbers, decimals,
  // fractions and mixed numbers like "1-1/2". A number joined to a unit by a
  // hyphen ("8-oz. packages") is a size, not a count, so it stays as is.
  function scaleText(text, scale) {
    if (scale === 1 || text == null) return text;
    return String(text).replace(/(\d+-)?(\d+(?:\.\d+)?)(?:\/(\d+))?(?![\d.\/]|-[a-z])/gi,
      function (m, whole, num, den, offset, str) {
        if (/[\d.\/-]/.test(str.charAt(offset - 1) || "")) return m;
        var n = (whole ? parseInt(whole, 10) : 0) + (den ? num / den : parseFloat(num));
        return formatQty(n * scale);
      });
  }

  // The amount's leading quantity, if it converts to other units, becomes a
  // tappable button that shows the conversions (see recipe-page.js). The
  // ingredient name goes along so the popup can convert volume to weight.
  // An amount may list the same quantity in other units in parentheses, as
  // in "213 g (7-1/2 oz.; 1 cup)". The card shows only one of them,
  // preferring volume, and the popup lists the rest (data-alts).
  function amountHtml(amount, ingredient) {
    var q = window.Units && Units.parse(amount);
    if (!q) return esc(amount);
    var text = String(amount);
    var rest = text.slice(text.indexOf(q.text) + q.text.length);
    var alts = [q.text], shown = q;
    var m = /^\s*\(([^)]*)\)/.exec(rest);
    if (m) {
      var parts = m[1].split(";").map(function (p) { return p.trim(); });
      var parsed = parts.map(function (p) { var a = Units.parse(p); return a && a.text === p ? a : null; });
      if (parsed.every(Boolean)) {
        alts = alts.concat(parts);
        rest = rest.slice(m[0].length);
        shown = [q].concat(parsed).filter(function (a) { return a.kind === "volume"; })[0] || q;
      }
    }
    var others = alts.filter(function (a) { return a !== shown.text; });
    return "<button type=\"button\" class=\"qty\" data-qty=\"" + esc(shown.text) + "\" data-ingredient=\"" + esc(ingredient) + "\"" +
      (others.length ? " data-alts=\"" + esc(others.join(";")) + "\"" : "") + ">" + esc(shown.text) + "</button>" + esc(rest);
  }

  // The amount and name lead the cell; the amount never breaks across lines.
  // Prep goes on its own smaller line below, like a step's detail, so long
  // prep notes wrap within the cell instead of widening the table.
  function ingredientHtml(node, scale) {
    var amount = scaleText(node.amount, scale);
    return (amount != null && amount !== "" ? "<span class=\"amt\">" + amountHtml(amount, node.ingredient) + "</span> " : "") +
      esc(node.ingredient) +
      (node.prep ? "<div class=\"detail\">" + esc(node.prep) + "</div>" : "") +
      infoHtml(node.info);
  }

  // Annotate each node with col, rows (leaf count), firstRow and key, the
  // node's position in the tree ("recipe.0.2" is the root's first input's
  // third input). Cells carry the key as data-path, so a tap can find its node.
  function measure(node, path, cells, key) {
    if (isStep(node)) {
      var inputs = node.inputs || [];
      if (!inputs.length) throw new Error("step '" + node.step + "' at " + path + " has no inputs");
      var col = 0, rows = 0;
      var children = inputs.map(function (child, i) {
        var m = measure(child, path + ".inputs[" + i + "]", cells, key + "." + i);
        col = Math.max(col, m.col + 1);
        rows += m.rows;
        return m;
      });
      var cell = { node: node, key: key, col: col, rows: rows, firstRow: children[0].firstRow, children: children };
      cells.push(cell);
      return cell;
    }
    if (!node || typeof node !== "object" || !node.ingredient) {
      throw new Error("input at " + path + " must have either 'step' or 'ingredient'");
    }
    var leaf = { node: node, key: key, col: 0, rows: 1, firstRow: cells.leafCount++, children: [] };
    cells.push(leaf);
    return leaf;
  }

  // scale (default 1) multiplies ingredient amounts and the yield.
  function render(recipe, scale) {
    scale = scale || 1;
    if (!recipe || !recipe.recipe) throw new Error("missing top-level 'recipe'");
    var cells = [];
    cells.leafCount = 0;
    var root = measure(recipe.recipe, "recipe", cells, "recipe");

    // Set each cell's colspan from its parent's column.
    root.span = 1;
    cells.forEach(function (c) {
      c.children.forEach(function (m) { m.span = c.col - m.col; });
    });

    var byRow = [];
    for (var r = 0; r < cells.leafCount; r++) byRow.push([]);
    cells.forEach(function (c) { byRow[c.firstRow].push(c); });

    var html = "<table class=\"trn\"><tr><th data-path=\"title\" colspan=\"" + (root.col + 1) + "\">" + esc(recipe.title || "") +
      (recipe.yield ? " <span class=\"yield\">(" + esc(scaleText(recipe.yield, scale)) + ")</span>" : "") +
      infoHtml(recipe.info) + "</th></tr>";
    byRow.forEach(function (row) {
      row.sort(function (a, b) { return a.col - b.col; });
      html += "<tr>";
      row.forEach(function (c) {
        var attrs = " data-path=\"" + c.key + "\"" + (c.rows > 1 ? " rowspan=\"" + c.rows + "\"" : "") + (c.span > 1 ? " colspan=\"" + c.span + "\"" : "");
        if (isStep(c.node)) {
          html += "<td class=\"a\"" + attrs + ">" + esc(c.node.step) +
            (c.node.detail ? "<div class=\"detail\">" + esc(c.node.detail) + "</div>" : "") + "</td>";
        } else {
          html += "<td class=\"i\"" + attrs + ">" + ingredientHtml(c.node, scale) + "</td>";
        }
      });
      html += "</tr>";
    });
    html += "</table>";
    return html;
  }

  window.TRN = { render: render, scaleText: scaleText };
})();

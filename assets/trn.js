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

  function ingredientText(node) {
    var text = [node.amount, node.ingredient].filter(Boolean).join(" ");
    if (node.prep) text += ", " + node.prep;
    return text;
  }

  // Annotate each node with col, rows (leaf count) and firstRow.
  function measure(node, path, cells) {
    if (isStep(node)) {
      var inputs = node.inputs || [];
      if (!inputs.length) throw new Error("step '" + node.step + "' at " + path + " has no inputs");
      var col = 0, rows = 0;
      var children = inputs.map(function (child, i) {
        var m = measure(child, path + ".inputs[" + i + "]", cells);
        col = Math.max(col, m.col + 1);
        rows += m.rows;
        return m;
      });
      var cell = { node: node, col: col, rows: rows, firstRow: children[0].firstRow, children: children };
      cells.push(cell);
      return cell;
    }
    if (!node || typeof node !== "object" || !node.ingredient) {
      throw new Error("input at " + path + " must have either 'step' or 'ingredient'");
    }
    var leaf = { node: node, col: 0, rows: 1, firstRow: cells.leafCount++, children: [] };
    cells.push(leaf);
    return leaf;
  }

  function render(recipe) {
    if (!recipe || !recipe.recipe) throw new Error("missing top-level 'recipe'");
    var cells = [];
    cells.leafCount = 0;
    var root = measure(recipe.recipe, "recipe", cells);

    // Set each cell's colspan from its parent's column.
    root.span = 1;
    cells.forEach(function (c) {
      c.children.forEach(function (m) { m.span = c.col - m.col; });
    });

    var byRow = [];
    for (var r = 0; r < cells.leafCount; r++) byRow.push([]);
    cells.forEach(function (c) { byRow[c.firstRow].push(c); });

    var html = "<table class=\"trn\"><tr><th colspan=\"" + (root.col + 1) + "\">" + esc(recipe.title || "") +
      (recipe.yield ? " <span class=\"yield\">(" + esc(recipe.yield) + ")</span>" : "") + "</th></tr>";
    byRow.forEach(function (row) {
      row.sort(function (a, b) { return a.col - b.col; });
      html += "<tr>";
      row.forEach(function (c) {
        var attrs = (c.rows > 1 ? " rowspan=\"" + c.rows + "\"" : "") + (c.span > 1 ? " colspan=\"" + c.span + "\"" : "");
        if (isStep(c.node)) {
          html += "<td class=\"a\"" + attrs + ">" + esc(c.node.step) +
            (c.node.detail ? "<div class=\"detail\">" + esc(c.node.detail) + "</div>" : "") + "</td>";
        } else {
          html += "<td class=\"i\"" + attrs + ">" + esc(ingredientText(c.node)) + "</td>";
        }
      });
      html += "</tr>";
    });
    html += "</table>";
    return html;
  }

  window.TRN = { render: render };
})();

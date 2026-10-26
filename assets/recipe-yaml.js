// Writes a recipe back to YAML in the same style as the hand-written files,
// and checks it against the schema (the same checks as scripts/validate.py).
//
// Style: top-level keys first, then a blank line and the recipe tree. Steps
// are block maps; ingredients are one-line flow maps. Values are quoted only
// when they wouldn't read back as the same string.
(function () {
  var TOP_KEYS = ["title", "yield", "source", "info"];
  var STEP_KEYS = ["step", "detail", "info", "inputs"];
  var INGREDIENT_KEYS = ["amount", "ingredient", "prep", "info"];

  function isStep(node) {
    return node && typeof node === "object" && "step" in node;
  }

  function has(node, key) {
    return node[key] != null && node[key] !== "";
  }

  // A value can go unquoted if js-yaml reads it back unchanged. Numbers like
  // "1" may stay plain, since the renderer shows them the same either way.
  // scripts/validate.py uses PyYAML, which follows YAML 1.1 and so also reads
  // yes/no/on/off as booleans and 1:30 as a number; those get quoted too.
  function plain(s, flow) {
    if (!s || s !== s.trim() || /[\n\r\t]/.test(s)) return false;
    if (/^(y|n|yes|no|on|off|true|false|null|~)$/i.test(s)) return false;
    if (/^[-+]?[\d_]+(:[0-5]?\d)+(\.\d*)?$/.test(s)) return false;
    try {
      var v = jsyaml.load(flow ? "{ k: " + s + " }" : "k: " + s).k;
      return v === s || (typeof v === "number" && String(v) === s);
    } catch (e) {
      return false;
    }
  }

  function scalar(value, flow) {
    var s = String(value);
    return plain(s, flow) ? s : JSON.stringify(s);
  }

  function ingredientLine(node) {
    return "{ " + INGREDIENT_KEYS.filter(function (k) { return has(node, k); }).map(function (k) {
      return k + ": " + scalar(node[k], true);
    }).join(", ") + " }";
  }

  // first is the prefix for the step's first line ("  - " in a list), rest
  // the prefix for its other lines.
  function writeStep(node, first, rest, out) {
    var prefix = first;
    ["step", "detail", "info"].forEach(function (k) {
      if (!has(node, k)) return;
      out.push(prefix + k + ": " + scalar(node[k], false));
      prefix = rest;
    });
    out.push(prefix + "inputs:");
    node.inputs.forEach(function (child) {
      if (isStep(child)) writeStep(child, rest + "  - ", rest + "    ", out);
      else out.push(rest + "  - " + ingredientLine(child));
    });
  }

  function dump(data) {
    var out = [];
    TOP_KEYS.forEach(function (k) {
      if (has(data, k)) out.push(k + ": " + scalar(data[k], false));
    });
    out.push("", "recipe:");
    writeStep(data.recipe, "  ", "  ", out);
    return out.join("\n") + "\n";
  }

  // Returns a list of problems, empty if the recipe is valid.
  function validate(data) {
    var errors = [];
    function extra(node, allowed) {
      return Object.keys(node).filter(function (k) { return allowed.indexOf(k) === -1; });
    }
    function check(node, path) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        errors.push(path + ": expected a mapping");
      } else if ("step" in node) {
        var bad = extra(node, STEP_KEYS);
        if (bad.length) errors.push(path + ": unknown step keys " + bad.join(", "));
        if (!has(node, "step")) errors.push(path + ": step needs a label");
        if (!Array.isArray(node.inputs) || !node.inputs.length) {
          errors.push(path + ": step needs a non-empty 'inputs' list");
        } else {
          node.inputs.forEach(function (child, i) { check(child, path + ".inputs[" + i + "]"); });
        }
      } else if ("ingredient" in node) {
        var badI = extra(node, INGREDIENT_KEYS);
        if (badI.length) errors.push(path + ": unknown ingredient keys " + badI.join(", "));
        if (!has(node, "ingredient")) errors.push(path + ": ingredient needs a name");
      } else {
        errors.push(path + ": needs either 'step' or 'ingredient'");
      }
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return ["top level must be a mapping"];
    var bad = extra(data, TOP_KEYS.concat("recipe"));
    if (bad.length) errors.push("unknown top-level keys " + bad.join(", "));
    if (!has(data, "title")) errors.push("missing 'title'");
    if (!("recipe" in data)) errors.push("missing 'recipe'");
    else if (!isStep(data.recipe)) errors.push("'recipe' must be a step (the final step)");
    else check(data.recipe, "recipe");
    return errors;
  }

  window.RecipeYAML = { dump: dump, validate: validate, isStep: isStep };
})();

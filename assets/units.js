// Parses recipe amounts like "1-1/2 cup" or "1 to 1-1/2 lb." and converts
// them to other units of the same kind (volume or weight), and, for common
// ingredients with a known density, between volume and weight.
(function () {
  // Each unit's size in ml (volume) or g (weight).
  var UNITS = {
    tsp: { kind: "volume", size: 4.92892, label: "tsp.", min: 1 / 8, max: 16 },
    tbs: { kind: "volume", size: 14.7868, label: "Tbs.", min: 1 / 3, max: 32 },
    cup: { kind: "volume", size: 236.588, label: "cup", plural: "cups", min: 1 / 8, max: 64 },
    stick: { kind: "volume", size: 118.294 },
    floz: { kind: "volume", size: 29.5735, label: "fl. oz.", min: 1 / 2, max: 64 },
    ml: { kind: "volume", size: 1, label: "ml", metric: true },
    l: { kind: "volume", size: 1000, label: "l", metric: true },
    oz: { kind: "weight", size: 28.3495, label: "oz.", min: 1 / 8, max: 64 },
    lb: { kind: "weight", size: 453.592, label: "lb.", min: 1 / 8, max: 64 },
    g: { kind: "weight", size: 1, label: "g", metric: true },
    kg: { kind: "weight", size: 1000, label: "kg", metric: true }
  };
  var ALIASES = {
    tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp",
    tbs: "tbs", tbsp: "tbs", tbsps: "tbs", tablespoon: "tbs", tablespoons: "tbs",
    cup: "cup", cups: "cup", c: "cup",
    stick: "stick", sticks: "stick",
    "fl oz": "floz", "fl. oz": "floz",
    ml: "ml", milliliter: "ml", milliliters: "ml",
    l: "l", liter: "l", liters: "l",
    oz: "oz", ounce: "oz", ounces: "oz",
    lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
    g: "g", gram: "g", grams: "g",
    kg: "kg", kilogram: "kg", kilograms: "kg"
  };
  // Units to offer for each kind, in display order.
  var TARGETS = { volume: ["tsp", "tbs", "cup", "floz", "ml", "l"], weight: ["oz", "lb", "g", "kg"] };

  // Grams per cup of common ingredients, from King Arthur Baking's ingredient
  // weight chart. The first entry whose pattern matches the ingredient name
  // wins, so more specific names come first ("brown sugar" before "sugar").
  // name is the chart's row; per is the chart's volume, to cite it as listed.
  var SOURCE = "https://www.kingarthurbaking.com/learn/ingredient-weight-chart";
  var CUP = 236.588;
  var DENSITIES = [
    [/\bbuttermilk\b/, "buttermilk", 227, "1 cup"],
    [/\bpeanut butter\b/, "peanut butter", 135, "1/2 cup"],
    [/\bbutter\b/, "butter", 113, "1/2 cup"],
    [/\bcream cheese\b/, null],
    [/\bsour cream\b/, "sour cream", 227, "1 cup"],
    [/\b(heavy |light |whipping )?cream\b|\bhalf[- &and]+half\b/, "cream", 227, "1 cup"],
    [/\bevaporated milk\b/, "evaporated milk", 113, "1/2 cup"],
    [/\bmilk\b/, "milk", 227, "1 cup"],
    [/\byogh?urt\b/, "yogurt", 227, "1 cup"],
    [/\bwater\b/, "water", 227, "1 cup"],
    [/\bolive oil\b/, "olive oil", 50, "1/4 cup"],
    [/\b(vegetable|canola|neutral|grapeseed|sunflower|corn) oil\b/, "vegetable oil", 198, "1 cup"],
    [/\bhoney\b/, "honey", 21, "1 Tbs."],
    [/\bmaple syrup\b/, "maple syrup", 156, "1/2 cup"],
    [/\bmolasses\b/, "molasses", 85, "1/4 cup"],
    [/\bbrown sugar\b/, "brown sugar (packed)", 213, "1 cup"],
    [/\b(confectioners'?|powdered|icing) sugar\b/, "confectioners' sugar", 113, "1 cup"],
    [/^(granulated |white |cane )?sugar\b/, "granulated sugar", 198, "1 cup"],
    [/\bwhole[- ]wheat flour\b/, "whole wheat flour", 113, "1 cup"],
    [/^(all-purpose |unbleached |bread |cake )*flour\b/, "all-purpose flour", 120, "1 cup"],
    [/\bcocoa\b/, "cocoa (unsweetened)", 42, "1/2 cup"],
    [/\bcornstarch\b/, "cornstarch", 28, "1/4 cup"],
    [/\bpolenta\b/, "polenta", 163, "1 cup"],
    [/\bcornmeal\b/, "cornmeal", 138, "1 cup"],
    [/\b(rolled|old-fashioned|quick) oats\b|^oats\b/, "oats (old-fashioned)", 89, "1 cup"],
    [/\bmorton\b.*\bsalt\b|\bsalt\b.*\bmorton\b/, "kosher salt (Morton's)", 16, "1 Tbs."],
    [/\bkosher salt\b/, "kosher salt (Diamond Crystal)", 8, "1 Tbs."],
    [/^(table |fine )?salt\b/, "table salt", 18, "1 Tbs."],
    [/\bbaking powder\b/, "baking powder", 4, "1 tsp."],
    [/\bbaking soda\b/, "baking soda", 3, "1/2 tsp."],
    [/\bparmesan\b/, "grated Parmesan", 50, "1/2 cup"],
    [/\bmini chocolate chips\b/, "mini chocolate chips", 177, "1 cup"],
    [/\bchocolate chips\b/, "chocolate chips", 170, "1 cup"]
  ];
  var PER = { "1 cup": 1, "1/2 cup": 1 / 2, "1/4 cup": 1 / 4, "1 Tbs.": 1 / 16, "1 tsp.": 1 / 48, "1/2 tsp.": 1 / 96 };

  // Returns { name, gramsPerMl, basis, source } for an ingredient name, or
  // null if its density isn't known. basis is the chart's figure, e.g.
  // "1 cup = 120 g".
  function density(ingredient) {
    var name = String(ingredient || "").toLowerCase().trim();
    for (var i = 0; i < DENSITIES.length; i++) {
      var d = DENSITIES[i];
      if (!d[0].test(name)) continue;
      if (!d[1]) return null;
      return { name: d[1], gramsPerMl: d[2] / (PER[d[3]] * CUP), basis: d[3] + " = " + d[2] + " g", source: SOURCE };
    }
    return null;
  }

  var NUM = "(\\d+(?:-\\d+/\\d+|/\\d+|\\.\\d+)?)";
  var AMOUNT = new RegExp("^\\s*" + NUM + "(?:\\s*(?:to|–|-)\\s*" + NUM + ")?\\s*(fl\\.? oz|[a-z]+)\\.?(?=$|[\\s(,])", "i");

  function number(s) {
    var m = /^(\d+)-(\d+)\/(\d+)$/.exec(s);
    if (m) return +m[1] + m[2] / m[3];
    m = /^(\d+)\/(\d+)$/.exec(s);
    if (m) return m[1] / m[2];
    return parseFloat(s);
  }

  // Returns { text, low, high, unit } for a convertible amount, else null.
  function parse(amount) {
    var m = AMOUNT.exec(String(amount || ""));
    if (!m) return null;
    var unit = ALIASES[m[3].toLowerCase().replace(/\s+/, " ")];
    if (!unit) return null;
    return { text: m[0].trim(), low: number(m[1]), high: m[2] ? number(m[2]) : null, unit: unit };
  }

  // Nearest eighth or third, as [numerator, denominator] in lowest terms.
  function nearest(x) {
    var best = [Math.round(x), 1];
    [2, 3, 4, 8].forEach(function (d) {
      var n = Math.round(x * d);
      if (Math.abs(n / d - x) < Math.abs(best[0] / best[1] - x) - 1e-9) best = [n, d];
    });
    return best;
  }

  // Written the way the cards write it ("1-1/2").
  function fraction(x) {
    var f = nearest(x), whole = Math.floor(f[0] / f[1]), rest = f[0] % f[1];
    if (!rest) return String(whole);
    return (whole ? whole + "-" : "") + rest + "/" + f[1];
  }

  function metric(x) {
    if (x < 10) return String(Math.round(x * 10) / 10);
    if (x < 100) return String(Math.round(x));
    return String(Math.round(x / 5) * 5);
  }

  // Formats a value in a unit, or returns null if it would read badly there
  // (e.g. 1/64 cup or 48 tsp.).
  function format(x, u) {
    if (u.metric) return (u.size === 1 ? x >= 0.5 && x < 1000 : x >= 1) ? metric(x) : null;
    if (x < u.min * 0.98 || x > u.max) return null;
    return fraction(x);
  }

  function round(x, u) {
    if (u.metric) return +metric(x);
    var f = nearest(x);
    return f[0] / f[1];
  }

  // Lists the amount in every other unit of its kind that reads sensibly.
  // Given a density from density(), lists it in units of the other kind
  // (weight for a volume, volume for a weight) instead. Those are always
  // marked approximate, since how an ingredient packs varies.
  function convert(q, dens) {
    var from = UNITS[q.unit];
    var values = q.high == null ? [q.low] : [q.low, q.high];
    var kind = from.kind, factor = 1;
    if (dens) {
      kind = from.kind === "volume" ? "weight" : "volume";
      factor = from.kind === "volume" ? dens.gramsPerMl : 1 / dens.gramsPerMl;
    }
    var out = [];
    TARGETS[kind].forEach(function (key) {
      // Fluid ounces of a weighed ingredient read too much like ounces.
      if (key === q.unit || (dens && key === "floz")) return;
      var u = UNITS[key];
      var parts = [], approx = !!dens;
      for (var i = 0; i < values.length; i++) {
        var x = values[i] * from.size * factor / u.size, text = format(x, u);
        if (text == null) return;
        if (Math.abs(round(x, u) - x) > x * 0.02) approx = true;
        parts.push(text);
      }
      var last = values[values.length - 1] * from.size * factor / u.size;
      var label = u.plural && round(last, u) > 1 ? u.plural : u.label;
      out.push((approx ? "≈ " : "") + parts.join("–") + " " + label);
    });
    return out;
  }

  window.Units = { parse: parse, convert: convert, density: density };
})();

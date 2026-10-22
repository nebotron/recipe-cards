// Parses recipe amounts like "1-1/2 cup" or "1 to 1-1/2 lb." and converts
// them to other units of the same kind (volume or weight).
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
  function convert(q) {
    var from = UNITS[q.unit];
    var values = q.high == null ? [q.low] : [q.low, q.high];
    var out = [];
    TARGETS[from.kind].forEach(function (key) {
      if (key === q.unit) return;
      var u = UNITS[key];
      var parts = [], approx = false;
      for (var i = 0; i < values.length; i++) {
        var x = values[i] * from.size / u.size, text = format(x, u);
        if (text == null) return;
        if (Math.abs(round(x, u) - x) > x * 0.02) approx = true;
        parts.push(text);
      }
      var last = values[values.length - 1] * from.size / u.size;
      var label = u.plural && round(last, u) > 1 ? u.plural : u.label;
      out.push((approx ? "≈ " : "") + parts.join("–") + " " + label);
    });
    return out;
  }

  window.Units = { parse: parse, convert: convert };
})();

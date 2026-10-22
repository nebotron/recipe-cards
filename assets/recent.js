// Tracks when each recipe was last opened, in this browser's localStorage.
(function () {
  var KEY = "recipe-cards:last-accessed";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function touch(slug) {
    var times = load();
    times[slug] = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(times));
    } catch (e) {}
  }

  window.Recent = { load: load, touch: touch };
})();

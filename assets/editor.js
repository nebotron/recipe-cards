// Edits a recipe card in place and saves it to GitHub as a commit on main.
//
// "Edit recipe" under a card turns on edit mode. Tapping a cell then opens a
// form for that step, ingredient or title, with buttons that move, add, wrap,
// unwrap or delete it. The table re-renders after every change. Save writes
// recipes/<slug>.yaml through the GitHub contents API, using a fine-grained
// personal access token with Contents: Read and write on this repository
// only. The token stays in this browser (localStorage, or memory only if
// "Remember" is off) and is sent only to api.github.com.
//
// Unsaved edits are kept as a draft in localStorage, so a reload or a closed
// tab doesn't lose them.
(function () {
  var REPO = "nebotron/recipe-cards", BRANCH = "main";
  var TOKEN_KEY = "recipe-cards:github-token";
  var DRAFT_KEY = "recipe-cards:draft:";
  var SAVED_KEY = "recipe-cards:saved:";
  // How long GitHub Pages may take to publish a save.
  var PAGES_LAG = 10 * 60 * 1000;

  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }
  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  var token = load(TOKEN_KEY);

  // The contents API sends and takes files as base64 of their UTF-8 bytes.
  function encode(text) {
    var bin = "";
    new TextEncoder().encode(text).forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function decode(base64) {
    var bin = atob(base64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }

  // Calls the contents API for recipes/<slug>.yaml. Rejects with an Error
  // whose status is the HTTP status (0 if GitHub couldn't be reached).
  function github(method, slug, body) {
    var url = "https://api.github.com/repos/" + REPO + "/contents/recipes/" + slug + ".yaml" +
      (method === "GET" ? "?ref=" + BRANCH : "");
    return fetch(url, {
      method: method,
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) {
        if (r.ok) return json;
        var err = new Error(json.message || "HTTP " + r.status);
        err.status = r.status;
        throw err;
      });
    }, function () {
      var err = new Error("Couldn't reach GitHub.");
      err.status = 0;
      throw err;
    });
  }

  // GitHub Pages takes a minute or so to publish a save. Until it has, show
  // the saved text rather than the stale copy Pages still serves.
  function latest(slug, text) {
    var saved = load(SAVED_KEY + slug);
    if (saved && Date.now() - saved.time < PAGES_LAG && saved.text !== text) return saved.text;
    store(SAVED_KEY + slug, null);
    return text;
  }

  var isStep = RecipeYAML.isStep;

  // page: { card, slug, getData, setData(data), setScale(scale) } from
  // recipe-page.js.
  function attach(page) {
    var card = page.card, slug = page.slug;
    var data, baseText, baseSha, undo = [], editing = false, saving = false;

    var link = document.createElement("p");
    link.className = "edit-link";
    link.innerHTML = "<button type=\"button\" class=\"link\">Edit recipe</button>";
    card.appendChild(link);

    var bar = document.createElement("div");
    bar.className = "editbar";
    bar.hidden = true;
    bar.innerHTML = "<div class=\"edit-buttons\">" +
      "<button type=\"button\" data-bar=\"save\" class=\"primary\">Save</button>" +
      "<button type=\"button\" data-bar=\"undo\">Undo</button>" +
      "<button type=\"button\" data-bar=\"yaml\">YAML</button>" +
      "<button type=\"button\" data-bar=\"done\">Done</button>" +
      "<button type=\"button\" data-bar=\"forget\" class=\"link\">Forget token</button></div>" +
      "<p class=\"edit-status\" role=\"status\">Tap a cell to change it.</p>";
    card.insertBefore(bar, card.querySelector(".table"));
    var status = bar.querySelector(".edit-status");

    var dialog = document.createElement("dialog");
    dialog.className = "edit-popup";
    document.body.appendChild(dialog);
    // Set while the dialog edits a node: { node, isNew, applied }.
    var current = null;

    function say(msg) {
      status.textContent = msg;
    }
    function dirty() {
      return RecipeYAML.dump(data) !== baseText;
    }
    function updateBar() {
      bar.querySelector("[data-bar=undo]").disabled = !undo.length;
      bar.querySelector("[data-bar=save]").disabled = saving || !dirty();
      bar.querySelector("[data-bar=forget]").hidden = !token;
    }
    // After any change: re-render, keep the draft, update the buttons.
    function changed() {
      page.setData(data);
      store(DRAFT_KEY + slug, dirty() ? { text: RecipeYAML.dump(data), sha: baseSha, time: Date.now() } : null);
      updateBar();
    }
    // Runs fn, which changes data, and adds an undo step if anything changed.
    function mutate(fn) {
      var before = JSON.stringify(data);
      fn();
      if (JSON.stringify(data) === before) return false;
      undo.push(before);
      changed();
      return true;
    }
    function undoLast() {
      if (!undo.length) return;
      data = JSON.parse(undo.pop());
      changed();
    }

    // "title" is the header; "recipe.0.2" is the root's first input's third.
    function nodeAt(path) {
      if (path === "title") return data;
      return path.split(".").slice(1).reduce(function (node, i) { return node.inputs[Number(i)]; }, data.recipe);
    }
    // The step that node is an input of, and its index there; null for the root.
    function locate(node) {
      var found = null;
      (function walk(step) {
        step.inputs.forEach(function (child, i) {
          if (child === node) found = { parent: step, index: i };
          else if (!found && isStep(child)) walk(child);
        });
      })(data.recipe);
      return found;
    }
    function replace(node, replacement) {
      if (node === data.recipe) { data.recipe = replacement; return; }
      var at = locate(node);
      at.parent.inputs[at.index] = replacement;
    }
    // Every step outside node's own subtree, in table order, for "Move into".
    function targets(node) {
      var out = [];
      (function walk(step, depth) {
        if (step === node) return;
        out.push({ step: step, depth: depth });
        step.inputs.forEach(function (child) { if (isStep(child)) walk(child, depth + 1); });
      })(data.recipe, 0);
      return out;
    }

    var FIELDS = {
      title: [["title", "Title", true], ["yield", "Yield"], ["source", "Source (URL, book or person)"], ["info", "Note", "area"]],
      step: [["step", "Step", true], ["detail", "Detail"], ["info", "Note", "area"]],
      ingredient: [["amount", "Amount"], ["ingredient", "Ingredient", true], ["prep", "Prep"], ["info", "Note", "area"]]
    };

    // Opens the form for node. isNew marks a node just added with a
    // placeholder label; cancelling the form takes it back out.
    function openEditor(node, isNew) {
      var kind = node === data ? "title" : isStep(node) ? "step" : "ingredient";
      var fields = FIELDS[kind];
      var at = kind === "title" ? null : locate(node);
      var isRoot = node === data.recipe;
      current = { node: node, isNew: isNew, applied: false };

      var html = "<form><h2>" + (isNew ? "New " : "Edit ") + (kind === "title" ? "title" : kind) + "</h2>";
      fields.forEach(function (f) {
        var value = isNew ? "" : node[f[0]] == null ? "" : String(node[f[0]]);
        html += "<label>" + esc(f[1]) + (f[2] === "area"
          ? "<textarea name=\"" + f[0] + "\" rows=\"3\">" + esc(value) + "</textarea>"
          : "<input type=\"text\" name=\"" + f[0] + "\" value=\"" + esc(value) + "\"" + (f[2] ? " required" : "") + ">") +
          "</label>";
      });
      var actions = [];
      if (at && at.index > 0) actions.push(["up", "Move up"]);
      if (at && at.index < at.parent.inputs.length - 1) actions.push(["down", "Move down"]);
      if (at) actions.push(["add-after", "Add ingredient below"]);
      if (kind === "step") actions.push(["add-into", "Add ingredient to step"]);
      if (kind !== "title") actions.push(["wrap", "Add step after this"]);
      if (kind === "step" && node.inputs.length === 1 && (!isRoot || isStep(node.inputs[0]))) {
        actions.push(["unwrap", "Remove step, keep its input"]);
      }
      if (at) actions.push(["delete", "Delete"]);
      if (!isNew && actions.length) {
        html += "<div class=\"actions\">" + actions.map(function (a) {
          return "<button type=\"button\" data-action=\"" + a[0] + "\">" + a[1] + "</button>";
        }).join("");
        if (at) {
          html += "<label>Move into step<select name=\"move\"><option value=\"\">Choose a step…</option>" +
            targets(node).map(function (t, i) {
              return "<option value=\"" + i + "\">" + new Array(t.depth + 1).join("  ") + esc(t.step.step) + "</option>";
            }).join("") + "</select></label>";
        }
        html += "</div>";
      }
      html += "<p class=\"error\" hidden></p><div class=\"buttons\">" +
        "<button type=\"button\" data-action=\"cancel\">Cancel</button> " +
        "<button type=\"submit\" class=\"primary\">Apply</button></div></form>";
      dialog.innerHTML = html;
      var form = dialog.querySelector("form");
      var error = dialog.querySelector(".error");
      var moveTargets = at ? targets(node) : [];

      function fail(msg) {
        error.textContent = msg;
        error.hidden = false;
      }
      // Copies the form into node. Empty optional fields are removed.
      function writeFields() {
        fields.forEach(function (f) {
          var value = form.elements[f[0]].value.trim();
          if (value) node[f[0]] = value;
          else delete node[f[0]];
        });
      }
      // The parent must keep at least one input.
      function canRemove() {
        if (at.parent.inputs.length > 1) return true;
        fail("This is the step's only input. Delete or remove the step instead.");
        return false;
      }
      function act(action) {
        var siblings = at && at.parent.inputs, added;
        if (action === "up" || action === "down") {
          var j = at.index + (action === "up" ? -1 : 1);
          mutate(function () {
            writeFields();
            siblings[at.index] = siblings[j];
            siblings[j] = node;
          });
          openEditor(node);
        } else if (action === "add-after" || action === "add-into") {
          added = { ingredient: "new ingredient" };
          mutate(function () {
            writeFields();
            if (action === "add-after") siblings.splice(at.index + 1, 0, added);
            else node.inputs.push(added);
          });
          openEditor(added, true);
        } else if (action === "wrap") {
          added = { step: "new step", inputs: [node] };
          mutate(function () {
            writeFields();
            replace(node, added);
          });
          openEditor(added, true);
        } else if (action === "unwrap") {
          mutate(function () { replace(node, node.inputs[0]); });
          closeDialog();
        } else if (action === "delete") {
          if (!canRemove()) return;
          if (kind === "step" && !confirm("Delete this step and everything that goes into it?")) return;
          mutate(function () { siblings.splice(at.index, 1); });
          closeDialog();
        }
      }
      form.addEventListener("click", function (e) {
        var button = e.target.closest("button[data-action]");
        if (!button) return;
        var action = button.getAttribute("data-action");
        if (action === "cancel") { closeDialog(); return; }
        if (!form.reportValidity()) return;
        act(action);
      });
      form.addEventListener("change", function (e) {
        if (e.target.name !== "move" || e.target.value === "") return;
        var target = moveTargets[Number(e.target.value)].step;
        if (!form.reportValidity() || !canRemove()) { e.target.value = ""; return; }
        mutate(function () {
          writeFields();
          at.parent.inputs.splice(at.index, 1);
          target.inputs.push(node);
        });
        closeDialog();
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        current.applied = true;
        if (isNew) {
          // The undo step taken when the node was added covers this too.
          writeFields();
          changed();
        } else {
          mutate(writeFields);
        }
        closeDialog();
      });
      if (!dialog.open) dialog.showModal();
      var first = form.querySelector("input[required]") || form.querySelector("input, textarea");
      if (first && isNew) first.focus();
    }
    // Closing a new node's form without applying it takes the node back out.
    // Escape closes the dialog without going through here, hence the listener.
    function closeDialog() {
      var closing = current;
      current = null;
      if (dialog.open) dialog.close();
      if (closing && closing.isNew && !closing.applied) undoLast();
    }
    dialog.addEventListener("close", function () {
      if (current) closeDialog();
    });

    // The whole file as YAML, for changes the forms don't cover.
    function openYaml() {
      current = null;
      dialog.innerHTML = "<form><h2>Edit YAML</h2>" +
        "<textarea class=\"yaml\" name=\"yaml\" spellcheck=\"false\" autocapitalize=\"off\"></textarea>" +
        "<p class=\"error\" hidden></p><div class=\"buttons\">" +
        "<button type=\"button\" data-action=\"cancel\">Cancel</button> " +
        "<button type=\"submit\" class=\"primary\">Apply</button></div></form>";
      var form = dialog.querySelector("form"), area = form.elements.yaml, error = dialog.querySelector(".error");
      area.value = RecipeYAML.dump(data);
      // Returns the parsed recipe, or null after showing what's wrong.
      function check() {
        var parsed, errors;
        try {
          parsed = jsyaml.load(area.value);
          errors = RecipeYAML.validate(parsed);
        } catch (e) {
          errors = [e.message];
        }
        error.textContent = errors.join("\n");
        error.hidden = !errors.length;
        form.querySelector("[type=submit]").disabled = errors.length > 0;
        return errors.length ? null : parsed;
      }
      area.addEventListener("input", check);
      form.addEventListener("click", function (e) {
        if (e.target.closest("[data-action=cancel]")) closeDialog();
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var parsed = check();
        if (!parsed) return;
        mutate(function () { data = parsed; });
        closeDialog();
      });
      dialog.showModal();
    }

    // Asks for a token, then calls then(). The username field is there so
    // password managers offer to save and fill the token.
    function askToken(then, message) {
      current = null;
      dialog.innerHTML = "<form><h2>Connect to GitHub</h2>" +
        "<p>Saving makes a commit to <b>" + REPO + "</b>. Create a " +
        "<a href=\"https://github.com/settings/personal-access-tokens/new\" target=\"_blank\" rel=\"noopener\">" +
        "fine-grained token</a> with access to only that repository and the permission " +
        "<b>Contents: Read and write</b>, then paste it here.</p>" +
        "<input type=\"text\" name=\"username\" autocomplete=\"username\" value=\"" + REPO + "\" class=\"visually-hidden\" tabindex=\"-1\" readonly>" +
        "<label>Token<input type=\"password\" name=\"token\" autocomplete=\"current-password\" required></label>" +
        "<label class=\"check\"><input type=\"checkbox\" name=\"remember\" checked> Remember on this device</label>" +
        "<p class=\"error\"" + (message ? "" : " hidden") + ">" + esc(message) + "</p><div class=\"buttons\">" +
        "<button type=\"button\" data-action=\"cancel\">Cancel</button> " +
        "<button type=\"submit\" class=\"primary\">Connect</button></div></form>";
      var form = dialog.querySelector("form");
      form.addEventListener("click", function (e) {
        if (e.target.closest("[data-action=cancel]")) closeDialog();
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        token = form.elements.token.value.trim();
        store(TOKEN_KEY, form.elements.remember.checked ? token : null);
        closeDialog();
        then();
      });
      dialog.showModal();
    }
    function forgetToken() {
      token = null;
      store(TOKEN_KEY, null);
    }

    // Loads the file fresh from GitHub (Pages may lag behind) and turns on
    // edit mode, offering to restore an unsaved draft.
    function start() {
      if (!token) { askToken(start); return; }
      link.querySelector("button").disabled = true;
      github("GET", slug).then(function (file) {
        var fresh = jsyaml.load(decode(file.content));
        data = fresh;
        baseText = RecipeYAML.dump(fresh);
        baseSha = file.sha;
        var draft = load(DRAFT_KEY + slug);
        if (draft && draft.text !== baseText &&
            confirm("Restore your unsaved edits from " + new Date(draft.time).toLocaleString() + "?")) {
          data = jsyaml.load(draft.text);
          baseSha = draft.sha;
        } else {
          store(DRAFT_KEY + slug, null);
        }
        undo = [];
        editing = true;
        card.classList.add("editing");
        bar.hidden = false;
        page.setScale(1);
        page.setData(data);
        updateBar();
        say("Tap a cell to change it.");
        bar.scrollIntoView({ block: "nearest" });
      }, function (err) {
        if (err.status === 401) {
          forgetToken();
          askToken(start, "GitHub didn't accept that token. It may have expired.");
        } else {
          alert("Couldn't load the recipe from GitHub: " + err.message);
        }
      }).then(function () {
        link.querySelector("button").disabled = false;
      });
    }

    function stop() {
      if (dirty()) {
        if (!confirm("Discard your unsaved edits?")) return;
        data = jsyaml.load(baseText);
        store(DRAFT_KEY + slug, null);
        page.setData(data);
      }
      editing = false;
      card.classList.remove("editing");
      bar.hidden = true;
    }

    // Commits the file. If it changed on GitHub since editing began, asks
    // before replacing it.
    function save() {
      var errors = RecipeYAML.validate(data);
      if (errors.length) { say("Can't save: " + errors[0]); return; }
      if (!token) { askToken(save); return; }
      var text = RecipeYAML.dump(data);
      saving = true;
      updateBar();
      say("Saving\u2026");
      function put() {
        return github("PUT", slug, {
          message: "Edit " + data.title + " from the web",
          content: encode(text),
          sha: baseSha,
          branch: BRANCH
        });
      }
      put().catch(function (err) {
        if (err.status !== 409) throw err;
        if (!confirm("This recipe changed on GitHub since you started editing. Replace it with your version?")) {
          throw new Error("the recipe changed on GitHub.");
        }
        return github("GET", slug).then(function (file) {
          baseSha = file.sha;
          return put();
        });
      }).then(function (res) {
        baseSha = res.content.sha;
        baseText = text;
        store(DRAFT_KEY + slug, null);
        store(SAVED_KEY + slug, { text: text, time: Date.now() });
        say(dirty() ? "Saved, but you've changed it since." : "Saved. The site updates in a minute or so.");
      }, function (err) {
        if (err.status === 401) {
          forgetToken();
          say("Not saved.");
          askToken(save, "GitHub didn't accept that token. It may have expired.");
        } else if (err.status === 403 || err.status === 404) {
          say("Not saved: this token can't write to " + REPO + ". It needs Contents: Read and write.");
        } else {
          say("Not saved: " + err.message);
        }
      }).then(function () {
        saving = false;
        updateBar();
      });
    }

    link.addEventListener("click", start);
    bar.addEventListener("click", function (e) {
      var button = e.target.closest("button[data-bar]");
      if (!button) return;
      var action = button.getAttribute("data-bar");
      if (action === "save") save();
      else if (action === "undo") undoLast();
      else if (action === "yaml") openYaml();
      else if (action === "done") stop();
      else if (action === "forget") { forgetToken(); updateBar(); say("Token forgotten on this device."); }
    });
    card.addEventListener("click", function (e) {
      if (!editing || e.target.closest("a")) return;
      var cell = e.target.closest("table.trn [data-path]");
      if (cell) openEditor(nodeAt(cell.getAttribute("data-path")));
    });
    window.addEventListener("beforeunload", function (e) {
      if (!editing || !dirty()) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  window.Editor = { attach: attach, latest: latest };
})();

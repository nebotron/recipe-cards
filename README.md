# Recipe Cards

Recipes stored as YAML and rendered in
[tabular recipe notation](https://www.cookingforengineers.com/recipe/33/Lemon-Bars)
with GitHub Pages.

- `recipes/*.yaml`: one file per recipe. See `.claude/skills/recipe-yaml/SKILL.md`
  for the schema.
- `index.html`: lists every recipe (built by GitHub Pages' Jekyll).
- `/recipe-cards/<slug>`: renders `recipes/<slug>.yaml` in the browser. GitHub
  Pages serves `404.html` for these paths, which reads the slug from the URL.
  `recipe.html?r=<slug>` renders the same card on any static server.
- **Copy ingredients** on a card copies the shopping list (at the current
  scale, one item per line, skipping ingredients marked done) to paste into
  a list app like AnyList.
- Tapping an amount shows it in other units. For common ingredients (water,
  milk, flour, sugar, butter, salt, …) it also converts between volume and
  weight, using densities from King Arthur Baking's
  [ingredient weight chart](https://www.kingarthurbaking.com/learn/ingredient-weight-chart)
  (`DENSITIES` in `assets/units.js`).
- `scripts/validate.py`: checks recipe files (`pip install pyyaml`).

## Editing on the site

**Edit recipe**, under each card, edits the card in place and saves it as a
commit to `main`. Tap a cell to change its text, or to move, add, wrap
("Add step after this"), unwrap or delete it. **YAML** edits the whole file.
GitHub Pages republishes a minute or so after saving.

Saving needs a [fine-grained token](https://github.com/settings/personal-access-tokens/new)
with access to only this repository and **Contents: Read and write**. The
token stays in your browser (in `localStorage` if "Remember on this device"
is checked, otherwise only until you leave the page) and is sent only to
`api.github.com`. Unsaved edits are kept as a draft on the device.

Saving rewrites the file in the house style (`assets/recipe-yaml.js`), so
YAML comments are dropped.

## Adding a recipe

In Claude Code, ask Claude to add a recipe and give it an image, a URL, or
pasted text. The `recipe-yaml` skill writes `recipes/<slug>.yaml` and
validates it.

## Publishing

In the repo's **Settings → Pages**, set the source to **Deploy from a
branch**, choose `main`, then `/ (root)`.

## Local preview

```sh
python3 -m http.server
# open http://localhost:8000/recipe.html?r=saag-paneer
```

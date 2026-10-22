# Recipe Cards

Recipes stored as YAML and rendered in
[tabular recipe notation](https://www.cookingforengineers.com/recipe/33/Lemon-Bars)
with GitHub Pages.

- `recipes/*.yaml`: one file per recipe. See `.claude/skills/recipe-yaml/SKILL.md`
  for the schema.
- `index.html`: lists every recipe (built by GitHub Pages' Jekyll).
- `recipe.html?r=<slug>`: renders `recipes/<slug>.yaml` in the browser.
- `scripts/validate.py`: checks recipe files (`pip install pyyaml`).

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

---
name: recipe-yaml
description: Convert a recipe into a YAML recipe card for this repo's site (tabular recipe notation, like cookingforengineers.com). Use when the user gives a recipe as an image, a URL, or pasted text and wants it added to the recipe cards.
---

# Recipe to YAML

Turn a recipe into `recipes/<slug>.yaml`. The site renders that file as a
tabular recipe notation table at `recipe.html?r=<slug>`.

## 1. Read the source

- **Image**: read the image file and transcribe the title, every ingredient
  with its amount, and every instruction. If a word is unclear, choose the
  likely reading and mention it to the user.
- **URL**: fetch the page and pull out the title, ingredients, and method.
  Ignore the story, ads, and comments. Put the URL in `source`.
- **Text**: use the pasted recipe as given.

## 2. Model it as a tree

A tabular recipe is a tree. The **root is the final step**. Each step lists
its `inputs` in top-to-bottom table order. Each input is either an
ingredient or an earlier step whose result goes into this one.

Work backwards from the finished dish. For each step, ask what goes into it:
the results of earlier steps, plus any ingredients added at that point.

Rules:

- Every ingredient appears exactly once, under the step where it is first
  used.
- If one ingredient is used in two places (for example, oil for a marinade
  and more oil for frying), split it into two ingredient entries. Make the
  amounts add up to the original, and add a `notes` entry saying how you
  split it.
- Put the step result that the new ingredients are added to *first* in
  `inputs`, then the new ingredients in the order the recipe adds them.
- When the same ingredient appears more than once (a split as above), try to
  order the tree so its rows in the left-hand ingredient column sit next to
  each other, so the amounts are easy to add up. Ingredients within one step
  can be listed in any order, and the step-result-first rule can bend here:
  an ingredient may come before a step result in `inputs` if that puts the
  repeats together. Sibling branches can also swap order. Check the
  validator's printed tree. Branches can't always line up every repeat, so
  group the ones that matter most, such as measured amounts over "to taste".
- Keep step labels short and imperative, like "mix", "simmer 20 min." or
  "350°F for 25 min.". Put the secondary detail in `detail`. Include times
  and temperatures in the label.
- A step that changes a single input (such as "brown, then remove from pan"
  or "chill 1 hr.") has one input.
- Write units the way cookingforengineers.com does: `tsp.`, `Tbs.`, `cup`,
  `oz.`, `lb.`, `g`, `mL`, and fractions like `1-1/2`. Do not invent metric
  conversions the source doesn't give.
- Do not invent ingredients, amounts, or steps. If the source is vague (for
  example "a little salt"), keep it vague (`prep: to taste`).

## 3. Schema

```yaml
title: Lemon Bars              # required
yield: 32 bars                 # optional
source: https://example.com/x  # optional: URL, book, or person
notes:                         # optional list of strings
  - Anything that doesn't fit the table.
recipe:                        # required; must be a step (the final one)
  step: cool and cut           # short label shown in the cell
  detail: optional smaller text shown under the label
  inputs:                      # required, non-empty, in table order
    - step: 350°F for 20 min.
      inputs:
        - { amount: 1-3/4 cup, ingredient: all purpose flour }
        - { amount: 1, ingredient: white onion, prep: diced }
        - { ingredient: salt, prep: to taste }   # amount optional
```

Ingredient keys: `ingredient` (required), `amount`, `prep`. They render as
"amount ingredient, prep". Step keys: `step`, `inputs`, `detail`. No other
keys are allowed.

Use flow-style `{ ... }` maps for ingredients to keep deep trees readable.
Quote values that contain `: ` or start with a YAML special character.

See `recipes/saag-paneer.yaml` for a complete example.

## 4. Save and check

1. Choose a lowercase hyphenated slug from the title, such as
   `recipes/lemon-bars.yaml`. Don't overwrite an existing file without asking.
2. Run `python3 scripts/validate.py recipes/<slug>.yaml`. It reports schema
   errors and prints the tree, so you can check that each ingredient is
   under the right step. Fix and re-run until it passes.
3. Optionally preview it with `python3 -m http.server` from the repo root,
   then open `http://localhost:8000/recipe.html?r=<slug>`. The index page
   needs Jekyll, so it only lists recipes on GitHub Pages.
4. Tell the user the file path. Mention any readings you guessed and any
   ingredients you split.

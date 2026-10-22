---
name: recipe-yaml
description: Convert a recipe into a YAML recipe card for this repo's site (tabular recipe notation, like cookingforengineers.com). Use when the user gives a recipe as an image, a URL, or pasted text and wants it added to the recipe cards.
---

# Recipe to YAML

Turn a recipe into `recipes/<slug>.yaml`. The site renders that file as a
tabular recipe notation table at `/recipe-cards/<slug>`.

## 1. Read the source

- **Image**: read the image file and transcribe the title, every ingredient
  with its amount, and every instruction.
- **URL**: fetch the page and pull out the title, ingredients, and method.
  Ignore the story, ads, and comments. Put the URL in `source`.
- **Text**: use the pasted recipe as given.

Set `source` whenever the recipe has one: the URL it came from, or the book
or person it's credited to. A URL source shows as a link at the bottom of
the card.

### Ask, don't guess

If anything in the source is ambiguous, ask the user before writing the
file (use the AskUserQuestion tool, batching related questions into one
call). Do not pick a reading yourself. Examples:

- A word, number, or fraction you can't read clearly.
- The ingredient list and the method disagree (say, the list has cream but
  the method says milk).
- An ingredient is listed but never used in the method, or used in the
  method but missing from the list.
- It's unclear which step an ingredient goes into, or how a shared
  ingredient is split between steps.
- Crossed-out or handwritten additions on a card, where it's unclear
  whether they count.

Offer the likely readings as options. Once answered, follow the user's
choice; don't record the ambiguity on the card unless they ask you to.

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
  amounts add up to the original. If the source doesn't say how to split
  it, ask the user.
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

### No notes below the card

Everything goes in the table. There is no `notes` list. Put each extra piece
of information on the step or ingredient it is about:

- **Short** (a few words): put it in the table text itself, as a step's
  `detail` or an ingredient's `prep`.
- **Long** (tips, substitutions, warnings, a sentence or more): put it in
  `info` on that step or ingredient. It shows as a small "i" button that
  opens a popup when tapped.
- Information about the whole recipe (author, total time, what was left
  out) goes in the top-level `info`, which puts the button in the title row.

Don't state the obvious. Leave out anything a cook can read off the table:
that an ingredient is split across steps (the repeated rows show it), that
a reserved mixture comes from the step that reserves it, totals, or a
restatement of a step's label or detail. Add `info` only for things the
table doesn't already show, such as tips, substitutions, warnings, and
choices made about the source.

## 3. Schema

```yaml
title: Lemon Bars              # required
yield: 32 bars                 # optional
source: https://example.com/x  # optional: URL, book, or person
info: Whole-recipe note, in a popup from the title row.  # optional
recipe:                        # required; must be a step (the final one)
  step: cool and cut           # short label shown in the cell
  detail: optional smaller text shown under the label
  info: optional longer text, shown in a popup when tapped
  inputs:                      # required, non-empty, in table order
    - step: 350°F for 20 min.
      inputs:
        - { amount: 1-3/4 cup, ingredient: all purpose flour, info: "Bread flour also works." }
        - { amount: 1, ingredient: white onion, prep: diced }
        - { ingredient: salt, prep: to taste }   # amount optional
```

Ingredient keys: `ingredient` (required), `amount`, `prep`, `info`. They
render as "amount ingredient, prep" plus an info button. Step keys: `step`,
`inputs`, `detail`, `info`. Top-level keys: `title`, `yield`, `source`,
`info`, `recipe`. No other keys are allowed.

Use flow-style `{ ... }` maps for ingredients to keep deep trees readable.
Quote values that contain `: ` or start with a YAML special character.

See `recipes/saag-paneer.yaml` for a complete example, and
`recipes/pasta-with-butternut-squash-kale-and-brown-butter.yaml` for `info`
popups.

## 4. Save and check

1. Choose a lowercase hyphenated slug from the title, such as
   `recipes/lemon-bars.yaml`. Don't overwrite an existing file without asking.
2. Run `python3 scripts/validate.py recipes/<slug>.yaml`. It reports schema
   errors and prints the tree, so you can check that each ingredient is
   under the right step. Fix and re-run until it passes.
3. Optionally preview it with `python3 -m http.server` from the repo root,
   then open `http://localhost:8000/recipe.html?r=<slug>`. The index page and
   `/recipe-cards/<slug>` URLs need Jekyll, so they only work on GitHub Pages.
4. Tell the user the file path and mention any ingredients you split.

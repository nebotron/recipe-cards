#!/usr/bin/env python3
"""Validate recipe YAML files and print each recipe's tree.

Usage: python3 scripts/validate.py [recipes/foo.yaml ...]
With no arguments, checks every file in recipes/.
"""
import glob
import sys

import yaml

TOP_KEYS = {"title", "yield", "source", "info", "recipe"}
STEP_KEYS = {"step", "detail", "info", "inputs"}
INGREDIENT_KEYS = {"amount", "ingredient", "prep", "info"}


def check_node(node, path, errors, depth, lines):
    pad = "  " * depth
    if not isinstance(node, dict):
        errors.append(f"{path}: expected a mapping")
        return
    if "step" in node:
        extra = set(node) - STEP_KEYS
        if extra:
            errors.append(f"{path}: unknown step keys {sorted(extra)}")
        inputs = node.get("inputs")
        if not isinstance(inputs, list) or not inputs:
            errors.append(f"{path}: step needs a non-empty 'inputs' list")
            inputs = []
        lines.append(f"{pad}[{node['step']}]" + (" (i)" if node.get("info") else ""))
        for i, child in enumerate(inputs):
            check_node(child, f"{path}.inputs[{i}]", errors, depth + 1, lines)
    elif "ingredient" in node:
        extra = set(node) - INGREDIENT_KEYS
        if extra:
            errors.append(f"{path}: unknown ingredient keys {sorted(extra)}")
        text = " ".join(str(node[k]) for k in ("amount", "ingredient") if node.get(k))
        if node.get("prep"):
            text += f", {node['prep']}"
        if node.get("info"):
            text += " (i)"
        lines.append(f"{pad}{text}")
    else:
        errors.append(f"{path}: needs either 'step' or 'ingredient'")


def validate(path):
    errors, lines = [], []
    with open(path) as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        return [f"{path}: top level must be a mapping"], lines
    extra = set(data) - TOP_KEYS - {"notes"}
    if extra:
        errors.append(f"unknown top-level keys {sorted(extra)}")
    if not data.get("title"):
        errors.append("missing 'title'")
    if "notes" in data:
        errors.append("'notes' is not supported; put it in the table or in an 'info' popup")
    if "recipe" not in data:
        errors.append("missing 'recipe'")
    elif "step" not in (data["recipe"] or {}):
        errors.append("'recipe' must be a step (the final step)")
    else:
        check_node(data["recipe"], "recipe", errors, 0, lines)
    return errors, lines


def main():
    paths = sys.argv[1:] or sorted(glob.glob("recipes/*.yaml"))
    failed = False
    for path in paths:
        errors, lines = validate(path)
        print(f"== {path}: {'FAIL' if errors else 'ok'}")
        for e in errors:
            print(f"  error: {e}")
        if not errors:
            print("\n".join(lines))
        failed |= bool(errors)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

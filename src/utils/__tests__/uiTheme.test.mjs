import assert from "node:assert/strict";
import test from "node:test";
import { applyUiThemePreference, normalizeUiTheme } from "../uiTheme.mjs";

function createDatasetTarget() {
  return { dataset: {} };
}

test("normalizeUiTheme keeps only supported theme ids", () => {
  assert.equal(normalizeUiTheme("dark"), "dark");
  assert.equal(normalizeUiTheme("light"), "light");
  assert.equal(normalizeUiTheme("purple"), "purple");
  assert.equal(normalizeUiTheme("unknown"), "dark");
  assert.equal(normalizeUiTheme(""), "dark");
});

test("applyUiThemePreference writes normalized theme to root and body datasets", () => {
  const root = createDatasetTarget();
  const body = createDatasetTarget();

  const appliedTheme = applyUiThemePreference("light", { root, body });

  assert.equal(appliedTheme, "light");
  assert.equal(root.dataset.uiTheme, "light");
  assert.equal(body.dataset.uiTheme, "light");
});

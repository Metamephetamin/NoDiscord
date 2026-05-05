import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/TextChatMediaPreview.jsx", "utf8");

assert(source.includes("previewRootRef"), "Media preview wheel handling must be attached to the root overlay.");
assert(
  source.includes("viewportRef.current?.getBoundingClientRect"),
  "Wheel zoom must anchor to the viewport rect so Ctrl+wheel zooms toward the cursor."
);
assert(
  source.includes("previewRootNode.addEventListener(\"wheel\""),
  "Mouse wheel gallery navigation must work across the full preview overlay."
);
assert(source.includes("{ passive: false }"), "Wheel listener must be non-passive so Ctrl+wheel can prevent browser zoom.");

console.log("Media preview smoke checks passed.");

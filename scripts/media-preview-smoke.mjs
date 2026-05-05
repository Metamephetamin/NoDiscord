import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/TextChatMediaPreview.jsx", "utf8");

assert(
  source.includes("viewportRef.current?.getBoundingClientRect"),
  "Wheel zoom must anchor to the viewport rect so Ctrl+wheel zooms toward the cursor."
);
assert(
  source.includes("window.addEventListener(\"wheel\", handleNativeWheel, { passive: false, capture: true })"),
  "Mouse wheel preview controls must use a capture-level window listener before browser zoom/scroll defaults."
);
assert(
  source.includes("window.removeEventListener(\"wheel\", handleNativeWheel, { capture: true })"),
  "Media preview must remove the capture-level wheel listener when the preview closes."
);

console.log("Media preview smoke checks passed.");

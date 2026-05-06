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
assert(
  !source.includes("const image = new Image();"),
  "Image preview must not preload through a second Image object before rendering the visible image."
);
assert(
  source.includes("onLoad={() => setImageLoadState({ url: imagePreviewUrl, failed: false })}"),
  "Image preview must mark readiness from the visible image load event."
);
assert(
  source.includes("markMediaUrlMissing(imagePreviewUrl)"),
  "Image preview must cache failed internal media URLs instead of retrying them repeatedly."
);
assert(
  source.includes("markMediaUrlMissing(videoPreviewUrl)"),
  "Video preview must cache failed internal media URLs instead of retrying them repeatedly."
);
assert(
  source.includes("window.addEventListener(MISSING_MEDIA_EVENT"),
  "Media preview must react when another mounted media component marks the same source missing."
);

console.log("Media preview smoke checks passed.");

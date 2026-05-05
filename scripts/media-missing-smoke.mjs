import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mediaSource = readFileSync("src/utils/media.js", "utf8");
const animatedMediaSource = readFileSync("src/components/AnimatedMedia.jsx", "utf8");

assert(
  mediaSource.includes('export const MISSING_MEDIA_EVENT = "nodiscord:missing-internal-media"'),
  "media.js must expose a missing-media event name."
);

assert(
  mediaSource.includes("window.dispatchEvent(new CustomEvent(MISSING_MEDIA_EVENT"),
  "markMediaUrlMissing must notify mounted media components."
);

assert(
  animatedMediaSource.includes("window.addEventListener(MISSING_MEDIA_EVENT"),
  "AnimatedMedia must subscribe to missing-media notifications."
);

assert(
  animatedMediaSource.includes("isMediaUrlKnownMissing(resolvedSrc)"),
  "AnimatedMedia must suppress sources already known missing."
);

assert(
  animatedMediaSource.includes("const shouldRenderVideo = isVideoSource && !shouldSuppressSource"),
  "AnimatedMedia must suppress missing video avatars too."
);

assert(
  !animatedMediaSource.includes("return markMediaUrlMissing(resolvedSrc);"),
  "AnimatedMedia must not mark sources missing while only checking cache state."
);

console.log("Missing media smoke checks passed.");

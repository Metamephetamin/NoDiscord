import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlaySource = readFileSync("src/components/MenuMainOverlays.jsx", "utf8");

assert(
  overlaySource.includes("const SETTINGS_WHEEL_SCROLL_MULTIPLIER = 2.6"),
  "Settings overlay must amplify wheel scrolling with the expected multiplier."
);

assert(
  overlaySource.includes("onWheelCapture={handleSettingsWheel}"),
  "Settings overlay must handle wheel events before native slow scrolling."
);

assert(
  overlaySource.includes("findSettingsScrollTarget"),
  "Settings wheel handling must target only settings scroll containers."
);

console.log("Settings scroll smoke checks passed.");

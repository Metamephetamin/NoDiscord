import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const overlaySource = readFileSync("src/components/MenuMainOverlays.jsx", "utf8");
const menuCss = readFileSync("src/css/MenuMain.css", "utf8");

assert(packageJson.dependencies?.siriwave, "The direct-call voice animation should use the siriwave package.");
assert(
  overlaySource.includes('import SiriWave from "siriwave";'),
  "MenuMainOverlays should import SiriWave directly."
);
assert(
  overlaySource.includes('style: "ios9"'),
  "DirectCallVoiceWave should render SiriWave with the iOS9 style."
);
assert(
  overlaySource.includes("ResizeObserver"),
  "DirectCallVoiceWave should resize the canvas to the existing compact call link size."
);
assert(
  !overlaySource.includes("direct-call-inline__voice-wave-band"),
  "The old custom band spans should not render behind the SiriWave canvas."
);
assert(
  menuCss.includes(".direct-call-inline__voice-wave-canvas"),
  "MenuMain.css should size the SiriWave canvas inside the existing compact call link."
);
assert(
  menuCss.includes("background: transparent;") && menuCss.includes("box-shadow: none;"),
  "The SiriWave holder should not draw the old oval capsule behind the iOS9 waves."
);
assert(
  !menuCss.includes(".direct-call-inline__voice-wave::before"),
  "The old edge mask should not dim the SiriWave canvas."
);

console.log("direct-call-siriwave smoke passed");

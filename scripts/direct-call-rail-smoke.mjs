import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const overlayLayerSource = readFileSync("src/features/menu-main/MenuMainOverlayLayer.jsx", "utf8");

assert(
  controllerSource.includes("const openActiveDirectCallFromRail = useCallback("),
  "MenuMainController must have a dedicated rail action for returning to an active direct call."
);

assert(
  controllerSource.includes("setDirectCallMiniMode(false);") &&
    controllerSource.includes("openDirectChat(targetUserId);"),
  "Clicking the rail direct-call icon must expand the call window and open the peer direct chat."
);

assert(
  controllerSource.includes("onOpenDirectCallChat={openActiveDirectCallFromRail}"),
  "DesktopServerRail must use the dedicated active-call return action."
);

assert(
  overlayLayerSource.includes("showExpandedDirectCallOverlay") &&
    overlayLayerSource.includes("!directCallState?.isMiniMode") &&
    overlayLayerSource.includes("\"connected\"") &&
    overlayLayerSource.includes("\"reconnecting\""),
  "Desktop direct-call overlay must render connected/reconnecting calls when the call is expanded."
);

console.log("Direct call rail smoke checks passed.");

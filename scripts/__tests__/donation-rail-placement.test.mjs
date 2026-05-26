import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverWorkspaceSource = readFileSync("src/components/ServerWorkspace.jsx", "utf8");
const menuControllerSource = readFileSync("src/features/menu-main/MenuMainController.jsx", "utf8");
const profilePanelSource = readFileSync("src/components/MenuProfilePanel.jsx", "utf8");
const profileSlotSource = readFileSync("src/features/menu-main/MenuMainProfilePanelSlot.jsx", "utf8");
const menuCssSource = readFileSync("src/css/MenuMain.css", "utf8");

test("donation action lives in the desktop server rail instead of the profile controls", () => {
  assert(
    serverWorkspaceSource.includes("onOpenDonation,") &&
      serverWorkspaceSource.includes("btn__server-donation") &&
      serverWorkspaceSource.includes("onClick={onOpenDonation}"),
    "DesktopServerRail must expose and render the donation button."
  );

  assert(
    menuControllerSource.includes("onOpenDonation={openDonationModal}"),
    "MenuMainController must wire the donation modal opener into DesktopServerRail."
  );

  assert(
    menuCssSource.includes(".btn__server-donation"),
    "MenuMain.css must style the rail donation button."
  );

  assert(
    !profilePanelSource.includes("profile__mini-icon--support") &&
      !profilePanelSource.includes("onOpenDonation") &&
      !profileSlotSource.includes("openDonationModal"),
    "The lower profile panel must not own the donation action."
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const authSource = readFileSync("src/components/Auth.jsx", "utf8");
const authCss = readFileSync("src/css/Auth.css", "utf8");
const rendererSource = readFileSync("src/renderer.jsx", "utf8");

assert(authSource.includes("shouldShowRegistrationCodeStep"), "Registration email verification should have an inline code step.");
assert(authSource.includes("returnToRegistrationForm"), "Registration code step should provide a back action.");
assert(authSource.includes("auth-section--registration-code"), "Registration code step should render inside the auth card.");
assert(!authSource.includes("auth-verify-modal__backdrop"), "Registration verification should not render a separate modal backdrop.");
assert(!authSource.includes("auth-verify-modal__close"), "Registration verification should not render a modal close button.");
assert(authSource.includes('toLowerCase() === "mock"'), "Debug email codes should only render for explicit mock delivery mode.");
assert(authCss.includes(".auth-registration-code__actions"), "Registration code step actions should be styled.");

const authMeIndex = rendererSource.indexOf("`${API_BASE_URL}/auth/me`");
const firstCachedRestoreCallIndex = rendererSource.indexOf("restoreCachedSession();");
assert(authMeIndex > 0, "Renderer must validate cached sessions through /auth/me.");
assert(
  firstCachedRestoreCallIndex > authMeIndex,
  "Renderer must not mount the authenticated shell before cached session validation completes."
);

console.log("Auth registration code smoke checks passed.");

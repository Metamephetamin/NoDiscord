import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appLogoSource = readFileSync("src/utils/appLogo.js", "utf8");
const mainSource = readFileSync("src/main.js", "utf8");
const pushSource = readFileSync("public/push-sw.js", "utf8");
const authSource = readFileSync("src/components/Auth.jsx", "utf8");
const authCss = readFileSync("src/css/Auth.css", "utf8");

assert(appLogoSource.includes('DEFAULT_APP_LOGO_ID = "mono-light"'), "Default renderer logo should be mono light.");
assert(mainSource.includes('DEFAULT_APP_ICON_ASSET = "app-logos/logo-mono-light.png"'), "Default Electron icon should be mono light.");
assert(pushSource.includes("/image/app-logos/logo-mono-light.png"), "Default push icon should be mono light.");
assert(authSource.includes('const AUTH_BRAND_NAME = "Tend"'), "Auth brand copy should use Tend.");
assert(!authSource.includes("- симум возможностей"), "Auth slogan should not use the old MAX wording.");
assert(authCss.includes("--auth-submit-gradient"), "Auth submit gradient should be centralized.");
assert(authCss.includes("background: var(--auth-submit-gradient)"), "Auth submit buttons should share the same gradient.");

console.log("Auth branding smoke checks passed.");

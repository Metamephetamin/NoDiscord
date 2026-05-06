import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appLogoSource = readFileSync("src/utils/appLogo.js", "utf8");
const mainSource = readFileSync("src/main.js", "utf8");
const pushSource = readFileSync("public/push-sw.js", "utf8");
const authSource = readFileSync("src/components/Auth.jsx", "utf8");
const authCss = readFileSync("src/css/Auth.css", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const forgeSource = readFileSync("forge.config.js", "utf8");

assert(appLogoSource.includes('DEFAULT_APP_LOGO_ID = "mono-light"'), "Default renderer logo should be mono light.");
assert(mainSource.includes('DEFAULT_APP_ICON_ASSET = "app-logos/logo-white-dark.png"'), "Default Electron icon should be white dark.");
assert(mainSource.includes('APP_DISPLAY_NAME = "Lanaya"'), "Electron display name should use Lanaya.");
assert(pushSource.includes("/image/app-logos/logo-white-dark.png"), "Default push icon should be white dark.");
assert(pushSource.includes('payload?.title || "Lanaya"'), "Default push title should use Lanaya.");
assert(authSource.includes('const AUTH_BRAND_NAME = "Lanaya"'), "Auth brand copy should use Lanaya.");
assert(!authSource.includes("- симум возможностей"), "Auth slogan should not use the old MAX wording.");
assert(authCss.includes("--auth-submit-gradient"), "Auth submit gradient should be centralized.");
assert(authCss.includes("background: var(--auth-submit-gradient)"), "Auth submit buttons should share the same gradient.");
assert(packageSource.includes('"productName": "Lanaya"'), "Package product name should use Lanaya.");
assert(forgeSource.includes('executableName: "Lanaya"'), "Packaged executable should use Lanaya.");

console.log("Auth branding smoke checks passed.");

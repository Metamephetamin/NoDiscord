import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const authSource = readFileSync("src/components/Auth.jsx", "utf8");
const authCss = readFileSync("src/css/Auth.css", "utf8");

const requiredSourceMarkers = [
  'const AUTH_BACKGROUND_VIDEO_URL = resolveStaticAssetUrl("/video/GoldenDustGlow2.mp4")',
  'const MOBILE_AUTH_VISUAL_MODE_QUERY = "(max-width: 640px), (pointer: coarse)"',
  "if (!isMobileAuthVisualMode)",
  'className="auth-video-bg"',
  "<source src={AUTH_BACKGROUND_VIDEO_URL} type=\"video/mp4\" />",
  'mode === "login" ? "auth-page--login" : "auth-page--register"',
  'className={`auth-card auth-card--wide ${mode === "login" ? "auth-card--login" : "auth-card--register"}`}',
  'className="auth-qr-login__svg"',
  'className="auth-qr-login__logo"',
  'className="auth-qr-login__status"',
  'className="auth-registration-code__actions"',
  'toLowerCase() === "mock"',
];

for (const marker of requiredSourceMarkers) {
  assert(authSource.includes(marker), `Missing auth render marker: ${marker}`);
}

for (const eventName of ["loadeddata", "canplay", "error"]) {
  assert(
    authSource.includes(`addEventListener("${eventName}"`),
    `Auth background video must handle ${eventName}.`,
  );
  assert(
    authSource.includes(`removeEventListener("${eventName}"`),
    `Auth background video must clean up ${eventName}.`,
  );
}

for (const eventName of ["stalled", "emptied"]) {
  assert(
    !authSource.includes(`addEventListener("${eventName}"`),
    `Auth background video must not reload on ${eventName}; buffering events can loop and flicker.`,
  );
}

const requiredCssMarkers = [
  ".auth-video-bg",
  ".auth-page--login .auth-video-bg",
  ".auth-page--register .auth-video-bg",
  ".auth-card--login:has(.auth-card__side--qr)",
  ".auth-qr-login__code",
  ".auth-qr-login__logo img",
  ".auth-registration-code__actions",
  ".auth-input",
  "-webkit-text-fill-color: #172133",
];

for (const marker of requiredCssMarkers) {
  assert(authCss.includes(marker), `Missing auth CSS marker: ${marker}`);
}

assert(
  !/\.auth-page--login\s+\.auth-video-bg\s*\{[^}]*object-fit:\s*contain/i.test(authCss),
  "Mobile login background video must cover the viewport, not contain inside it.",
);

console.log("Auth visual smoke checks passed.");

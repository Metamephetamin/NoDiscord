import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync("src/components/Auth.jsx", "utf8");
const nginxSource = readFileSync("infra/nginx/lanaya.space.conf", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");

test("auth page creates and polls QR login sessions only when QR panel is open", () => {
  assert.match(
    authSource,
    /if\s*\(\s*mode\s*!==\s*"login"\s*\|\|\s*isQrCameraPreferred\s*\|\|\s*!isQrLoginOpen\s*\)/,
    "QR session creation must be gated by the visible QR panel",
  );
  assert.match(
    authSource,
    /if\s*\(\s*mode\s*!==\s*"login"\s*\|\|\s*!isQrLoginOpen\s*\|\|[\s\S]*?qrLoginStatus\s*!==\s*"pending"/,
    "QR session polling must stop while the QR panel is closed",
  );
});

test("auth background video starts after initial auth page work is idle", () => {
  assert.match(
    authSource,
    /const AUTH_VIDEO_IDLE_DELAY_MS = \d+;/,
    "auth video loading must use an explicit idle delay",
  );
  assert.match(
    authSource,
    /requestIdleCallback/,
    "auth video loading must wait for browser idle time when supported",
  );
  assert.match(
    authSource,
    /shouldRenderAuthVideo = isAuthVideoAvailable && !isLiteVisualMode && isAuthVideoLoadAllowed/,
    "auth video element must not mount before idle loading is allowed",
  );
  assert.match(
    authSource,
    /preload="none"/,
    "auth video should not preload before it is intentionally mounted",
  );
});

test("production nginx caches static auth media assets explicitly", () => {
  assert.match(
    nginxSource,
    /location\s+~\*\s+\^\/\(\?:assets\|video\|audio\|fonts\|icons\|image\|sounds\)\//,
    "nginx must have a static asset cache location for video and bundled assets",
  );
  assert.match(
    nginxSource,
    /Cache-Control\s+"public,\s*max-age=2592000,\s*immutable"/,
    "static assets must be cacheable so the auth background video is not downloaded on every visit",
  );
  assert.match(
    deployWorkflow,
    /cmp -s \\"\\\$TEMP_ROOT\/lanaya\.space\.conf\\" \\"\\\$NGINX_SITE\\"/,
    "deploy must update the existing nginx site when the checked-in template changes",
  );
});

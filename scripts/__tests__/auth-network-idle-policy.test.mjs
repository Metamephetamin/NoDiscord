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
    "auth video element must not mount before the idle gate allows progressive loading",
  );
  assert.doesNotMatch(
    authSource,
    /response\.blob\(\)|URL\.createObjectURL|authVideoBlobUrl/,
    "auth video must not wait for a full blob download before playback",
  );
  assert.match(
    authSource,
    /src=\{AUTH_BACKGROUND_VIDEO_URL\}/,
    "auth video element must stream directly from the cacheable static video URL",
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

test("production nginx streams chat video files without proxy buffering", () => {
  assert.match(
    nginxSource,
    /location\s+\^~\s+\/chat-files\//,
    "nginx must have a dedicated chat-files location before the generic attachment proxy",
  );
  assert.match(
    nginxSource,
    /proxy_set_header\s+Range\s+\$http_range;/,
    "chat-file proxy must forward Range headers for video seeking and progressive playback",
  );
  assert.match(
    nginxSource,
    /proxy_set_header\s+If-Range\s+\$http_if_range;/,
    "chat-file proxy must forward If-Range headers for resumed video reads",
  );
  assert.match(
    nginxSource,
    /proxy_buffering\s+off;/,
    "chat-file proxy must not buffer large media responses before sending them to the client",
  );
  assert.match(
    nginxSource,
    /proxy_max_temp_file_size\s+0;/,
    "chat-file proxy must not spill large media responses to nginx temp files",
  );
});

test("production nginx owns the lanaya.space TLS vhost", () => {
  assert.match(
    nginxSource,
    /listen\s+443\s+ssl/,
    "lanaya.space nginx config must declare its own HTTPS server block",
  );
  assert.match(
    nginxSource,
    /ssl_certificate\s+\/etc\/letsencrypt\/live\/lanaya\.space\/fullchain\.pem;/,
    "lanaya.space nginx config must use the lanaya.space certificate",
  );
  assert.match(
    nginxSource,
    /ssl_certificate_key\s+\/etc\/letsencrypt\/live\/lanaya\.space\/privkey\.pem;/,
    "lanaya.space nginx config must use the lanaya.space private key",
  );
  assert.equal(
    deployWorkflow.split(/\r?\n/).some((line) => /certbot/.test(line) && /\|\|\s*true/.test(line)),
    false,
    "deploy must not ignore certbot failures; otherwise HTTPS can fall back to another vhost",
  );
});

test("production health checks fail on cross-domain redirects", () => {
  assert.match(
    deployWorkflow,
    /%\{redirect_url\}/,
    "deploy health checks must inspect redirect_url",
  );
  assert.doesNotMatch(
    deployWorkflow,
    /curl[^\n]*--location[^\n]*HEALTHCHECK/,
    "production health checks must not follow redirects because that can hide a wrong nginx vhost",
  );
});

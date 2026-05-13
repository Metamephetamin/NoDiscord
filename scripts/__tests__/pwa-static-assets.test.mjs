import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readText = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("index.html exposes a web app manifest", () => {
  const indexHtml = readText("index.html");

  assert.match(indexHtml, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?>/i);
  assert.match(indexHtml, /<meta\s+name="theme-color"\s+content="#0f1115"\s*\/?>/i);
});

test("web app manifest describes an installable Lanaya shell", () => {
  const manifest = JSON.parse(readText("public/manifest.webmanifest"));

  assert.equal(manifest.name, "Lanaya");
  assert.equal(manifest.short_name, "Lanaya");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#0f1115");
  assert.equal(manifest.background_color, "#0f1115");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some((icon) => icon.src === "/image/app-logos/logo-gradient-dark.png"));
});

test("push service worker keeps push support and adds conservative static caching", () => {
  const serviceWorker = readText("public/push-sw.js");

  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(serviceWorker, /addEventListener\("notificationclick"/);
  assert.match(serviceWorker, /APP_SHELL_CACHE_NAME/);
  assert.match(serviceWorker, /STATIC_ASSET_PATH_PATTERN/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.doesNotMatch(serviceWorker, /\/api|\/chatHub|\/voiceHub|\/livekit/);
});

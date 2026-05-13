const DEFAULT_PUSH_LOGO = "/image/app-logos/logo-white-dark.png";
const APP_SHELL_CACHE_NAME = "lanaya-app-shell-v1";
const STATIC_ASSET_CACHE_NAME = "lanaya-static-assets-v1";
const CACHE_NAMES = new Set([APP_SHELL_CACHE_NAME, STATIC_ASSET_CACHE_NAME]);
const APP_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/image/app-logos/logo-gradient-dark.png",
  DEFAULT_PUSH_LOGO,
];
const STATIC_ASSET_PATH_PATTERN = /^\/(?:assets\/|audio\/|fonts\/|icons\/|image\/app-logos\/|sounds\/|landing-download\.js$|manifest\.webmanifest$)/;
const SAFE_PAYLOAD_KEYS = new Set([
  "type",
  "url",
  "route",
  "channelId",
  "conversationId",
  "serverId",
  "messageId",
  "senderId",
  "title",
  "body",
  "tag",
]);
const FORBIDDEN_PAYLOAD_KEY_PATTERN = /(token|secret|password|cookie|authorization|auth|refresh|access)/i;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE_NAME);
    await cache.addAll(APP_SHELL_URLS);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (
      name.startsWith("lanaya-") && !CACHE_NAMES.has(name) ? caches.delete(name) : undefined
    )));
    await self.clients.claim();
  })());
});

function shouldHandleFetch(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

function shouldCacheStaticRequest(request) {
  const url = new URL(request.url);
  return STATIC_ASSET_PATH_PATTERN.test(url.pathname);
}

async function putSuccessfulResponse(cacheName, request, response) {
  if (!response || response.status !== 200 || !["basic", "cors"].includes(response.type)) {
    return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    return putSuccessfulResponse(APP_SHELL_CACHE_NAME, "/", response);
  } catch {
    const cachedShell = await caches.match("/");
    return cachedShell || Response.error();
  }
}

async function handleStaticAssetRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  return putSuccessfulResponse(STATIC_ASSET_CACHE_NAME, request, response);
}

self.addEventListener("fetch", (event) => {
  if (!shouldHandleFetch(event.request)) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  if (shouldCacheStaticRequest(event.request)) {
    event.respondWith(handleStaticAssetRequest(event.request));
  }
});

function sanitizePushPayload(payload) {
  const sanitized = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || FORBIDDEN_PAYLOAD_KEY_PATTERN.test(normalizedKey) || !SAFE_PAYLOAD_KEYS.has(normalizedKey)) {
      return;
    }

    sanitized[normalizedKey] = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? value
      : String(value ?? "");
  });
  return sanitized;
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};

    try {
      payload = event.data?.json?.() || {};
    } catch {
      payload = {};
    }

    const safePayload = sanitizePushPayload(payload);
    const title = String(safePayload?.title || "Lanaya");
    const body = String(safePayload?.body || "").trim();
    const icon = DEFAULT_PUSH_LOGO;
    const badge = DEFAULT_PUSH_LOGO;
    const tag = String(safePayload?.tag || "").trim();
    const url = String(safePayload?.url || "/").trim() || "/";

    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const hasVisibleClient = windowClients.some((client) => client.visibilityState === "visible");

    if (hasVisibleClient) {
      windowClients.forEach((client) => {
        client.postMessage({
          type: "push:received",
          payload: safePayload,
        });
      });
      return;
    }

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: true,
      data: {
        url,
        type: String(safePayload?.type || "").trim(),
        payload: safePayload,
      },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const targetUrl = String(event.notification?.data?.url || "/").trim() || "/";
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      const clientUrl = new URL(client.url);
      const requestedUrl = new URL(targetUrl, client.url);
      if (clientUrl.origin === requestedUrl.origin) {
        await client.focus();
        client.postMessage({
          type: "push:open",
          payload: event.notification?.data?.payload || {},
        });
        return;
      }
    }

    await self.clients.openWindow(targetUrl);
  })());
});

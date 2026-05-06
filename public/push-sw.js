self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const DEFAULT_PUSH_LOGO = "/image/app-logos/logo-white-dark.png";
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

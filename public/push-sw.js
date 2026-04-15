self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};

    try {
      payload = event.data?.json?.() || {};
    } catch {
      payload = {};
    }

    const title = String(payload?.title || "Tend");
    const body = String(payload?.body || "").trim();
    const icon = String(payload?.icon || "/image/image.png").trim();
    const badge = String(payload?.badge || icon || "/image/image.png").trim();
    const tag = String(payload?.tag || "").trim();
    const url = String(payload?.url || "/").trim() || "/";

    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const hasVisibleClient = windowClients.some((client) => client.visibilityState === "visible");

    if (hasVisibleClient) {
      windowClients.forEach((client) => {
        client.postMessage({
          type: "push:received",
          payload,
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
        type: String(payload?.type || "").trim(),
        payload,
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

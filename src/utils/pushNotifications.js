import { API_BASE_URL } from "../config/runtime";
import { authFetch, parseApiResponse } from "./auth";

const PUSH_PERMISSION_PROMPT_KEY = "nd_push_permission_prompted_v1";

function isBrowserPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

function isElectronRuntime() {
  return typeof window !== "undefined" && Boolean(
    window?.electronSecureSession?.get
    || window?.electronAppLinks?.onNavigate
    || window?.electronRuntime?.isPackagedApp
  );
}

function canUseBrowserPush() {
  if (!isBrowserPushSupported() || isElectronRuntime()) {
    return false;
  }

  if (window.isSecureContext) {
    return true;
  }

  const host = String(window.location?.hostname || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function urlBase64ToUint8Array(base64String) {
  const normalized = String(base64String || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
  const rawData = atob(padded);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function getDeviceLabel() {
  const language = String(navigator.language || "").trim();
  const platform = String(navigator.platform || "").trim();
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent) ? "mobile" : "desktop";
  return [mobile, platform, language].filter(Boolean).join(" · ").slice(0, 180);
}

async function fetchPushPublicKey() {
  const response = await fetch(`${API_BASE_URL}/push/public-key`, {
    method: "GET",
    credentials: "same-origin",
  });
  const data = await parseApiResponse(response);

  if (!response.ok || !data?.enabled || !data?.publicKey) {
    return "";
  }

  return String(data.publicKey || "").trim();
}

async function syncSubscriptionWithServer(subscription) {
  const json = subscription?.toJSON?.();
  const endpoint = String(json?.endpoint || subscription?.endpoint || "").trim();
  const p256dh = String(json?.keys?.p256dh || "").trim();
  const auth = String(json?.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    return false;
  }

  const response = await authFetch(`${API_BASE_URL}/push/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      deviceLabel: getDeviceLabel(),
    }),
  });

  return response.ok;
}

export async function unregisterBrowserPushSubscription() {
  if (!canUseBrowserPush()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration("/push-sw.js");
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) {
    return;
  }

  try {
    await authFetch(`${API_BASE_URL}/push/subscriptions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch {
    // ignore server cleanup failures
  }

  try {
    await subscription.unsubscribe();
  } catch {
    // ignore browser unsubscribe failures
  }
}

export async function ensureBrowserPushSubscription() {
  if (!canUseBrowserPush()) {
    return { supported: false, subscribed: false };
  }

  const publicKey = await fetchPushPublicKey();
  if (!publicKey) {
    return { supported: false, subscribed: false };
  }

  const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  let permission = Notification.permission;

  if (permission === "default" && !window.localStorage.getItem(PUSH_PERMISSION_PROMPT_KEY)) {
    window.localStorage.setItem(PUSH_PERMISSION_PROMPT_KEY, "true");
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { supported: true, subscribed: false, permission };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const synced = await syncSubscriptionWithServer(subscription);
  return {
    supported: true,
    subscribed: synced,
    permission,
  };
}

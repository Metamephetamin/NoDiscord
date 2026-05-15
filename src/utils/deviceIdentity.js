const DEVICE_TOKEN_STORAGE_KEY = "lanaya.auth.deviceToken.v1";
const DEVICE_TOKEN_PREFIX = "ldv1";

let cachedDeviceToken = "";

function normalizeDeviceToken(value) {
  const normalized = String(value || "").trim();
  if (normalized.length < 32 || normalized.length > 512) {
    return "";
  }

  return /^[!-~]+$/.test(normalized) ? normalized : "";
}

function generateDeviceToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${DEVICE_TOKEN_PREFIX}.${crypto.randomUUID()}.${crypto.randomUUID()}`;
  }

  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return `${DEVICE_TOKEN_PREFIX}.${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function readLocalDeviceToken() {
  try {
    return normalizeDeviceToken(localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY));
  } catch {
    return "";
  }
}

function writeLocalDeviceToken(value) {
  try {
    localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, value);
  } catch {
    // Local storage can be blocked; the in-memory cache still covers this session.
  }
}

async function readElectronDeviceToken() {
  if (typeof window === "undefined" || !window.electronDeviceIdentity?.get) {
    return "";
  }

  try {
    return normalizeDeviceToken(await window.electronDeviceIdentity.get());
  } catch {
    return "";
  }
}

async function writeElectronDeviceToken(value) {
  if (typeof window === "undefined" || !window.electronDeviceIdentity?.set) {
    return;
  }

  try {
    await window.electronDeviceIdentity.set(value);
  } catch {
    // Secure device identity persistence is best-effort.
  }
}

export async function getAuthDeviceToken() {
  if (cachedDeviceToken) {
    return cachedDeviceToken;
  }

  const electronToken = await readElectronDeviceToken();
  const localToken = readLocalDeviceToken();
  const deviceToken = electronToken || localToken || generateDeviceToken();

  cachedDeviceToken = deviceToken;
  if (!electronToken) {
    await writeElectronDeviceToken(deviceToken);
  }
  if (!localToken) {
    writeLocalDeviceToken(deviceToken);
  }

  return deviceToken;
}

export function normalizeAuthDeviceTokenForTest(value) {
  return normalizeDeviceToken(value);
}

const DEFAULT_BASE_URL = "https://lanaya.space";

export class SmokeSkip extends Error {
  constructor(message) {
    super(message);
    this.name = "SmokeSkip";
  }
}

export function getSmokeBaseUrl() {
  return String(process.env.SMOKE_BASE_URL || process.env.RELEASE_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function isStrictSmokeEnabled() {
  return process.env.SMOKE_REQUIRE_CREDENTIALS === "1" || process.env.SMOKE_STRICT === "1";
}

export function requireSmokeValue(name, description) {
  const value = String(process.env[name] || "").trim();
  if (value) {
    return value;
  }

  if (isStrictSmokeEnabled()) {
    throw new Error(`${name} is required for ${description}.`);
  }

  throw new SmokeSkip(`${description} skipped: ${name} is not configured.`);
}

export async function requestJson(path, {
  baseUrl = getSmokeBaseUrl(),
  method = "GET",
  token = "",
  body,
  headers = {},
  expectedStatuses = [200],
} = {}) {
  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let requestBody;
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: requestBody,
    redirect: "follow",
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}.`);
  }

  return { response, payload };
}

export async function smokeLogin() {
  const email = requireSmokeValue("SMOKE_TEST_EMAIL", "authenticated smoke");
  const password = requireSmokeValue("SMOKE_TEST_PASSWORD", "authenticated smoke");
  const totpCode = String(process.env.SMOKE_TEST_TOTP_CODE || "").trim();
  const { payload } = await requestJson("/api/auth/login", {
    method: "POST",
    body: {
      identifier: email,
      email,
      password,
      ...(totpCode ? { totpCode } : {}),
    },
  });
  const token = String(payload?.token || payload?.accessToken || "").trim();
  if (!token) {
    throw new Error("Login succeeded but no access token was returned.");
  }

  return {
    token,
    userId: String(payload?.id || ""),
    email,
  };
}

export function createClientMessageId(scope) {
  const random = Math.random().toString(16).slice(2);
  return `${scope}-${Date.now().toString(36)}-${random}`;
}

export async function runSmoke(name, fn) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (error) {
    if (error instanceof SmokeSkip) {
      console.log(`skip ${name}: ${error.message}`);
      return;
    }

    console.error(`fail ${name}: ${error?.message || String(error)}`);
    process.exitCode = 1;
  }
}

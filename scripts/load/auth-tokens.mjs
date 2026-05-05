import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = String(process.env.LOAD_TEST_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const userCount = Math.max(1, Number(process.env.LOAD_TEST_USER_COUNT || 100));
const startIndex = Math.max(1, Number(process.env.LOAD_TEST_START_INDEX || 1));
const emailPrefix = String(process.env.LOAD_TEST_EMAIL_PREFIX || "tend-load");
const emailDomain = String(process.env.LOAD_TEST_EMAIL_DOMAIN || "load.local");
const password = String(process.env.LOAD_TEST_PASSWORD || "");
const createUsers = String(process.env.LOAD_TEST_CREATE_USERS || "").toLowerCase() === "true";
const outputFile = String(process.env.LOAD_TEST_OUTPUT || "scripts/load/.tokens.json");
const requestDelayMs = Math.max(0, Number(process.env.LOAD_TEST_REQUEST_DELAY_MS || 100));

if (!password || password.length < 6) {
  throw new Error("Set LOAD_TEST_PASSWORD to the shared password for dedicated load-test users.");
}

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const padIndex = (value) => String(value).padStart(3, "0");

const buildUser = (index) => {
  const suffix = padIndex(index);
  return {
    email: `${emailPrefix}${suffix}@${emailDomain}`.toLowerCase(),
    nickname: `${emailPrefix}${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32),
    first_name: "Load",
    last_name: "Test",
    password,
  };
};

const requestJson = async (path, payload) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  return { response, data };
};

const extractToken = (data) => String(data?.token || data?.accessToken || "").trim();

const loginUser = async (user) => {
  const { response, data } = await requestJson("/api/auth/login", {
    identifier: user.email,
    password: user.password,
  });

  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }

  const token = extractToken(data);
  return token
    ? { ok: true, token, data }
    : { ok: false, status: response.status, data: { message: "Login response did not contain token." } };
};

const registerUser = async (user) => {
  const { response, data } = await requestJson("/api/auth/register", user);
  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }

  const token = extractToken(data);
  if (!token && data?.pendingEmailVerification) {
    return {
      ok: false,
      status: response.status,
      data: { message: "Registration requires email verification; create verified users through staging/admin DB seed." },
    };
  }

  return token
    ? { ok: true, token, data }
    : { ok: false, status: response.status, data: { message: "Register response did not contain token." } };
};

const users = Array.from({ length: userCount }, (_, offset) => buildUser(startIndex + offset));
const tokens = [];
const results = [];
const startedAt = performance.now();

for (const [offset, user] of users.entries()) {
  let result = await loginUser(user);
  if (!result.ok && createUsers) {
    const registerResult = await registerUser(user);
    result = registerResult.ok ? registerResult : await loginUser(user);
  }

  if (result.ok) {
    tokens.push(result.token);
    results.push({ email: user.email, nickname: user.nickname, status: "ok" });
  } else {
    results.push({
      email: user.email,
      nickname: user.nickname,
      status: "failed",
      httpStatus: result.status || 0,
      message: result.data?.message || result.data?.code || "auth failed",
    });
  }

  const current = offset + 1;
  if (current % 10 === 0 || current === users.length) {
    console.error(`[load-auth] ${current}/${users.length}, tokens=${tokens.length}`);
  }

  if (requestDelayMs) {
    await sleep(requestDelayMs);
  }
}

const output = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  requestedUsers: users.length,
  tokenCount: tokens.length,
  durationMs: Math.round(performance.now() - startedAt),
  tokens,
  users: results,
};

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  baseUrl,
  outputFile,
  requestedUsers: output.requestedUsers,
  tokenCount: output.tokenCount,
  failed: output.users.filter((item) => item.status !== "ok").length,
  durationMs: output.durationMs,
}, null, 2));

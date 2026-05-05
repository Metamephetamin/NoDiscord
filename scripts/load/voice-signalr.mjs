import * as signalR from "@microsoft/signalr";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const baseUrl = String(process.env.LOAD_TEST_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const channel = String(process.env.LOAD_TEST_VOICE_CHANNEL || "").trim();
const durationMs = Math.max(1, Number(process.env.LOAD_TEST_DURATION_SECONDS || 30)) * 1000;
const connectDelayMs = Math.max(0, Number(process.env.LOAD_TEST_CONNECT_DELAY_MS || 100));
const requestedConnections = Math.max(0, Number(process.env.LOAD_TEST_CONNECTIONS || 0));

const readTokensFile = (filePath) => {
  if (!filePath) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const rawTokens = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.tokens)
      ? parsed.tokens
      : [];

  return rawTokens.map((item) => String(item || "").trim()).filter(Boolean);
};

const envTokens = String(process.env.LOAD_TEST_TOKENS || process.env.LOAD_TEST_TOKEN || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const fileTokens = readTokensFile(process.env.LOAD_TEST_TOKENS_FILE || "");
const allTokens = [...envTokens, ...fileTokens];
const tokens = requestedConnections > 0 ? allTokens.slice(0, requestedConnections) : allTokens;

if (!channel) {
  throw new Error("Set LOAD_TEST_VOICE_CHANNEL to the exact voice channel id/name.");
}

if (!tokens.length) {
  throw new Error("Set LOAD_TEST_TOKEN, LOAD_TEST_TOKENS, or LOAD_TEST_TOKENS_FILE. Use test accounts, not a personal production session.");
}

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const percentile = (values, percent) => {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((percent / 100) * sorted.length));
  return sorted[index];
};

const connections = [];
const connectSamples = [];
const joinSamples = [];
let updateEvents = 0;
let failures = 0;

const startConnection = async (token, index) => {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${baseUrl}/voiceHub`, {
      accessTokenFactory: () => token,
      transport: signalR.HttpTransportType.WebSockets,
      skipNegotiation: false,
    })
    .withAutomaticReconnect()
    .build();

  connection.on("voice:update", () => {
    updateEvents += 1;
  });
  connection.on("voice:channel-update", () => {
    updateEvents += 1;
  });

  const connectStartedAt = performance.now();
  await connection.start();
  connectSamples.push(performance.now() - connectStartedAt);

  const joinStartedAt = performance.now();
  await connection.invoke("Register", `load-${index}`, `Load ${index}`, "");
  await connection.invoke("JoinChannel", channel, `load-${index}`, `Load ${index}`, "");
  joinSamples.push(performance.now() - joinStartedAt);

  connections.push(connection);
};

for (const [index, token] of tokens.entries()) {
  try {
    await startConnection(token, index + 1);
  } catch (error) {
    failures += 1;
    console.error(`[voice-load] failed to start connection ${index + 1}: ${error?.message || error}`);
  }

  if (connectDelayMs) {
    await sleep(connectDelayMs);
  }
}

await sleep(durationMs);

await Promise.all(connections.map(async (connection) => {
  try {
    await connection.invoke("LeaveChannel", "");
  } catch {
    failures += 1;
  }

  await connection.stop().catch(() => {
    failures += 1;
  });
}));

console.log(JSON.stringify({
  baseUrl,
  channel,
  requestedConnections: tokens.length,
  activeConnections: connections.length,
  durationSeconds: durationMs / 1000,
  updateEvents,
  failures,
  connectP50Ms: Math.round(percentile(connectSamples, 50)),
  connectP95Ms: Math.round(percentile(connectSamples, 95)),
  joinP50Ms: Math.round(percentile(joinSamples, 50)),
  joinP95Ms: Math.round(percentile(joinSamples, 95)),
  note: tokens.length === 1
    ? "One token exercises reconnect/control-plane pressure, but many real participants require LOAD_TEST_TOKENS from separate test users."
    : "Use server CPU, memory, websocket count, and LiveKit metrics beside this client summary.",
}, null, 2));

import { spawn } from "node:child_process";

const DEFAULT_PRODUCTION_API_URL = "https://tendsec.ru";
const DEFAULT_PRODUCTION_LIVEKIT_URL = "wss://tendsec.ru/livekit";

const targetScript = String(process.argv[2] || "").trim();

if (!targetScript) {
  console.error("Usage: node scripts/run-with-runtime.mjs <npm-script>");
  process.exit(1);
}

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnv = Object.fromEntries(
  Object.entries({
    ...process.env,
    ND_API_URL: process.env.ND_API_URL?.trim() || DEFAULT_PRODUCTION_API_URL,
    VITE_API_URL: process.env.VITE_API_URL?.trim() || DEFAULT_PRODUCTION_API_URL,
    ND_LIVEKIT_URL: process.env.ND_LIVEKIT_URL?.trim() || DEFAULT_PRODUCTION_LIVEKIT_URL,
  }).map(([key, value]) => [String(key), String(value ?? "")])
);

const child = spawn(command, ["run", targetScript], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: childEnv,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

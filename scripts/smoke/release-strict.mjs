import { spawn } from "node:child_process";
import { resolve } from "node:path";

const smokeScripts = [
  "readiness-smoke.mjs",
  "auth-smoke.mjs",
  "chat-smoke.mjs",
  "upload-smoke.mjs",
  "voice-smoke.mjs",
];

const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith("="))
);

function runSmokeScript(scriptName) {
  const scriptPath = resolve(import.meta.dirname, scriptName);

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: childEnv,
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`${scriptName} terminated by ${signal}`));
        return;
      }

      if (code) {
        rejectRun(new Error(`${scriptName} exited with code ${code}`));
        return;
      }

      resolveRun();
    });

    child.on("error", (error) => {
      rejectRun(new Error(`failed to start ${scriptName}: ${error.message}`));
    });
  });
}

try {
  for (const scriptName of smokeScripts) {
    await runSmokeScript(scriptName);
  }
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}

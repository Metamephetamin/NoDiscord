import { spawn } from "node:child_process";

const automatedChecks = [
  ["npm", ["run", "test:auth-branding"]],
  ["npm", ["run", "test:upload-ui"]],
  ["npm", ["run", "test:media-preview"]],
  ["npm", ["run", "test:console-secrets"]],
];

const manualChecks = [
  "login with existing account",
  "send and receive direct message",
  "send and receive server channel message",
  "upload small image",
  "upload zip and see progress UI",
  "blocked exe shows clear error",
  "join voice, speak, leave",
  "start/stop camera",
  "start/stop screen share",
  "native notification opens expected area",
  "restart app restores session",
];

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const commandLine = [command, ...args].join(" ");
    console.log(`\n> ${commandLine}`);
    const child = spawn(commandLine, {
      stdio: "inherit",
      shell: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

for (const [command, args] of automatedChecks) {
  await runCommand(command, args);
}

console.log("\nAutomated E2E smoke helpers completed.");
console.log("Manual logged-in Electron checks still required:");
manualChecks.forEach((check) => console.log(`- ${check}`));

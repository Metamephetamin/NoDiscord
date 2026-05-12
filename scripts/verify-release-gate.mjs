import { spawn } from "node:child_process";

const commands = [
  ["npm", ["run", "check:encoding"]],
  ["npm", ["run", "test:encoding"]],
  ["npm", ["run", "test:auth-branding"]],
  ["npm", ["run", "lint:ci"]],
  ["npm", ["run", "build:frontend"]],
  ["npm", ["run", "audit:public-assets"]],
  ["npm", ["run", "audit:perf"]],
  ["dotnet", ["test", "BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj", "--configuration", "Release"]],
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

for (const [command, args] of commands) {
  await runCommand(command, args);
}

console.log("\nRelease gate passed.");

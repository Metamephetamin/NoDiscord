/* eslint-disable no-irregular-whitespace */
import fs from "node:fs";
import path from "node:path";

const roots = [
  "src/components",
  "src/SignalR",
  "src/api",
  "src/utils",
  "src/main.js",
  "src/preload.js",
  "src/renderer.jsx",
  "forge.config.js",
  "BackNoDiscord/BackNoDiscord/Security",
  "BackNoDiscord/BackNoDiscord/Controllers",
  "BackNoDiscord/BackNoDiscord/ChatHub.cs",
  "BackNoDiscord/BackNoDiscord/VoiceHub.cs",
  "BackNoDiscord/BackNoDiscord/Program.cs",
  "BackNoDiscord/BackNoDiscord/Services",
];

const extensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".cs", ".json", ".md", ".yml", ".yaml"]);
const suspiciousPattern = /[Р РЎР“][РѓС“С”С•С–С–С—СС™СљС›СџРЋСћР‰РЉР‹РЏ]|РІР‚|Р“вЂ”|пїЅ/u;
const knownLegacyEncodingIssues = new Set([
  "src/utils/avatarMedia.js",
  "src/main.js",
  "BackNoDiscord/BackNoDiscord/Security/AuthInputPolicies.cs",
]);
const failures = [];

const walk = (targetPath) => {
  const fullPath = path.resolve(targetPath);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(fullPath)) {
      walk(path.join(fullPath, entry));
    }
    return;
  }

  if (!extensions.has(path.extname(fullPath))) {
    return;
  }

  const relativePath = path.relative(process.cwd(), fullPath);
  const normalizedRelativePath = relativePath.split(path.sep).join("/");
  if (knownLegacyEncodingIssues.has(normalizedRelativePath)) {
    return;
  }

  const text = fs.readFileSync(fullPath, "utf8");
  if (suspiciousPattern.test(text)) {
    failures.push(normalizedRelativePath);
  }
};

for (const root of roots) {
  walk(root);
}

if (failures.length) {
  console.error("Potential encoding issues found:");
  for (const file of failures) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log("Encoding check passed.");

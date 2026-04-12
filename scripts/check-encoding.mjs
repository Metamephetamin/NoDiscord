import fs from "node:fs";
import path from "node:path";

const roots = [
  "src",
  "landing",
  "BackNoDiscord/BackNoDiscord",
  "forge.config.js",
  "index.html",
  "package.json",
  ".github/workflows",
];

const ignoredDirectories = new Set([
  ".git",
  ".vite",
  "bin",
  "dist",
  "node_modules",
  "obj",
]);

const extensions = new Set([
  ".cs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

// Characters that frequently appear when UTF-8 Cyrillic text was decoded as CP1251.
// Normal Russian text does not contain these symbols, so this catches "РќРµ..."-style mojibake
// without flagging valid words like "Роли", "Разрешение" or "Редактировать".
const mojibakeMarkerPattern = /[\u0402\u0403\u0405\u0406\u040A-\u040F\u0452-\u045F\u0491\u00B0\u00B1\u00B5\u00BB\u201A\u201E\u201C\u201D\u2020\u2021\u0098\u009D]/u;

const replacementCharacterPattern = /\uFFFD/u;
const questionPlaceholderPattern = /(["'`])(?:(?!\1).)*\?{3,}(?:(?!\1).)*\1/u;

const failures = [];

const addFailure = (filePath, lineNumber, reason, line) => {
  failures.push({
    filePath,
    lineNumber,
    reason,
    line: line.trim(),
  });
};

const checkFile = (fullPath) => {
  const relativePath = path.relative(process.cwd(), fullPath).split(path.sep).join("/");
  const text = fs.readFileSync(fullPath, "utf8");
  const lines = text.split(/\r?\n/u);

  lines.forEach((line, index) => {
    if (replacementCharacterPattern.test(line)) {
      addFailure(relativePath, index + 1, "replacement character U+FFFD", line);
    }

    if (mojibakeMarkerPattern.test(line)) {
      addFailure(relativePath, index + 1, "possible CP1251/UTF-8 mojibake", line);
    }

    if (questionPlaceholderPattern.test(line)) {
      addFailure(relativePath, index + 1, "question-mark placeholder text", line);
    }
  });
};

const walk = (targetPath) => {
  const fullPath = path.resolve(targetPath);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    if (ignoredDirectories.has(path.basename(fullPath))) {
      return;
    }

    for (const entry of fs.readdirSync(fullPath)) {
      walk(path.join(fullPath, entry));
    }
    return;
  }

  if (extensions.has(path.extname(fullPath))) {
    checkFile(fullPath);
  }
};

for (const root of roots) {
  walk(root);
}

if (failures.length) {
  console.error("Potential encoding issues found:");
  for (const failure of failures) {
    console.error(` - ${failure.filePath}:${failure.lineNumber} ${failure.reason}`);
    console.error(`   ${failure.line}`);
  }
  process.exit(1);
}

console.log("Encoding check passed.");

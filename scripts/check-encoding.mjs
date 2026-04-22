import fs from "node:fs";
import path from "node:path";

import { collectEncodingTargetFiles, findEncodingIssuesInText, fixEncodingInText } from "./lib/encoding-tools.mjs";

const fixMode = process.argv.includes("--fix");
const failures = [];
const fixedFiles = [];

for (const fullPath of collectEncodingTargetFiles()) {
  const relativePath = path.relative(process.cwd(), fullPath).split(path.sep).join("/");
  const originalText = fs.readFileSync(fullPath, "utf8");
  let nextText = originalText;

  if (fixMode) {
    const repairResult = fixEncodingInText(originalText);
    if (repairResult.changed) {
      fs.writeFileSync(fullPath, repairResult.text, "utf8");
      fixedFiles.push(relativePath);
      nextText = repairResult.text;
    }
  }

  const issues = findEncodingIssuesInText(nextText);
  for (const issue of issues) {
    failures.push({
      filePath: relativePath,
      ...issue,
    });
  }
}

if (fixedFiles.length) {
  console.log(`Encoding auto-fix updated ${fixedFiles.length} file(s):`);
  for (const filePath of fixedFiles) {
    console.log(` - ${filePath}`);
  }
}

if (failures.length) {
  console.error("Potential encoding issues found:");
  for (const failure of failures) {
    console.error(` - ${failure.filePath}:${failure.lineNumber} ${failure.reason}`);
    console.error(`   ${failure.line}`);
  }
  process.exit(1);
}

console.log(fixMode ? "Encoding check passed after auto-fix." : "Encoding check passed.");

import fs from "node:fs";
import path from "node:path";

export const roots = [
  "src",
  "landing",
  "BackNoDiscord/BackNoDiscord",
  "forge.config.js",
  "index.html",
  "package.json",
  ".github/workflows",
];

export const ignoredDirectories = new Set([
  ".git",
  ".vite",
  "bin",
  "dist",
  "node_modules",
  "obj",
]);

export const extensions = new Set([
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

const rareMojibakeLetterClass = "\u0402\u0403\u0405\u0406\u0407\u0408\u0409\u040A\u040B\u040C\u040E\u040F\u0452\u0453\u0454\u0455\u0456\u0457\u0458\u0459\u045A\u045B\u045C\u045E\u045F\u0490\u0491";
const symbolMojibakeCharClass = `${rareMojibakeLetterClass}\u0080-\u009F\u00A4\u00A6\u00A7\u00AE\u00B0\u00B1\u00B5\u00BB\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2039\u203A`;
const legacyMojibakeMarkerPattern = new RegExp(`[${rareMojibakeLetterClass}]`, "u");
const pairSecondCharClass = `\u0400-\u04FF${symbolMojibakeCharClass}`;
const cp1251Utf8PairPattern = new RegExp(`(?:[РС][${pairSecondCharClass}])+`, "u");
const cp1251Utf8PairPatternGlobal = new RegExp(`(?:[РС][${pairSecondCharClass}])+`, "gu");
const symbolMojibakePattern = new RegExp(`[вр][${symbolMojibakeCharClass}]{2,}`, "u");
const replacementCharacterPattern = /\uFFFD/u;
const questionPlaceholderPattern = /(["'`])(?:(?!\1).)*\?{3,}(?:(?!\1).)*\1/u;
const repairTokenPattern = /[\p{L}\p{M}\p{N}\u0080-\u00FF\u0400-\u04FF\u2010-\u203A\u20AC\u2116\u2122]+/gu;
const repairSegmentPattern = new RegExp(`(?:[Р\u00A0РЎ][${pairSecondCharClass}])+|[РІСЂ][${symbolMojibakeCharClass}]{2,}`, "gu");

const cp1251SpecialByteByCodePoint = new Map([
  [0x0402, 0x80],
  [0x0403, 0x81],
  [0x201A, 0x82],
  [0x0453, 0x83],
  [0x201E, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x20AC, 0x88],
  [0x2030, 0x89],
  [0x0409, 0x8A],
  [0x2039, 0x8B],
  [0x040A, 0x8C],
  [0x040C, 0x8D],
  [0x040B, 0x8E],
  [0x040F, 0x8F],
  [0x0452, 0x90],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201C, 0x93],
  [0x201D, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x0098, 0x98],
  [0x2122, 0x99],
  [0x0459, 0x9A],
  [0x203A, 0x9B],
  [0x045A, 0x9C],
  [0x009D, 0x9D],
  [0x045C, 0x9D],
  [0x045B, 0x9E],
  [0x045F, 0x9F],
  [0x00A0, 0xA0],
  [0x040E, 0xA1],
  [0x045E, 0xA2],
  [0x0408, 0xA3],
  [0x00A4, 0xA4],
  [0x0490, 0xA5],
  [0x00A6, 0xA6],
  [0x00A7, 0xA7],
  [0x0401, 0xA8],
  [0x00A9, 0xA9],
  [0x0404, 0xAA],
  [0x00AB, 0xAB],
  [0x00AC, 0xAC],
  [0x00AD, 0xAD],
  [0x00AE, 0xAE],
  [0x0407, 0xAF],
  [0x00B0, 0xB0],
  [0x00B1, 0xB1],
  [0x0406, 0xB2],
  [0x0456, 0xB3],
  [0x0491, 0xB4],
  [0x00B5, 0xB5],
  [0x00B6, 0xB6],
  [0x00B7, 0xB7],
  [0x0451, 0xB8],
  [0x2116, 0xB9],
  [0x0454, 0xBA],
  [0x00BB, 0xBB],
  [0x0458, 0xBC],
  [0x0405, 0xBD],
  [0x0455, 0xBE],
  [0x0457, 0xBF],
]);

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const encodeWindows1251 = (value) => {
  const bytes = [];

  for (const char of value) {
    const codePoint = char.codePointAt(0);

    if (codePoint <= 0x7F) {
      bytes.push(codePoint);
      continue;
    }

    if (codePoint >= 0x0410 && codePoint <= 0x044F) {
      bytes.push(codePoint - 0x350);
      continue;
    }

    const mappedByte = cp1251SpecialByteByCodePoint.get(codePoint);
    if (mappedByte !== undefined) {
      bytes.push(mappedByte);
      continue;
    }

    throw new Error(`Unsupported Windows-1251 character U+${codePoint.toString(16).toUpperCase()}`);
  }

  return Uint8Array.from(bytes);
};

const getSuspiciousScore = (value) => {
  let score = 0;

  if (replacementCharacterPattern.test(value)) {
    score += 10;
  }

  if (legacyMojibakeMarkerPattern.test(value)) {
    score += 6;
  }

  const pairMatches = value.match(cp1251Utf8PairPatternGlobal) || [];
  const symbolMatches = value.match(new RegExp(`[вр][${symbolMojibakeCharClass}]{2,}`, "gu")) || [];

  for (const match of pairMatches) {
    score += match.length;
  }

  for (const match of symbolMatches) {
    score += match.length * 2;
  }

  return score;
};

const isSafeDecodedValue = (value) => {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (
      (codePoint >= 0x00 && codePoint <= 0x08)
      || codePoint === 0x0B
      || codePoint === 0x0C
      || (codePoint >= 0x0E && codePoint <= 0x1F)
      || (codePoint >= 0x7F && codePoint <= 0x9F)
    ) {
      return false;
    }
  }

  return true;
};

const repairToken = (token) => {
  if (token.length < 2) {
    return token;
  }

  let repaired;

  try {
    repaired = utf8Decoder.decode(encodeWindows1251(token));
  } catch {
    return token;
  }

  if (repaired === token) {
    return token;
  }

  if (!isSafeDecodedValue(repaired) || replacementCharacterPattern.test(repaired)) {
    return token;
  }

  return getSuspiciousScore(repaired) < getSuspiciousScore(token) ? repaired : token;
};

const lineHasRepairableToken = (line) => {
  const tokens = line.match(repairTokenPattern) || [];
  if (tokens.some((token) => repairToken(token) !== token)) {
    return true;
  }

  const segments = line.match(repairSegmentPattern) || [];
  return segments.some((token) => repairToken(token) !== token);
};

export const fixEncodingInText = (text) => {
  let nextText = text;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let repairedText = nextText.replace(repairTokenPattern, (token) => repairToken(token));
    repairedText = repairedText.replace(repairSegmentPattern, (token) => repairToken(token));
    if (repairedText === nextText) {
      break;
    }
    nextText = repairedText;
  }

  return {
    changed: nextText !== text,
    text: nextText,
  };
};

export const findEncodingIssuesInText = (text) => {
  const failures = [];
  const lines = text.split(/\r?\n/u);

  lines.forEach((line, index) => {
    if (replacementCharacterPattern.test(line)) {
      failures.push({
        line: line.trim(),
        lineNumber: index + 1,
        reason: "replacement character U+FFFD",
      });
    }

    if (lineHasRepairableToken(line)) {
      failures.push({
        line: line.trim(),
        lineNumber: index + 1,
        reason: "possible CP1251/UTF-8 mojibake",
      });
    }

    if (questionPlaceholderPattern.test(line)) {
      failures.push({
        line: line.trim(),
        lineNumber: index + 1,
        reason: "question-mark placeholder text",
      });
    }
  });

  return failures;
};

export const collectEncodingTargetFiles = (cwd = process.cwd()) => {
  const files = [];

  const walk = (targetPath) => {
    const fullPath = path.resolve(cwd, targetPath);
    if (!fs.existsSync(fullPath)) {
      return;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (ignoredDirectories.has(path.basename(fullPath))) {
        return;
      }

      for (const entry of fs.readdirSync(fullPath)) {
        walk(path.join(targetPath, entry));
      }
      return;
    }

    if (extensions.has(path.extname(fullPath))) {
      files.push(fullPath);
    }
  };

  for (const root of roots) {
    walk(root);
  }

  return files;
};

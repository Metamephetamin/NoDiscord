import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const REPORT_PATH = path.join(ROOT_DIR, "scripts", "public-asset-audit.json");

async function walk(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function toMegabytes(byteCount) {
  return Number((byteCount / (1024 * 1024)).toFixed(2));
}

const allFiles = await walk(PUBLIC_DIR);
const entries = await Promise.all(
  allFiles.map(async (filePath) => {
    const fileStat = await stat(filePath);
    return {
      path: path.relative(ROOT_DIR, filePath).replaceAll("\\", "/"),
      extension: path.extname(filePath).toLowerCase(),
      bytes: fileStat.size,
      megabytes: toMegabytes(fileStat.size),
    };
  })
);

entries.sort((left, right) => right.bytes - left.bytes);

const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const byExtension = Object.values(
  entries.reduce((accumulator, entry) => {
    const bucket = accumulator[entry.extension] || {
      extension: entry.extension || "[no extension]",
      count: 0,
      bytes: 0,
      megabytes: 0,
    };
    bucket.count += 1;
    bucket.bytes += entry.bytes;
    bucket.megabytes = toMegabytes(bucket.bytes);
    accumulator[entry.extension] = bucket;
    return accumulator;
  }, {})
).sort((left, right) => right.bytes - left.bytes);

const report = {
  generatedAt: new Date().toISOString(),
  publicDir: path.relative(ROOT_DIR, PUBLIC_DIR).replaceAll("\\", "/"),
  totalFiles: entries.length,
  totalMegabytes: toMegabytes(totalBytes),
  topFiles: entries.slice(0, 40),
  totalsByExtension: byExtension,
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`public assets: ${report.totalFiles} files, ${report.totalMegabytes} MB`);
console.table(report.topFiles.slice(0, 20).map((entry) => ({
  MB: entry.megabytes,
  ext: entry.extension || "-",
  path: entry.path,
})));

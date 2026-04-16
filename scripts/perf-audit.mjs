import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const distAssetsDir = path.join(repoRoot, "dist", "assets");
const registryPath = path.join(repoRoot, "docs", "performance", "registry.md");
const reportOutputPath = path.join(repoRoot, ".tmp", "perf-audit-report.json");

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function listDistAssets() {
  try {
    const items = await fs.readdir(distAssetsDir, { withFileTypes: true });
    const assets = [];

    for (const item of items) {
      if (!item.isFile()) {
        continue;
      }

      const fullPath = path.join(distAssetsDir, item.name);
      const stats = await fs.stat(fullPath);
      assets.push({
        name: item.name,
        path: fullPath,
        bytes: stats.size,
        extension: path.extname(item.name).toLowerCase(),
      });
    }

    return assets.sort((left, right) => right.bytes - left.bytes);
  } catch {
    return [];
  }
}

function parseRegistrySections(markdown) {
  const normalized = String(markdown || "");
  const issuePattern = /^##\s+(PERF-\d+)\s+[-–]\s+(.+)$/gm;
  const matches = [...normalized.matchAll(issuePattern)];

  return matches.map((match, index) => {
    const blockStart = match.index ?? 0;
    const blockEnd = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const block = normalized.slice(blockStart, blockEnd);
    const priorityMatch = block.match(/^- Приоритет:\s*(P\d+)/m);
    const statusMatch = block.match(/^- Статус:\s*(.+)$/m);
    const areaMatch = block.match(/^- Зона:\s*(.+)$/m);

    return {
      id: match[1],
      title: match[2].trim(),
      priority: priorityMatch?.[1]?.trim() || "unknown",
      status: statusMatch?.[1]?.trim() || "unknown",
      area: areaMatch?.[1]?.trim() || "unknown",
    };
  });
}

function countBy(items, key) {
  return items.reduce((accumulator, item) => {
    const value = String(item?.[key] || "unknown");
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

async function readRegistryIssues() {
  try {
    const content = await fs.readFile(registryPath, "utf8");
    return parseRegistrySections(content);
  } catch {
    return [];
  }
}

async function main() {
  const assets = await listDistAssets();
  const issues = await readRegistryIssues();
  const jsAssets = assets.filter((item) => item.extension === ".js");
  const cssAssets = assets.filter((item) => item.extension === ".css");

  const report = {
    generatedAt: new Date().toISOString(),
    dist: {
      exists: assets.length > 0,
      assetCount: assets.length,
      jsBytes: jsAssets.reduce((sum, item) => sum + item.bytes, 0),
      cssBytes: cssAssets.reduce((sum, item) => sum + item.bytes, 0),
      topAssets: assets.slice(0, 10).map((item) => ({
        name: item.name,
        bytes: item.bytes,
      })),
    },
    registry: {
      issueCount: issues.length,
      byPriority: countBy(issues, "priority"),
      byStatus: countBy(issues, "status"),
      byArea: countBy(issues, "area"),
    },
  };

  await fs.mkdir(path.dirname(reportOutputPath), { recursive: true });
  await fs.writeFile(reportOutputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Performance audit summary");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Registry issues: ${report.registry.issueCount}`);

  if (issues.length) {
    console.log(`By priority: ${JSON.stringify(report.registry.byPriority)}`);
    console.log(`By status: ${JSON.stringify(report.registry.byStatus)}`);
  } else {
    console.log("By priority: {}");
    console.log("By status: {}");
  }

  if (!assets.length) {
    console.log("Dist assets: not found. Run `npm run build:frontend` first.");
  } else {
    console.log(`JS total: ${formatMb(report.dist.jsBytes)} (${formatKb(report.dist.jsBytes)})`);
    console.log(`CSS total: ${formatMb(report.dist.cssBytes)} (${formatKb(report.dist.cssBytes)})`);
    console.log("Top assets:");
    report.dist.topAssets.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} - ${formatMb(item.bytes)} (${formatKb(item.bytes)})`);
    });
  }

  console.log(`JSON report: ${path.relative(repoRoot, reportOutputPath)}`);
}

main().catch((error) => {
  console.error("Failed to run perf audit:", error);
  process.exitCode = 1;
});

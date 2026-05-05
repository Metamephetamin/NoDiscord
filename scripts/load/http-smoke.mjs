import { performance } from "node:perf_hooks";

const baseUrl = String(process.env.LOAD_TEST_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const durationMs = Math.max(1, Number(process.env.LOAD_TEST_DURATION_SECONDS || 30)) * 1000;
const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 4));
const paths = String(process.env.LOAD_TEST_PATHS || "/api/ping")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const stopAt = performance.now() + durationMs;
const samples = [];
const statusCounts = new Map();

const percentile = (values, percent) => {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((percent / 100) * sorted.length));
  return sorted[index];
};

const recordStatus = (status) => {
  statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
};

const runWorker = async (workerId) => {
  let index = workerId;
  while (performance.now() < stopAt) {
    const path = paths[index % paths.length];
    index += concurrency;
    const startedAt = performance.now();

    try {
      const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
      await response.arrayBuffer();
      recordStatus(response.status);
    } catch {
      recordStatus("network-error");
    } finally {
      samples.push(performance.now() - startedAt);
    }
  }
};

await Promise.all(Array.from({ length: concurrency }, (_, index) => runWorker(index)));

const total = samples.length;
const errors = Array.from(statusCounts.entries())
  .filter(([status]) => typeof status !== "number" || status >= 500)
  .reduce((sum, [, count]) => sum + count, 0);

console.log(JSON.stringify({
  baseUrl,
  paths,
  durationSeconds: durationMs / 1000,
  concurrency,
  total,
  requestsPerSecond: Number((total / (durationMs / 1000)).toFixed(2)),
  p50Ms: Math.round(percentile(samples, 50)),
  p95Ms: Math.round(percentile(samples, 95)),
  p99Ms: Math.round(percentile(samples, 99)),
  maxMs: Math.round(Math.max(0, ...samples)),
  statusCounts: Object.fromEntries(statusCounts),
  serverOrNetworkErrors: errors,
}, null, 2));

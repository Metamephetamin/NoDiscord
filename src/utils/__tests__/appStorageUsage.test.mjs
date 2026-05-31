import assert from "node:assert/strict";
import test from "node:test";

import {
  formatStorageBytes,
  getStorageUsagePercent,
  normalizeStorageUsage,
  sumStorageUsageParts,
} from "../appStorageUsage.mjs";

test("formats storage byte sizes for settings UI", () => {
  assert.equal(formatStorageBytes(0), "0 Б");
  assert.equal(formatStorageBytes(512), "512 Б");
  assert.equal(formatStorageBytes(1536), "1,5 КБ");
  assert.equal(formatStorageBytes(1_572_864), "1,5 МБ");
  assert.equal(formatStorageBytes(Number.NaN), "нет данных");
});

test("normalizes storage usage and derives percentages", () => {
  const usage = normalizeStorageUsage({
    totalBytes: 1200,
    cacheBytes: 300,
    appDataBytes: 700,
    quotaBytes: 2400,
  });

  assert.deepEqual(usage, {
    totalBytes: 1200,
    cacheBytes: 300,
    appDataBytes: 700,
    quotaBytes: 2400,
  });
  assert.equal(getStorageUsagePercent(usage.totalBytes, usage.quotaBytes), 50);
  assert.equal(sumStorageUsageParts(usage), 1000);
});

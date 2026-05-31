import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_APP_CACHE_LIMIT_BYTES,
  deriveStorageUsageBreakdown,
  formatStorageBytes,
  getStorageUsagePercent,
  normalizeAppCachePolicy,
  normalizeStorageUsage,
  shouldAutoClearAppCache,
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

test("counts IndexedDB app caches as cache without double-counting total usage", () => {
  const usage = deriveStorageUsageBreakdown({
    browserEstimate: { usage: 1800, quota: 10_000 },
    cacheStorageBytes: 100,
    indexedDbBytes: 700,
    indexedDbCacheBytes: 500,
    localStorageBytes: 80,
    sessionStorageBytes: 20,
    desktopUsage: {
      totalBytes: 2000,
      cacheBytes: 100,
      appDataBytes: 1900,
    },
  });

  assert.equal(usage.cacheBytes, 600);
  assert.equal(usage.appDataBytes, 1400);
  assert.equal(usage.totalBytes, 2000);
  assert.equal(usage.indexedDbBytes, 700);
  assert.equal(usage.indexedDbCacheBytes, 500);
});

test("normalizes app cache auto-clean policy", () => {
  assert.deepEqual(normalizeAppCachePolicy(), {
    autoClearEnabled: false,
    maxCacheBytes: DEFAULT_APP_CACHE_LIMIT_BYTES,
  });

  assert.deepEqual(normalizeAppCachePolicy({
    autoClearEnabled: true,
    maxCacheBytes: 123456,
  }), {
    autoClearEnabled: true,
    maxCacheBytes: 123456,
  });
});

test("detects when cache auto-clean should run", () => {
  assert.equal(shouldAutoClearAppCache({
    autoClearEnabled: false,
    maxCacheBytes: 100,
  }, { cacheBytes: 200 }), false);

  assert.equal(shouldAutoClearAppCache({
    autoClearEnabled: true,
    maxCacheBytes: 100,
  }, { cacheBytes: 100 }), false);

  assert.equal(shouldAutoClearAppCache({
    autoClearEnabled: true,
    maxCacheBytes: 100,
  }, { cacheBytes: 101 }), true);
});

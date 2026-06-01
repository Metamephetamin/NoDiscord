import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_CACHE_LIMIT_OPTIONS,
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

test("app cache limit options match settings policy choices", () => {
  const MB = 1024 * 1024;

  assert.deepEqual(APP_CACHE_LIMIT_OPTIONS, [
    500 * MB,
    1024 * MB,
    3 * 1024 * MB,
    5 * 1024 * MB,
    10 * 1024 * MB,
  ]);
  assert.equal(DEFAULT_APP_CACHE_LIMIT_BYTES, 500 * MB);
  assert.deepEqual(APP_CACHE_LIMIT_OPTIONS.map((value) => formatStorageBytes(value)), ["500 МБ", "1 ГБ", "3 ГБ", "5 ГБ", "10 ГБ"]);
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
    maxCacheBytes: DEFAULT_APP_CACHE_LIMIT_BYTES,
  });
});

test("detects when cache auto-clean should run", () => {
  const limitBytes = DEFAULT_APP_CACHE_LIMIT_BYTES;

  assert.equal(shouldAutoClearAppCache({
    autoClearEnabled: false,
    maxCacheBytes: limitBytes,
  }, { cacheBytes: limitBytes + 1 }), false);

  assert.equal(shouldAutoClearAppCache({
    autoClearEnabled: true,
    maxCacheBytes: limitBytes,
  }, { cacheBytes: limitBytes }), false);

  assert.equal(shouldAutoClearAppCache({
    autoClearEnabled: true,
    maxCacheBytes: limitBytes,
  }, { cacheBytes: limitBytes + 1 }), true);
});

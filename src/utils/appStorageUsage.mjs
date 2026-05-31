const BYTE_UNITS = ["Б", "КБ", "МБ", "ГБ", "ТБ"];

const toSafeByteCount = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.round(numericValue);
};

export const normalizeStorageUsage = (usage = {}) => ({
  totalBytes: toSafeByteCount(usage.totalBytes),
  cacheBytes: toSafeByteCount(usage.cacheBytes),
  appDataBytes: toSafeByteCount(usage.appDataBytes),
  quotaBytes: toSafeByteCount(usage.quotaBytes),
});

export const sumStorageUsageParts = (usage = {}) =>
  toSafeByteCount(usage.cacheBytes) + toSafeByteCount(usage.appDataBytes);

export const getStorageUsagePercent = (usedBytes, quotaBytes) => {
  const used = toSafeByteCount(usedBytes);
  const quota = toSafeByteCount(quotaBytes);
  if (!used || !quota) {
    return 0;
  }

  return Math.max(1, Math.min(100, Math.round((used / quota) * 100)));
};

export const formatStorageBytes = (bytes) => {
  const numericValue = Number(bytes);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return "нет данных";
  }

  if (numericValue === 0) {
    return "0 Б";
  }

  const unitIndex = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(numericValue) / Math.log(1024))
  );
  const value = numericValue / (1024 ** unitIndex);
  const roundedValue = unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;

  return `${roundedValue.toLocaleString("ru-RU", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${BYTE_UNITS[unitIndex]}`;
};

const getStorageAreaBytes = (storageArea) => {
  if (!storageArea) {
    return 0;
  }

  let totalBytes = 0;
  try {
    for (let index = 0; index < storageArea.length; index += 1) {
      const key = storageArea.key(index);
      if (!key) {
        continue;
      }

      const value = storageArea.getItem(key) || "";
      totalBytes += new globalThis.Blob([key, value]).size;
    }
  } catch {
    return 0;
  }

  return totalBytes;
};

const getCacheStorageBytes = async () => {
  const browserWindow = globalThis.window;
  if (!browserWindow?.caches?.keys) {
    return 0;
  }

  try {
    const cacheNames = await browserWindow.caches.keys();
    let totalBytes = 0;
    for (const cacheName of cacheNames) {
      const cache = await browserWindow.caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        const response = await cache.match(request);
        const contentLength = Number(response?.headers?.get("content-length") || 0);
        if (Number.isFinite(contentLength) && contentLength > 0) {
          totalBytes += contentLength;
          continue;
        }

        const blob = await response?.clone?.().blob?.();
        totalBytes += blob?.size || 0;
      }
    }
    return totalBytes;
  } catch {
    return 0;
  }
};

const getBrowserStorageEstimate = async () => {
  const browserNavigator = globalThis.navigator;
  if (!browserNavigator?.storage?.estimate) {
    return { usage: 0, quota: 0 };
  }

  try {
    const estimate = await browserNavigator.storage.estimate();
    return {
      usage: toSafeByteCount(estimate?.usage),
      quota: toSafeByteCount(estimate?.quota),
    };
  } catch {
    return { usage: 0, quota: 0 };
  }
};

export const getAppStorageUsage = async () => {
  const browserWindow = globalThis.window;
  const [browserEstimate, cacheStorageBytes, desktopUsage] = await Promise.all([
    getBrowserStorageEstimate(),
    getCacheStorageBytes(),
    browserWindow?.electronAppStorage?.getUsage
      ? browserWindow.electronAppStorage.getUsage().catch(() => null)
      : Promise.resolve(null),
  ]);

  const localStorageBytes = browserWindow ? getStorageAreaBytes(browserWindow.localStorage) : 0;
  const sessionStorageBytes = browserWindow ? getStorageAreaBytes(browserWindow.sessionStorage) : 0;
  const rendererDataBytes = localStorageBytes + sessionStorageBytes;
  const desktopCacheBytes = toSafeByteCount(desktopUsage?.cacheBytes);
  const desktopTotalBytes = toSafeByteCount(desktopUsage?.totalBytes);
  const browserTotalBytes = Math.max(browserEstimate.usage, cacheStorageBytes + rendererDataBytes);
  const cacheBytes = Math.max(desktopCacheBytes, cacheStorageBytes);
  const appDataBytes = Math.max(
    toSafeByteCount(desktopUsage?.appDataBytes),
    Math.max(0, browserTotalBytes - cacheStorageBytes),
    rendererDataBytes
  );
  const totalBytes = Math.max(desktopTotalBytes, browserTotalBytes, cacheBytes + appDataBytes);

  return {
    ...normalizeStorageUsage({
      totalBytes,
      cacheBytes,
      appDataBytes,
      quotaBytes: browserEstimate.quota,
    }),
    localStorageBytes,
    sessionStorageBytes,
    browserEstimateBytes: browserEstimate.usage,
    desktopAvailable: Boolean(desktopUsage),
  };
};

export const clearAppCacheStorage = async () => {
  const browserWindow = globalThis.window;
  const clearDesktopCache =
    browserWindow?.electronAppStorage?.clearCache
      ? browserWindow.electronAppStorage.clearCache().catch(() => false)
      : Promise.resolve(false);

  const clearBrowserCaches = (async () => {
    if (!browserWindow?.caches?.keys) {
      return false;
    }

    const cacheNames = await browserWindow.caches.keys();
    await Promise.all(cacheNames.map((cacheName) => browserWindow.caches.delete(cacheName)));
    return cacheNames.length > 0;
  })().catch(() => false);

  const [desktopCleared, browserCleared] = await Promise.all([clearDesktopCache, clearBrowserCaches]);
  return Boolean(desktopCleared || browserCleared);
};

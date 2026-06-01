const BYTE_UNITS = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
const INDEXED_DB_CACHE_NAMES = new Set(["lanaya-text-chat-cache"]);
const MAX_INDEXED_DB_RECORDS_PER_STORE = 20_000;
const APP_CACHE_POLICY_STORAGE_KEY = "lanaya-app-cache-policy-v1";
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const APP_CACHE_LIMIT_OPTIONS = [
  500 * MB,
  1 * GB,
  3 * GB,
  5 * GB,
  10 * GB,
];
export const DEFAULT_APP_CACHE_LIMIT_BYTES = 500 * MB;

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

export const normalizeAppCachePolicy = (policy = {}) => {
  const requestedMaxCacheBytes = toSafeByteCount(policy?.maxCacheBytes);
  const maxCacheBytes = APP_CACHE_LIMIT_OPTIONS.includes(requestedMaxCacheBytes)
    ? requestedMaxCacheBytes
    : DEFAULT_APP_CACHE_LIMIT_BYTES;

  return {
    autoClearEnabled: Boolean(policy?.autoClearEnabled),
    maxCacheBytes,
  };
};

export const shouldAutoClearAppCache = (policy = {}, usage = {}) => {
  const normalizedPolicy = normalizeAppCachePolicy(policy);
  if (!normalizedPolicy.autoClearEnabled) {
    return false;
  }

  return toSafeByteCount(usage?.cacheBytes) > normalizedPolicy.maxCacheBytes;
};

export const readAppCachePolicy = () => {
  const browserWindow = globalThis.window;
  const storage = browserWindow?.localStorage;
  if (!storage) {
    return normalizeAppCachePolicy();
  }

  try {
    const rawValue = storage.getItem(APP_CACHE_POLICY_STORAGE_KEY);
    return normalizeAppCachePolicy(rawValue ? JSON.parse(rawValue) : {});
  } catch {
    return normalizeAppCachePolicy();
  }
};

export const writeAppCachePolicy = (policy = {}) => {
  const normalizedPolicy = normalizeAppCachePolicy(policy);
  const browserWindow = globalThis.window;
  const storage = browserWindow?.localStorage;
  if (!storage) {
    return normalizedPolicy;
  }

  try {
    storage.setItem(APP_CACHE_POLICY_STORAGE_KEY, JSON.stringify(normalizedPolicy));
  } catch {
    // Settings writes can fail in private/quota-restricted storage.
  }

  return normalizedPolicy;
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

const getSerializedValueBytes = (value) => {
  try {
    const serializedValue = typeof value === "string" ? value : JSON.stringify(value);
    if (!serializedValue) {
      return 0;
    }

    if (typeof globalThis.TextEncoder === "function") {
      return new globalThis.TextEncoder().encode(serializedValue).byteLength;
    }

    return new globalThis.Blob([serializedValue]).size;
  } catch {
    return 0;
  }
};

const getIndexedDb = () => {
  const browserWindow = globalThis.window;
  return browserWindow?.indexedDB || globalThis.indexedDB || null;
};

const getIndexedDbDatabaseNames = async () => {
  const indexedDb = getIndexedDb();
  if (!indexedDb?.databases) {
    return [];
  }

  try {
    const databases = await indexedDb.databases();
    return databases
      .map((database) => String(database?.name || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

const openIndexedDbDatabase = (databaseName) => new Promise((resolve) => {
  const indexedDb = getIndexedDb();
  if (!indexedDb || !databaseName) {
    resolve(null);
    return;
  }

  try {
    const request = indexedDb.open(databaseName);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onupgradeneeded = () => {
      request.transaction?.abort?.();
      resolve(null);
    };
  } catch {
    resolve(null);
  }
});

const getIndexedDbStoreBytes = (db, storeName) => new Promise((resolve) => {
  try {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.openCursor();
    let totalBytes = 0;
    let scannedRecords = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || scannedRecords >= MAX_INDEXED_DB_RECORDS_PER_STORE) {
        resolve(totalBytes);
        return;
      }

      scannedRecords += 1;
      totalBytes += getSerializedValueBytes(cursor.key) + getSerializedValueBytes(cursor.value);
      cursor.continue();
    };
    request.onerror = () => resolve(totalBytes);
    transaction.onerror = () => resolve(totalBytes);
  } catch {
    resolve(0);
  }
});

const getIndexedDbDatabaseBytes = async (databaseName) => {
  const db = await openIndexedDbDatabase(databaseName);
  if (!db) {
    return 0;
  }

  try {
    const storeNames = Array.from(db.objectStoreNames || []);
    const storeSizes = await Promise.all(storeNames.map((storeName) => getIndexedDbStoreBytes(db, storeName)));
    return storeSizes.reduce((sum, value) => sum + value, 0);
  } finally {
    db.close?.();
  }
};

const getIndexedDbUsage = async () => {
  const databaseNames = await getIndexedDbDatabaseNames();
  if (!databaseNames.length) {
    return { indexedDbBytes: 0, indexedDbCacheBytes: 0 };
  }

  let indexedDbBytes = 0;
  let indexedDbCacheBytes = 0;

  for (const databaseName of databaseNames) {
    const databaseBytes = await getIndexedDbDatabaseBytes(databaseName);
    indexedDbBytes += databaseBytes;
    if (INDEXED_DB_CACHE_NAMES.has(databaseName)) {
      indexedDbCacheBytes += databaseBytes;
    }
  }

  return {
    indexedDbBytes: toSafeByteCount(indexedDbBytes),
    indexedDbCacheBytes: toSafeByteCount(indexedDbCacheBytes),
  };
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

export const deriveStorageUsageBreakdown = ({
  browserEstimate = {},
  cacheStorageBytes = 0,
  indexedDbBytes = 0,
  indexedDbCacheBytes = 0,
  localStorageBytes = 0,
  sessionStorageBytes = 0,
  desktopUsage = null,
} = {}) => {
  const safeCacheStorageBytes = toSafeByteCount(cacheStorageBytes);
  const safeIndexedDbBytes = toSafeByteCount(indexedDbBytes);
  const safeIndexedDbCacheBytes = Math.min(safeIndexedDbBytes, toSafeByteCount(indexedDbCacheBytes));
  const safeLocalStorageBytes = toSafeByteCount(localStorageBytes);
  const safeSessionStorageBytes = toSafeByteCount(sessionStorageBytes);
  const rendererDataBytes = safeLocalStorageBytes + safeSessionStorageBytes;
  const desktopCacheBytes = toSafeByteCount(desktopUsage?.cacheBytes);
  const desktopTotalBytes = toSafeByteCount(desktopUsage?.totalBytes);
  const browserEstimateBytes = toSafeByteCount(browserEstimate?.usage);
  const browserTotalBytes = Math.max(
    browserEstimateBytes,
    safeCacheStorageBytes + safeIndexedDbBytes + rendererDataBytes
  );
  const cacheBytes = Math.max(desktopCacheBytes, safeCacheStorageBytes) + safeIndexedDbCacheBytes;
  const desktopAppDataBytes = Math.max(
    0,
    toSafeByteCount(desktopUsage?.appDataBytes) - safeIndexedDbCacheBytes
  );
  const browserAppDataBytes = Math.max(0, browserTotalBytes - cacheBytes);
  const appDataBytes = Math.max(
    desktopAppDataBytes,
    browserAppDataBytes,
    rendererDataBytes + Math.max(0, safeIndexedDbBytes - safeIndexedDbCacheBytes)
  );
  const totalBytes = Math.max(desktopTotalBytes, browserTotalBytes, cacheBytes + appDataBytes);

  return {
    ...normalizeStorageUsage({
      totalBytes,
      cacheBytes,
      appDataBytes,
      quotaBytes: browserEstimate?.quota,
    }),
    localStorageBytes: safeLocalStorageBytes,
    sessionStorageBytes: safeSessionStorageBytes,
    indexedDbBytes: safeIndexedDbBytes,
    indexedDbCacheBytes: safeIndexedDbCacheBytes,
    browserEstimateBytes,
    desktopAvailable: Boolean(desktopUsage),
  };
};

export const getAppStorageUsage = async () => {
  const browserWindow = globalThis.window;
  const [browserEstimate, cacheStorageBytes, indexedDbUsage, desktopUsage] = await Promise.all([
    getBrowserStorageEstimate(),
    getCacheStorageBytes(),
    getIndexedDbUsage(),
    browserWindow?.electronAppStorage?.getUsage
      ? browserWindow.electronAppStorage.getUsage().catch(() => null)
      : Promise.resolve(null),
  ]);

  const localStorageBytes = browserWindow ? getStorageAreaBytes(browserWindow.localStorage) : 0;
  const sessionStorageBytes = browserWindow ? getStorageAreaBytes(browserWindow.sessionStorage) : 0;

  return deriveStorageUsageBreakdown({
    browserEstimate,
    cacheStorageBytes,
    indexedDbBytes: indexedDbUsage.indexedDbBytes,
    indexedDbCacheBytes: indexedDbUsage.indexedDbCacheBytes,
    localStorageBytes,
    sessionStorageBytes,
    desktopUsage,
  });
};

const clearIndexedDbDatabaseStores = async (databaseName) => {
  const db = await openIndexedDbDatabase(databaseName);
  if (!db) {
    return false;
  }

  const storeNames = Array.from(db.objectStoreNames || []);
  if (!storeNames.length) {
    db.close?.();
    return false;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(storeNames, "readwrite");
      const clearResults = [];
      storeNames.forEach((storeName) => {
        clearResults.push(new Promise((storeResolve) => {
          const request = transaction.objectStore(storeName).clear();
          request.onsuccess = () => storeResolve(true);
          request.onerror = () => storeResolve(false);
        }));
      });
      transaction.oncomplete = async () => {
        const results = await Promise.all(clearResults);
        db.close?.();
        resolve(results.some(Boolean));
      };
      transaction.onerror = () => {
        db.close?.();
        resolve(false);
      };
      transaction.onabort = () => {
        db.close?.();
        resolve(false);
      };
    } catch {
      db.close?.();
      resolve(false);
    }
  });
};

const deleteIndexedDbDatabase = (databaseName) => new Promise((resolve) => {
  const indexedDb = getIndexedDb();
  if (!indexedDb || !databaseName) {
    resolve(false);
    return;
  }

  try {
    const request = indexedDb.deleteDatabase(databaseName);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  } catch {
    resolve(false);
  }
});

const clearIndexedDbCacheDatabases = async () => {
  const databaseNames = await getIndexedDbDatabaseNames();
  const cacheDatabaseNames = databaseNames.filter((databaseName) => INDEXED_DB_CACHE_NAMES.has(databaseName));
  if (!cacheDatabaseNames.length) {
    return false;
  }

  const results = await Promise.all(cacheDatabaseNames.map(async (databaseName) =>
    (await clearIndexedDbDatabaseStores(databaseName)) || (await deleteIndexedDbDatabase(databaseName))
  ));
  return results.some(Boolean);
};

const clearLocalCacheStorageKeys = () => {
  const browserWindow = globalThis.window;
  const storage = browserWindow?.localStorage;
  if (!storage) {
    return false;
  }

  let removedAny = false;
  try {
    const keysToRemove = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("textchat-message-cache:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
    removedAny = keysToRemove.length > 0;
  } catch {
    removedAny = false;
  }

  return removedAny;
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

  const [desktopCleared, browserCleared, indexedDbCleared] = await Promise.all([
    clearDesktopCache,
    clearBrowserCaches,
    clearIndexedDbCacheDatabases().catch(() => false),
  ]);
  const localCacheCleared = clearLocalCacheStorageKeys();
  return Boolean(desktopCleared || browserCleared || indexedDbCleared || localCacheCleared);
};

export const enforceAppCachePolicy = async ({ policy = readAppCachePolicy(), usage = null } = {}) => {
  const normalizedPolicy = normalizeAppCachePolicy(policy);
  if (!normalizedPolicy.autoClearEnabled) {
    return {
      cleared: false,
      reason: "disabled",
      policy: normalizedPolicy,
      usage,
    };
  }

  const currentUsage = usage || await getAppStorageUsage();
  if (!shouldAutoClearAppCache(normalizedPolicy, currentUsage)) {
    return {
      cleared: false,
      reason: "within-limit",
      policy: normalizedPolicy,
      usage: currentUsage,
    };
  }

  await clearAppCacheStorage();
  const nextUsage = await getAppStorageUsage().catch(() => null);
  return {
    cleared: true,
    reason: "over-limit",
    policy: normalizedPolicy,
    usage: nextUsage || currentUsage,
  };
};

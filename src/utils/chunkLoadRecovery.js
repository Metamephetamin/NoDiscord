import { lazy } from "react";

const CHUNK_RELOAD_STORAGE_KEY = "tend:chunk-load-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 30000;

function getChunkLoadMessage(error) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  const message = [
    error.name,
    error.message,
    error.reason?.message,
    error.cause?.message,
  ].filter(Boolean).join(" ");

  return message || String(error);
}

export function isChunkLoadError(error) {
  const message = getChunkLoadMessage(error).toLowerCase();

  return message.includes("failed to fetch dynamically imported module")
    || message.includes("error loading dynamically imported module")
    || message.includes("importing a module script failed")
    || message.includes("chunkloaderror")
    || message.includes("loading chunk")
    || message.includes("css_chunk_load_failed");
}

export function reloadOnceForStaleChunk(error) {
  if (typeof window === "undefined" || !isChunkLoadError(error)) {
    return false;
  }

  try {
    const now = Date.now();
    const lastReloadAt = Number(window.sessionStorage?.getItem(CHUNK_RELOAD_STORAGE_KEY) || 0);

    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) {
      return false;
    }

    window.sessionStorage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // Reload is still safer than leaving a stale app shell broken.
  }

  window.location.reload();
  return true;
}

export function recoverChunkImport(loader) {
  return loader().catch((error) => {
    if (reloadOnceForStaleChunk(error)) {
      return new Promise(() => {});
    }

    throw error;
  });
}

export function lazyWithChunkRecovery(loader) {
  return lazy(() => recoverChunkImport(loader));
}

export function installChunkLoadRecovery() {
  if (typeof window === "undefined" || window.__tendChunkLoadRecoveryInstalled) {
    return;
  }

  window.__tendChunkLoadRecoveryInstalled = true;

  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnceForStaleChunk(event?.payload || event?.reason || event)) {
      event.preventDefault?.();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (reloadOnceForStaleChunk(event?.reason)) {
      event.preventDefault?.();
    }
  });
}

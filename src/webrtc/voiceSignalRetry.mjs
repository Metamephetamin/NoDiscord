const RETRYABLE_SIGNAL_ERRORS = [
  "connection is not in the connected state",
  "cannot send data",
  "connection disconnected",
  "connection closed",
  "websocket closed",
  "websocket is not open",
  "networkerror",
];

const NON_RETRYABLE_SIGNAL_ERRORS = [
  "unauthorized",
  "forbidden",
  "busy",
  "declined",
  "cancelled",
  "server timeout",
];

const wait = (delayMs) => new Promise((resolve) => {
  globalThis.setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
});

export function isRetryableVoiceSignalError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) {
    return false;
  }

  if (NON_RETRYABLE_SIGNAL_ERRORS.some((pattern) => message.includes(pattern))) {
    return false;
  }

  return RETRYABLE_SIGNAL_ERRORS.some((pattern) => message.includes(pattern));
}

export async function invokeVoiceSignalWithRetry({
  invoke,
  reconnect,
  maxAttempts = 2,
  delayMs = 180,
  onRetry = null,
} = {}) {
  if (typeof invoke !== "function") {
    throw new Error("voice signal invoke is required");
  }

  const attempts = Math.max(1, Math.round(Number(maxAttempts) || 1));
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await invoke();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableVoiceSignalError(error)) {
        throw error;
      }

      onRetry?.({ attempt, error });
      if (typeof reconnect === "function") {
        await reconnect();
      }

      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  throw lastError;
}

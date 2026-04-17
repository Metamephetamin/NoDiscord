let compressionWorker = null;
let compressionWorkerMessageHandlerAttached = false;
let compressionRequestId = 0;
const pendingCompressionRequests = new Map();

function ensureCompressionWorker() {
  if (compressionWorker) {
    return compressionWorker;
  }

  if (typeof Worker === "undefined") {
    throw new Error("Web Worker is not available.");
  }

  compressionWorker = new Worker(
    new URL("../workers/imageCompression.worker.js", import.meta.url),
    { type: "module" }
  );

  if (!compressionWorkerMessageHandlerAttached) {
    compressionWorker.addEventListener("message", (event) => {
      const { id, ok, blob, error } = event.data || {};
      const request = pendingCompressionRequests.get(id);
      if (!request) {
        return;
      }

      pendingCompressionRequests.delete(id);
      if (ok && blob instanceof Blob) {
        request.resolve(blob);
        return;
      }

      request.reject(new Error(String(error || "Image compression failed.")));
    });

    compressionWorker.addEventListener("error", (error) => {
      const pendingEntries = Array.from(pendingCompressionRequests.values());
      pendingCompressionRequests.clear();
      compressionWorker?.terminate?.();
      compressionWorker = null;

      pendingEntries.forEach((request) => {
        request.reject(error instanceof Error ? error : new Error("Image compression worker crashed."));
      });
    });

    compressionWorkerMessageHandlerAttached = true;
  }

  return compressionWorker;
}

export async function compressImageInWorker({ file, maxEdge = 2560, quality = 0.86 }) {
  const worker = ensureCompressionWorker();
  const requestId = `compression-${Date.now()}-${compressionRequestId++}`;

  return new Promise((resolve, reject) => {
    pendingCompressionRequests.set(requestId, { resolve, reject });
    worker.postMessage({
      id: requestId,
      file,
      maxEdge,
      quality,
    });
  });
}

self.onmessage = async (event) => {
  const { id, file, maxEdge = 2560, quality = 0.86 } = event.data || {};

  try {
    if (!(file instanceof Blob)) {
      throw new Error("Invalid file payload.");
    }

    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
      throw new Error("Worker image compression is not supported.");
    }

    const bitmap = await createImageBitmap(file);

    try {
      const scale = Math.min(1, Number(maxEdge) / Math.max(bitmap.width || 1, bitmap.height || 1));
      const width = Math.max(1, Math.round((bitmap.width || 1) * scale));
      const height = Math.max(1, Math.round((bitmap.height || 1) * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: false });

      if (!context) {
        throw new Error("Failed to initialize worker canvas.");
      }

      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: Number(quality) || 0.86,
      });

      self.postMessage({ id, ok: true, blob });
    } finally {
      bitmap.close?.();
    }
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Image compression failed.",
    });
  }
};

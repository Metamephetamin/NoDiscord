import { compressImageInWorker } from "./imageCompressionWorkerClient";

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const THUMBNAIL_MAX_EDGE = 96;
const THUMBNAIL_QUALITY = 0.72;

function buildUploadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getPendingUploadKind(file) {
  const fileType = String(file?.type || "").toLowerCase();
  if (fileType.startsWith("image/")) {
    return "image";
  }

  if (fileType.startsWith("video/")) {
    return "video";
  }

  return "file";
}

export function isCompressibleImageUpload(upload) {
  return COMPRESSIBLE_IMAGE_TYPES.has(
    String(upload?.file?.type || upload?.type || "").toLowerCase()
  );
}

export function createPendingUpload(file) {
  const kind = getPendingUploadKind(file);

  return {
    id: buildUploadId(),
    file,
    name: String(file?.name || "attachment").trim() || "attachment",
    size: Number(file?.size) || 0,
    type: String(file?.type || "").trim(),
    kind,
    previewUrl: "",
    thumbnailUrl: "",
    status: "queued",
    progress: 0,
    error: "",
    retryable: false,
    compressionMode: "original",
    hideWithSpoiler: false,
  };
}

export function createPendingUploadPreview(fileOrUpload) {
  const file = fileOrUpload?.file instanceof File ? fileOrUpload.file : fileOrUpload;
  const kind = getPendingUploadKind(file);

  if (!(file instanceof File) || (kind !== "image" && kind !== "video")) {
    return "";
  }

  return URL.createObjectURL(file);
}

export function revokePendingUploadPreview(upload) {
  [upload?.previewUrl, upload?.thumbnailUrl]
    .filter(Boolean)
    .forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revocation failures.
      }
    });
}

export function revokePendingUploadPreviews(uploads) {
  (Array.isArray(uploads) ? uploads : []).forEach(revokePendingUploadPreview);
}

function replaceFileExtension(name, extension) {
  const normalizedName = String(name || "attachment").trim() || "attachment";
  const dotIndex = normalizedName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? normalizedName.slice(0, dotIndex) : normalizedName;
  return `${baseName}${extension}`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image."));
    image.decoding = "async";
    image.src = src;
  });
}

async function renderImageThumbnailCanvas(file, maxEdge = THUMBNAIL_MAX_EDGE) {
  const canvas = document.createElement("canvas");
  const sourceUrl = URL.createObjectURL(file);

  try {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file);
        try {
          const scale = Math.min(1, maxEdge / Math.max(bitmap.width || 1, bitmap.height || 1));
          const width = Math.max(1, Math.round((bitmap.width || 1) * scale));
          const height = Math.max(1, Math.round((bitmap.height || 1) * scale));
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            throw new Error("Failed to create thumbnail canvas.");
          }

          context.drawImage(bitmap, 0, 0, width, height);
          return canvas;
        } finally {
          bitmap.close?.();
        }
      } catch {
        // Fall back to the <img> decode path for files that fail createImageBitmap.
      }
    }

    const image = await loadImageElement(sourceUrl);
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Failed to create thumbnail canvas.");
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function createPendingUploadThumbnail(fileOrUpload) {
  const file = fileOrUpload?.file instanceof File ? fileOrUpload.file : fileOrUpload;
  const kind = getPendingUploadKind(file);
  if (!(file instanceof File) || kind !== "image") {
    return "";
  }

  const canvas = await renderImageThumbnailCanvas(file);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
          return;
        }

        reject(new Error("Failed to generate thumbnail blob."));
      },
      "image/jpeg",
      THUMBNAIL_QUALITY
    );
  });

  return URL.createObjectURL(blob);
}

async function compressImageFileOnMainThread(file) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(sourceUrl);
    const maxEdge = 2560;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Failed to prepare compression canvas.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) {
            resolve(value);
            return;
          }

          reject(new Error("Failed to create compressed file."));
        },
        "image/jpeg",
        0.86
      );
    });

    return new File([blob], replaceFileExtension(file.name, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function compressImageFile(file) {
  try {
    const compressedBlob = await compressImageInWorker({
      file,
      maxEdge: 2560,
      quality: 0.86,
    });

    if (compressedBlob instanceof Blob) {
      return new File([compressedBlob], replaceFileExtension(file.name, ".jpg"), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }
  } catch {
    // Fall back to the main-thread compression path.
  }

  return compressImageFileOnMainThread(file);
}

export async function preparePendingUploadForSend(upload) {
  const sourceFile = upload?.file;
  if (!(sourceFile instanceof File)) {
    throw new Error("Attachment file was not found.");
  }

  if (upload?.compressionMode === "file") {
    return new File([sourceFile], sourceFile.name, {
      type: "application/octet-stream",
      lastModified: sourceFile.lastModified || Date.now(),
    });
  }

  if (upload?.compressionMode === "compressed" && isCompressibleImageUpload(upload)) {
    return compressImageFile(sourceFile);
  }

  return sourceFile;
}

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

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
  return COMPRESSIBLE_IMAGE_TYPES.has(String(upload?.file?.type || upload?.type || "").toLowerCase());
}

export function createPendingUpload(file) {
  const kind = getPendingUploadKind(file);
  const previewUrl =
    kind === "image" || kind === "video"
      ? URL.createObjectURL(file)
      : "";

  return {
    id: buildUploadId(),
    file,
    name: String(file?.name || "attachment").trim() || "attachment",
    size: Number(file?.size) || 0,
    type: String(file?.type || "").trim(),
    kind,
    previewUrl,
    status: "queued",
    progress: 0,
    error: "",
    retryable: false,
    compressionMode: kind === "image" && isCompressibleImageUpload({ file, type: file?.type }) ? "compressed" : "original",
  };
}

export function revokePendingUploadPreview(upload) {
  if (!upload?.previewUrl) {
    return;
  }

  try {
    URL.revokeObjectURL(upload.previewUrl);
  } catch {
    // ignore revocation failures
  }
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
    image.onerror = () => reject(new Error("Не удалось подготовить изображение к сжатию."));
    image.decoding = "async";
    image.src = src;
  });
}

async function compressImageFile(file) {
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
      throw new Error("Не удалось подготовить холст для сжатия.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) {
            resolve(value);
            return;
          }

          reject(new Error("Не удалось получить сжатый файл."));
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

export async function preparePendingUploadForSend(upload) {
  const sourceFile = upload?.file;
  if (!(sourceFile instanceof File)) {
    throw new Error("Файл вложения не найден.");
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

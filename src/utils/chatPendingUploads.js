import { compressImageInWorker } from "./imageCompressionWorkerClient";

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const THUMBNAIL_MAX_EDGE = 240;
const THUMBNAIL_QUALITY = 0.72;

const UPLOAD_SIGNATURE_CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const JPEG_EXTENSIONS = new Set([".jpg", ".jpeg", ".jfif"]);

function getCompressedImageSettings(file) {
  const normalizedType = String(file?.type || "").toLowerCase();

  if (normalizedType === "image/png" || normalizedType === "image/webp") {
    return {
      maxEdge: 3840,
      quality: 0.94,
      mimeType: "image/webp",
      extension: ".webp",
      alpha: true,
    };
  }

  return {
    maxEdge: 3840,
    quality: 0.92,
    mimeType: "image/jpeg",
    extension: ".jpg",
    alpha: false,
  };
}

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

function getFileExtension(name) {
  const normalizedName = String(name || "").trim();
  const dotIndex = normalizedName.lastIndexOf(".");
  return dotIndex > 0 ? normalizedName.slice(dotIndex).toLowerCase() : "";
}

function bytesStartWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes, offset, signature) {
  if (bytes.length < offset + signature.length) {
    return false;
  }

  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function detectUploadFileExtension(bytes) {
  if (!bytes?.length) {
    return "";
  }

  if (bytesStartWith(bytes, [0xFF, 0xD8, 0xFF])) {
    return ".jpg";
  }

  if (bytesStartWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return ".png";
  }

  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) {
    return ".webp";
  }

  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) {
    return ".gif";
  }

  if (asciiAt(bytes, 0, "BM")) {
    return ".bmp";
  }

  if (asciiAt(bytes, 0, "%PDF")) {
    return ".pdf";
  }

  if (
    bytesStartWith(bytes, [0x50, 0x4B, 0x03, 0x04])
    || bytesStartWith(bytes, [0x50, 0x4B, 0x05, 0x06])
    || bytesStartWith(bytes, [0x50, 0x4B, 0x07, 0x08])
  ) {
    return ".zip";
  }

  if (
    bytesStartWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00])
    || bytesStartWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00])
  ) {
    return ".rar";
  }

  if (bytesStartWith(bytes, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) {
    return ".7z";
  }

  if (
    asciiAt(bytes, 0, "ID3")
    || bytesStartWith(bytes, [0xFF, 0xFB])
    || bytesStartWith(bytes, [0xFF, 0xF3])
    || bytesStartWith(bytes, [0xFF, 0xF2])
  ) {
    return ".mp3";
  }

  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) {
    return ".wav";
  }

  if (asciiAt(bytes, 0, "OggS")) {
    return ".ogg";
  }

  if (asciiAt(bytes, 4, "ftyp")) {
    return ".mp4";
  }

  if (bytesStartWith(bytes, [0x1A, 0x45, 0xDF, 0xA3])) {
    return ".webm";
  }

  return "";
}

function isEquivalentUploadExtension(leftExtension, rightExtension) {
  const left = String(leftExtension || "").toLowerCase();
  const right = String(rightExtension || "").toLowerCase();
  if (left === right) {
    return true;
  }

  return JPEG_EXTENSIONS.has(left) && JPEG_EXTENSIONS.has(right);
}

async function normalizeUploadFileSignature(file) {
  if (!(file instanceof File)) {
    return file;
  }

  const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const detectedExtension = detectUploadFileExtension(header);
  if (!detectedExtension) {
    return file;
  }

  const declaredExtension = getFileExtension(file.name);
  const normalizedExtension = detectedExtension === ".jpeg" || detectedExtension === ".jfif"
    ? ".jpg"
    : detectedExtension;
  const shouldRename = !isEquivalentUploadExtension(declaredExtension, normalizedExtension)
    || declaredExtension === ".jfif";
  const nextType = UPLOAD_SIGNATURE_CONTENT_TYPES[normalizedExtension] || file.type || "application/octet-stream";

  if (!shouldRename && String(file.type || "").toLowerCase() === nextType.toLowerCase()) {
    return file;
  }

  return new File([file], replaceFileExtension(file.name, normalizedExtension), {
    type: nextType,
    lastModified: Number(file.lastModified) || Date.now(),
  });
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

  try {
    const blob = await compressImageInWorker({
      file,
      maxEdge: THUMBNAIL_MAX_EDGE,
      quality: THUMBNAIL_QUALITY,
    });

    if (blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
  } catch {
    // Fall back to the main-thread thumbnail path below.
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
    const settings = getCompressedImageSettings(file);
    const maxEdge = settings.maxEdge;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: settings.alpha });

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
        settings.mimeType,
        settings.quality
      );
    });

    return new File([blob], replaceFileExtension(file.name, settings.extension), {
      type: settings.mimeType,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function compressImageFile(file) {
  try {
    const settings = getCompressedImageSettings(file);
    const compressedBlob = await compressImageInWorker({
      file,
      maxEdge: settings.maxEdge,
      quality: settings.quality,
      outputType: settings.mimeType,
    });

    if (compressedBlob instanceof Blob) {
      return new File([compressedBlob], replaceFileExtension(file.name, settings.extension), {
        type: settings.mimeType,
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
    // "Send as file" changes presentation in chat, not the binary payload itself.
    // Only adjust mismatched extensions so backend signature checks still pass.
    return normalizeUploadFileSignature(sourceFile);
  }

  return normalizeUploadFileSignature(sourceFile);
}

import { memo, useState } from "react";

function isImmediatePreviewSource(sourceUrl) {
  const normalizedSourceUrl = String(sourceUrl || "").trim().toLowerCase();
  return normalizedSourceUrl.startsWith("blob:")
    || normalizedSourceUrl.startsWith("file:")
    || normalizedSourceUrl.startsWith("data:");
}

function PendingUploadPreview({
  file,
  className = "",
  fallbackClassName = "",
  fallbackLabel = "",
  preferThumbnailOnly = false,
  previewEnabled = true,
}) {
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState("");
  const [loadedThumbnailUrl, setLoadedThumbnailUrl] = useState("");

  const kind = file?.kind || "file";
  const previewUrl = file?.previewUrl || "";
  const thumbnailUrl = file?.thumbnailUrl || "";
  const thumbnailSourceUrl = thumbnailUrl || (preferThumbnailOnly && kind === "image" ? previewUrl : "");
  const thumbnailIsImmediate = isImmediatePreviewSource(thumbnailSourceUrl);
  const fullPreviewIsImmediate = isImmediatePreviewSource(previewUrl);
  const thumbnailReady = Boolean(thumbnailSourceUrl) && (loadedThumbnailUrl === thumbnailSourceUrl || thumbnailIsImmediate);
  const fullPreviewReady = Boolean(previewUrl) && (loadedPreviewUrl === previewUrl || fullPreviewIsImmediate);
  const showFullPreview = Boolean(previewUrl) && (kind === "image" || kind === "video");
  const showThumbnail = previewEnabled && Boolean(thumbnailSourceUrl) && kind === "image";
  const shouldRenderFullImage = previewEnabled && showFullPreview && kind === "image" && !preferThumbnailOnly;
  const shouldRenderVideoPreview = previewEnabled && showFullPreview && kind === "video";
  const previewReady = thumbnailReady || fullPreviewReady;
  const hasImmediatePreview = thumbnailIsImmediate || fullPreviewIsImmediate;
  const showLoader = previewEnabled && !previewReady && !hasImmediatePreview && (kind === "image" || kind === "video");

  return (
    <div className={`pending-upload-preview ${className}`.trim()}>
      {showLoader ? <span className="pending-upload-preview__skeleton" aria-hidden="true" /> : null}

      {showThumbnail ? (
        <img
          src={thumbnailSourceUrl}
          alt=""
          aria-hidden="true"
          className={`pending-upload-preview__thumb ${thumbnailReady ? "pending-upload-preview__thumb--ready" : ""}`.trim()}
          loading={thumbnailIsImmediate ? "eager" : "lazy"}
          decoding={thumbnailIsImmediate ? "sync" : "async"}
          onLoad={() => setLoadedThumbnailUrl(thumbnailSourceUrl)}
          onError={() => setLoadedThumbnailUrl("")}
        />
      ) : null}

      {shouldRenderFullImage ? (
        <img
          src={previewUrl}
          alt={file?.name || "preview"}
          className={`pending-upload-preview__full ${fullPreviewReady ? "pending-upload-preview__full--ready" : ""}`.trim()}
          loading={fullPreviewIsImmediate || !preferThumbnailOnly ? "eager" : "lazy"}
          decoding={fullPreviewIsImmediate ? "sync" : "async"}
          fetchPriority={fullPreviewIsImmediate || !preferThumbnailOnly ? "high" : "auto"}
          onLoad={() => setLoadedPreviewUrl(previewUrl)}
          onError={() => setLoadedPreviewUrl("")}
        />
      ) : null}

      {shouldRenderVideoPreview ? (
        <video
          src={previewUrl}
          className={`pending-upload-preview__full ${fullPreviewReady ? "pending-upload-preview__full--ready" : ""}`.trim()}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={() => setLoadedPreviewUrl(previewUrl)}
          onLoadedData={() => setLoadedPreviewUrl(previewUrl)}
          onError={() => setLoadedPreviewUrl("")}
        />
      ) : null}

      {!showThumbnail && !shouldRenderFullImage && !shouldRenderVideoPreview ? (
        <span className={`pending-upload-preview__fallback ${fallbackClassName}`.trim()} aria-hidden="true">
          {fallbackLabel || (kind === "video" ? "VID" : kind === "image" ? "IMG" : "FILE")}
        </span>
      ) : null}

      {showLoader ? (
        <span className="pending-upload-preview__loader" aria-hidden="true">
          <span className="pending-upload-preview__loader-bar" />
        </span>
      ) : null}
    </div>
  );
}

PendingUploadPreview.displayName = "PendingUploadPreview";

export default memo(PendingUploadPreview);

import { memo, useState } from "react";

function PendingUploadPreview({
  file,
  className = "",
  fallbackClassName = "",
  fallbackLabel = "",
  preferThumbnailOnly = false,
  previewEnabled = true,
}) {
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState("");

  const kind = file?.kind || "file";
  const previewUrl = file?.previewUrl || "";
  const thumbnailUrl = file?.thumbnailUrl || "";
  const thumbnailSourceUrl = thumbnailUrl || (preferThumbnailOnly && kind === "image" ? previewUrl : "");
  const fullPreviewReady = Boolean(previewUrl) && loadedPreviewUrl === previewUrl;
  const showFullPreview = Boolean(previewUrl) && (kind === "image" || kind === "video");
  const showThumbnail = previewEnabled && Boolean(thumbnailSourceUrl) && kind === "image";
  const shouldRenderFullImage = previewEnabled && showFullPreview && kind === "image" && !preferThumbnailOnly;
  const shouldRenderVideoPreview = previewEnabled && showFullPreview && kind === "video";
  const showLoader = previewEnabled && kind === "image" && (
    preferThumbnailOnly
      ? false
      : (!showFullPreview || !fullPreviewReady)
  );

  return (
    <div className={`pending-upload-preview ${className}`.trim()}>
      {showThumbnail ? (
        <img
          src={thumbnailSourceUrl}
          alt=""
          aria-hidden="true"
          className="pending-upload-preview__thumb"
          loading="lazy"
          decoding="async"
        />
      ) : null}

      {shouldRenderFullImage ? (
        <img
          src={previewUrl}
          alt={file?.name || "preview"}
          className={`pending-upload-preview__full ${fullPreviewReady ? "pending-upload-preview__full--ready" : ""}`.trim()}
          loading={preferThumbnailOnly ? "lazy" : "eager"}
          decoding="async"
          fetchPriority={preferThumbnailOnly ? "auto" : "high"}
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
          preload={preferThumbnailOnly ? "metadata" : "auto"}
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
          <span className="pending-upload-preview__loader-ring" />
        </span>
      ) : null}
    </div>
  );
}

PendingUploadPreview.displayName = "PendingUploadPreview";

export default memo(PendingUploadPreview);

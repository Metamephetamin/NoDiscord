import { memo, useState } from "react";

function PendingUploadPreview({
  file,
  className = "",
  fallbackClassName = "",
  fallbackLabel = "",
}) {
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState("");

  const kind = file?.kind || "file";
  const previewUrl = file?.previewUrl || "";
  const thumbnailUrl = file?.thumbnailUrl || "";
  const fullPreviewReady = Boolean(previewUrl) && loadedPreviewUrl === previewUrl;
  const showFullPreview = Boolean(previewUrl) && (kind === "image" || kind === "video");
  const showThumbnail = Boolean(thumbnailUrl) && kind === "image";
  const showLoader = kind === "image" && (!showFullPreview || !fullPreviewReady);

  return (
    <div className={`pending-upload-preview ${className}`.trim()}>
      {showThumbnail ? (
        <img
          src={thumbnailUrl}
          alt=""
          aria-hidden="true"
          className="pending-upload-preview__thumb"
          loading="lazy"
          decoding="async"
        />
      ) : null}

      {showFullPreview && kind === "image" ? (
        <img
          src={previewUrl}
          alt={file?.name || "preview"}
          className={`pending-upload-preview__full ${fullPreviewReady ? "pending-upload-preview__full--ready" : ""}`.trim()}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedPreviewUrl(previewUrl)}
          onError={() => setLoadedPreviewUrl("")}
        />
      ) : null}

      {showFullPreview && kind === "video" ? (
        <video
          src={previewUrl}
          className={`pending-upload-preview__full ${fullPreviewReady ? "pending-upload-preview__full--ready" : ""}`.trim()}
          muted
          playsInline
          preload="metadata"
          onLoadedData={() => setLoadedPreviewUrl(previewUrl)}
          onError={() => setLoadedPreviewUrl("")}
        />
      ) : null}

      {!showThumbnail && !showFullPreview ? (
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

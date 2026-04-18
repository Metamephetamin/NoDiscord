import { memo, useEffect, useRef, useState } from "react";
import { createPendingUploadThumbnail } from "../utils/chatPendingUploads";

function PendingUploadPreview({
  file,
  className = "",
  fallbackClassName = "",
  fallbackLabel = "",
  preferThumbnailOnly = false,
}) {
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState("");
  const thumbnailImageRef = useRef(null);

  const kind = file?.kind || "file";
  const previewUrl = file?.previewUrl || "";
  const thumbnailUrl = file?.thumbnailUrl || "";
  const thumbnailSourceUrl = thumbnailUrl;
  const fullPreviewReady = Boolean(previewUrl) && loadedPreviewUrl === previewUrl;
  const showFullPreview = Boolean(previewUrl) && (kind === "image" || kind === "video");
  const showThumbnail = Boolean(thumbnailSourceUrl) && kind === "image";
  const shouldRenderFullImage = showFullPreview && kind === "image" && !preferThumbnailOnly;
  const shouldRenderVideoPreview = showFullPreview && kind === "video";
  const showLoader = kind === "image" && (
    preferThumbnailOnly
      ? false
      : (!showFullPreview || !fullPreviewReady)
  );

  useEffect(() => {
    if (typeof window === "undefined" || !preferThumbnailOnly || kind !== "image" || thumbnailUrl || !(file?.file instanceof File)) {
      return undefined;
    }

    let disposed = false;
    let objectUrl = "";
    const timerId = window.setTimeout(() => {
      createPendingUploadThumbnail(file)
        .then((nextUrl) => {
          if (disposed) {
            if (nextUrl) {
              URL.revokeObjectURL(nextUrl);
            }
            return;
          }

          objectUrl = nextUrl || "";
          if (objectUrl && thumbnailImageRef.current) {
            thumbnailImageRef.current.src = objectUrl;
            thumbnailImageRef.current.dataset.ready = "true";
          }
        })
        .catch(() => {});
    }, 120);

    return () => {
      disposed = true;
      window.clearTimeout(timerId);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file, kind, preferThumbnailOnly, thumbnailUrl]);

  return (
    <div className={`pending-upload-preview ${className}`.trim()}>
      {preferThumbnailOnly && kind === "image" && !thumbnailSourceUrl ? (
        <img
          ref={thumbnailImageRef}
          alt=""
          aria-hidden="true"
          className="pending-upload-preview__thumb pending-upload-preview__thumb--deferred"
          loading="lazy"
          decoding="async"
        />
      ) : showThumbnail ? (
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

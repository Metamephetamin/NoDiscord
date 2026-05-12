import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MEDIA_PREVIEW_ZOOM_STEP } from "../utils/textChatHelpers";
import { MISSING_MEDIA_EVENT, isMediaUrlKnownMissing, markMediaUrlMissing } from "../utils/media";

const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const WHEEL_NAVIGATION_COOLDOWN_MS = 180;
const CLICK_CLOSE_DRAG_THRESHOLD = 6;

function TextChatMediaPreview({
  mediaPreview,
  videoRef,
  onClose,
  onDownload,
  onDownloadAll,
  onDeleteActive,
  onNavigate,
  onZoom,
  onPan,
}) {
  const dragStateRef = useRef(null);
  const dragDistanceRef = useRef(0);
  const pendingPanDeltaRef = useRef({ x: 0, y: 0 });
  const pendingPanFrameRef = useRef(0);
  const lastWheelNavigationAtRef = useRef(0);
  const viewportRef = useRef(null);
  const latestStateRef = useRef({
    hasGallery: false,
    onNavigate,
    onPan,
    onZoom,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoadState, setImageLoadState] = useState({ url: "", failed: false });
  const [videoLoadState, setVideoLoadState] = useState({ url: "", failed: false });
  const [missingMediaVersion, setMissingMediaVersion] = useState(0);
  const [loadedImageUrls, setLoadedImageUrls] = useState(() => new Set());
  const zoom = Number(mediaPreview?.zoom) || 1;
  const hasGallery = (mediaPreview?.items?.length || 0) > 1;
  const canPan = zoom > 1;
  const translateX = Number(mediaPreview?.panX) || 0;
  const translateY = Number(mediaPreview?.panY) || 0;
  const isImagePreview = mediaPreview?.type === "image";
  const isVideoPreview = mediaPreview?.type === "video";
  const isPreviewOpen = Boolean(mediaPreview);
  const imagePreviewUrl = isImagePreview ? String(mediaPreview?.url || "") : "";
  const videoPreviewUrl = isVideoPreview ? String(mediaPreview?.url || "") : "";
  const canLoadPreviewVideo = videoPreviewUrl.startsWith("blob:") || videoPreviewUrl.startsWith("data:") || videoPreviewUrl.startsWith("file:");
  const isImageKnownMissing = Boolean(missingMediaVersion >= 0 && imagePreviewUrl && isMediaUrlKnownMissing(imagePreviewUrl));
  const isVideoKnownMissing = Boolean(missingMediaVersion >= 0 && videoPreviewUrl && isMediaUrlKnownMissing(videoPreviewUrl));
  const isCachedImageReady = imagePreviewUrl && loadedImageUrls.has(imagePreviewUrl);
  const isImageReady = !isImagePreview || (imagePreviewUrl && (isCachedImageReady || imageLoadState.url === imagePreviewUrl) && !imageLoadState.failed && !isImageKnownMissing);
  const imageLoadFailed = isImagePreview && imagePreviewUrl && (isImageKnownMissing || (imageLoadState.url === imagePreviewUrl && imageLoadState.failed));
  const videoLoadFailed = isVideoPreview && videoPreviewUrl && (!canLoadPreviewVideo || isVideoKnownMissing || (videoLoadState.url === videoPreviewUrl && videoLoadState.failed));

  const stopEvent = (event) => {
    event.stopPropagation();
  };

  const buildZoomAnchor = useCallback((event) => {
    const rect = viewportRef.current?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) {
      return null;
    }

    return {
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      offsetXRatio: (event.clientX - rect.left) / rect.width,
      offsetYRatio: (event.clientY - rect.top) / rect.height,
    };
  }, []);

  const flushPendingPan = useCallback(() => {
    pendingPanFrameRef.current = 0;
    const delta = pendingPanDeltaRef.current;
    pendingPanDeltaRef.current = { x: 0, y: 0 };
    if (delta.x || delta.y) {
      latestStateRef.current.onPan?.(delta.x, delta.y);
    }
  }, []);

  const schedulePan = useCallback((deltaX, deltaY) => {
    pendingPanDeltaRef.current = {
      x: pendingPanDeltaRef.current.x + deltaX,
      y: pendingPanDeltaRef.current.y + deltaY,
    };

    if (pendingPanFrameRef.current || typeof window === "undefined") {
      return;
    }

    pendingPanFrameRef.current = window.requestAnimationFrame(flushPendingPan);
  }, [flushPendingPan]);

  const handlePointerDown = (event) => {
    if (!canPan) {
      return;
    }

    dragDistanceRef.current = 0;
    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;
    dragDistanceRef.current += Math.abs(deltaX) + Math.abs(deltaY);
    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    schedulePan(deltaX, deltaY);
  };

  const handlePointerEnd = (event) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleViewportClick = (event) => {
    if (dragDistanceRef.current > CLICK_CLOSE_DRAG_THRESHOLD) {
      dragDistanceRef.current = 0;
      event.stopPropagation();
      return;
    }

    onClose?.();
  };

  const handleWheelAction = useCallback((event) => {
    const deltaY = Number(event.deltaY || 0);
    if (!deltaY) {
      return;
    }

    if (event.ctrlKey) {
      event.preventDefault();
      const adaptiveStep = Math.max(
        MEDIA_PREVIEW_ZOOM_STEP,
        Math.min(0.9, Math.abs(deltaY) * WHEEL_ZOOM_SENSITIVITY)
      );
      latestStateRef.current.onZoom?.(deltaY < 0 ? adaptiveStep : -adaptiveStep, buildZoomAnchor(event));
      return;
    }

    if (!latestStateRef.current.hasGallery) {
      return;
    }

    const now = Date.now();
    if (now - lastWheelNavigationAtRef.current < WHEEL_NAVIGATION_COOLDOWN_MS) {
      event.preventDefault();
      return;
    }

    lastWheelNavigationAtRef.current = now;
    event.preventDefault();
    latestStateRef.current.onNavigate?.(deltaY > 0 ? 1 : -1);
  }, [buildZoomAnchor]);

  useEffect(() => {
    latestStateRef.current = {
      hasGallery,
      onNavigate,
      onPan,
      onZoom,
    };
  }, [hasGallery, onNavigate, onPan, onZoom]);

  useEffect(() => {
    if (!isPreviewOpen || typeof window === "undefined") {
      return undefined;
    }

    const handleNativeWheel = (event) => {
      handleWheelAction(event);
    };

    window.addEventListener("wheel", handleNativeWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", handleNativeWheel, { capture: true });
    };
  }, [handleWheelAction, isPreviewOpen]);

  useEffect(() => () => {
    if (pendingPanFrameRef.current && typeof window !== "undefined") {
      window.cancelAnimationFrame(pendingPanFrameRef.current);
      pendingPanFrameRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!isPreviewOpen) {
      return undefined;
    }

    document.body.classList.add("media-preview-open");
    window.electronWindowControls?.setTitleBarOverlayVisible?.(false).catch?.(() => {});
    return () => {
      document.body.classList.remove("media-preview-open");
      window.electronWindowControls?.setTitleBarOverlayVisible?.(true).catch?.(() => {});
    };
  }, [isPreviewOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleMissingMedia = () => {
      setMissingMediaVersion((current) => current + 1);
    };

    window.addEventListener(MISSING_MEDIA_EVENT, handleMissingMedia);
    return () => {
      window.removeEventListener(MISSING_MEDIA_EVENT, handleMissingMedia);
    };
  }, []);

  if (!mediaPreview) {
    return null;
  }

  const preview = (
    <div className="media-preview" onClick={onClose} role="presentation">
      <div className="media-preview__dialog" role="dialog" aria-modal="true" aria-label="Предпросмотр файла">
        <div className="media-preview__header">
          <div className="media-preview__meta" onClick={stopEvent}>
            <span>
              {isImagePreview ? "Изображение" : "Видео"}
              {hasGallery ? ` ${Number(mediaPreview.activeIndex || 0) + 1}/${mediaPreview.items.length}` : ""}
            </span>
          </div>
          <div className="media-preview__actions" onClick={stopEvent} />
        </div>

        <div className="media-preview__content">
          <div className="media-preview__side-fade media-preview__side-fade--left" aria-hidden="true" />
          <div className="media-preview__side-fade media-preview__side-fade--right" aria-hidden="true" />

          {hasGallery ? (
            <>
              <button
                type="button"
                className="media-preview__nav media-preview__nav--prev"
                onClick={(event) => {
                  stopEvent(event);
                  onNavigate?.(-1);
                }}
                aria-label="Предыдущее вложение"
              >
                {"<"}
              </button>
              <button
                type="button"
                className="media-preview__nav media-preview__nav--next"
                onClick={(event) => {
                  stopEvent(event);
                  onNavigate?.(1);
                }}
                aria-label="Следующее вложение"
              >
                {">"}
              </button>
            </>
          ) : null}

          <div
            ref={viewportRef}
            className={`media-preview__viewport ${canPan ? "media-preview__viewport--pannable" : ""} ${isDragging ? "media-preview__viewport--dragging" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
            onClick={handleViewportClick}
          >
            {imageLoadFailed ? (
              <div className="media-preview__image-fallback">Не удалось загрузить изображение</div>
            ) : isImagePreview ? (
              <>
                {!isImageReady ? (
                  <div className="media-preview__image-loader" aria-hidden="true">
                    <span />
                  </div>
                ) : null}
                <img
                  className="media-preview__image"
                  src={mediaPreview.url}
                  alt=""
                  decoding="async"
                  fetchPriority="high"
                  style={{
                    opacity: isImageReady ? 1 : 0,
                    transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})`,
                  }}
                  onLoad={() => {
                    setLoadedImageUrls((current) => {
                      if (current.has(imagePreviewUrl)) {
                        return current;
                      }

                      const next = new Set(current);
                      next.add(imagePreviewUrl);
                      return next;
                    });
                    setImageLoadState({ url: imagePreviewUrl, failed: false });
                  }}
                  onError={() => {
                    markMediaUrlMissing(imagePreviewUrl);
                    setImageLoadState({ url: imagePreviewUrl, failed: true });
                  }}
                />
              </>
            ) : videoLoadFailed ? (
              <div className="media-preview__image-fallback">Не удалось загрузить видео</div>
            ) : (
              <video
                ref={videoRef}
                className="media-preview__video"
                src={mediaPreview.url}
                style={{ transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})` }}
                onClick={stopEvent}
                onLoadedData={() => setVideoLoadState({ url: videoPreviewUrl, failed: false })}
                onError={() => {
                  markMediaUrlMissing(videoPreviewUrl);
                  setVideoLoadState({ url: videoPreviewUrl, failed: true });
                }}
                controls
                autoPlay
                playsInline
                preload="metadata"
              />
            )}
          </div>

          <div className="media-preview__dock media-preview__dock--bottom-right" onClick={stopEvent}>
            <button
              type="button"
              className="media-preview__icon-button media-preview__icon-button--danger"
              onClick={() => onDeleteActive?.()}
              aria-label="Удалить текущее вложение"
              title="Удалить текущее вложение"
            >
              <span className="media-preview__delete-icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="media-preview__icon-button"
              onClick={() => onDownload?.()}
              aria-label="Скачать текущее вложение"
              title="Скачать текущее вложение"
            >
              <span className="media-preview__download-icon" aria-hidden="true" />
            </button>
            {hasGallery ? (
              <button
                type="button"
                className="media-preview__icon-button media-preview__icon-button--stacked"
                onClick={() => onDownloadAll?.()}
                aria-label="Скачать все вложения"
                title="Скачать все вложения"
              >
                <span className="media-preview__download-icon media-preview__download-icon--double" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? preview : createPortal(preview, document.body);
}

function areMediaPreviewPropsEqual(previousProps, nextProps) {
  return previousProps.mediaPreview === nextProps.mediaPreview
    && previousProps.videoRef === nextProps.videoRef
    && previousProps.onClose === nextProps.onClose
    && previousProps.onDownload === nextProps.onDownload
    && previousProps.onDownloadAll === nextProps.onDownloadAll
    && previousProps.onDeleteActive === nextProps.onDeleteActive
    && previousProps.onNavigate === nextProps.onNavigate
    && previousProps.onZoom === nextProps.onZoom
    && previousProps.onPan === nextProps.onPan;
}

export default memo(TextChatMediaPreview, areMediaPreviewPropsEqual);

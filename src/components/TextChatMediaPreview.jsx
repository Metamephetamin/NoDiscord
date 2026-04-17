import { useEffect, useRef, useState } from "react";
import { MEDIA_PREVIEW_MAX_ZOOM, MEDIA_PREVIEW_MIN_ZOOM, MEDIA_PREVIEW_ZOOM_STEP } from "../utils/textChatHelpers";

const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const WHEEL_NAVIGATION_COOLDOWN_MS = 180;
const CLICK_CLOSE_DRAG_THRESHOLD = 6;

export default function TextChatMediaPreview({
  mediaPreview,
  videoRef,
  onClose,
  onDownload,
  onDownloadAll,
  onFullscreen,
  onNavigate,
  onZoom,
  onPan,
  onResetZoom,
}) {
  const dragStateRef = useRef(null);
  const dragDistanceRef = useRef(0);
  const lastWheelNavigationAtRef = useRef(0);
  const viewportRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const zoom = Number(mediaPreview?.zoom) || 1;
  const hasGallery = (mediaPreview?.items?.length || 0) > 1;
  const canPan = zoom > 1;
  const translateX = Number(mediaPreview?.panX) || 0;
  const translateY = Number(mediaPreview?.panY) || 0;
  const isImagePreview = mediaPreview?.type === "image";

  const stopEvent = (event) => {
    event.stopPropagation();
  };

  const buildZoomAnchor = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) {
      return null;
    }

    return {
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      offsetXRatio: (event.clientX - rect.left) / rect.width,
      offsetYRatio: (event.clientY - rect.top) / rect.height,
    };
  };

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
    onPan?.(deltaX, deltaY);
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

  const handleWheelAction = (event) => {
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
      onZoom?.(deltaY < 0 ? adaptiveStep : -adaptiveStep, buildZoomAnchor(event));
      return;
    }

    if (!hasGallery) {
      return;
    }

    const now = Date.now();
    if (now - lastWheelNavigationAtRef.current < WHEEL_NAVIGATION_COOLDOWN_MS) {
      event.preventDefault();
      return;
    }

    lastWheelNavigationAtRef.current = now;
    event.preventDefault();
    onNavigate?.(deltaY > 0 ? 1 : -1);
  };

  useEffect(() => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return undefined;
    }

    const handleNativeWheel = (event) => {
      handleWheelAction(event);
    };

    viewportNode.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      viewportNode.removeEventListener("wheel", handleNativeWheel);
    };
  }, [handleWheelAction]);

  if (!mediaPreview) {
    return null;
  }

  return (
    <div className="media-preview" onClick={onClose} role="presentation">
      <div className="media-preview__dialog" role="dialog" aria-modal="true" aria-label="Предпросмотр файла">
        <div className="media-preview__header">
          <div className="media-preview__meta" onClick={stopEvent}>
            <span>
              {isImagePreview ? "Изображение" : "Видео"}
              {hasGallery ? ` ${Number(mediaPreview.activeIndex || 0) + 1}/${mediaPreview.items.length}` : ""}
            </span>
          </div>
          <div className="media-preview__actions" onClick={stopEvent}>
            {isImagePreview ? (
              <>
                <button
                  type="button"
                  className="media-preview__action media-preview__action--compact"
                  onClick={() => onZoom?.(-MEDIA_PREVIEW_ZOOM_STEP)}
                  disabled={zoom <= MEDIA_PREVIEW_MIN_ZOOM}
                  aria-label="Уменьшить"
                >
                  -
                </button>
                <button
                  type="button"
                  className="media-preview__action media-preview__action--compact"
                  onClick={() => onZoom?.(MEDIA_PREVIEW_ZOOM_STEP)}
                  disabled={zoom >= MEDIA_PREVIEW_MAX_ZOOM}
                  aria-label="Приблизить"
                >
                  +
                </button>
                <button
                  type="button"
                  className="media-preview__action media-preview__action--compact"
                  onClick={() => onResetZoom?.()}
                  disabled={zoom === 1}
                  aria-label="Сбросить масштаб"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button type="button" className="media-preview__action" onClick={() => onFullscreen?.()}>
                  На весь экран
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="media-preview__close"
              onClick={() => onClose?.()}
              aria-label="Закрыть предпросмотр"
            >
              <span className="media-preview__close-icon" aria-hidden="true" />
            </button>
          </div>
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
                ‹
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
                ›
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
            {isImagePreview ? (
              <img
                className="media-preview__image"
                src={mediaPreview.url}
                alt=""
                style={{ transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})` }}
              />
            ) : (
              <video
                ref={videoRef}
                className="media-preview__video"
                src={mediaPreview.url}
                style={{ transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})` }}
                onClick={stopEvent}
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
}

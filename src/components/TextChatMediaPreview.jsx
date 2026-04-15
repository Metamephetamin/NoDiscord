import { useRef, useState } from "react";
import { MEDIA_PREVIEW_MAX_ZOOM, MEDIA_PREVIEW_MIN_ZOOM, MEDIA_PREVIEW_ZOOM_STEP } from "../utils/textChatHelpers";

const WHEEL_ZOOM_SENSITIVITY = 0.0015;

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
  const [isDragging, setIsDragging] = useState(false);

  if (!mediaPreview) {
    return null;
  }

  const zoom = Number(mediaPreview.zoom) || 1;
  const hasGallery = mediaPreview.items?.length > 1;
  const canPan = zoom > 1;
  const translateX = Number(mediaPreview.panX) || 0;
  const translateY = Number(mediaPreview.panY) || 0;

  const handlePointerDown = (event) => {
    if (!canPan) {
      return;
    }

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

  const handleWheelZoom = (event) => {
    const deltaY = Number(event.deltaY || 0);
    if (!deltaY) {
      return;
    }

    event.preventDefault();
    const adaptiveStep = Math.max(
      MEDIA_PREVIEW_ZOOM_STEP,
      Math.min(0.9, Math.abs(deltaY) * WHEEL_ZOOM_SENSITIVITY)
    );
    onZoom?.(deltaY < 0 ? adaptiveStep : -adaptiveStep);
  };

  return (
    <div className="media-preview" onClick={onClose} role="presentation">
      <div className="media-preview__dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Предпросмотр файла">
        <div className="media-preview__header">
          <div className="media-preview__meta">
            <span>
              {mediaPreview.type === "image" ? "Изображение" : "Видео"}
              {hasGallery ? ` ${Number(mediaPreview.activeIndex || 0) + 1}/${mediaPreview.items.length}` : ""}
            </span>
          </div>
          <div className="media-preview__actions">
            <button
              type="button"
              className="media-preview__action media-preview__action--compact"
              onClick={() => onZoom(-MEDIA_PREVIEW_ZOOM_STEP)}
              disabled={zoom <= MEDIA_PREVIEW_MIN_ZOOM}
              aria-label="Уменьшить"
            >
              -
            </button>
            <button
              type="button"
              className="media-preview__action media-preview__action--compact"
              onClick={() => onZoom(MEDIA_PREVIEW_ZOOM_STEP)}
              disabled={zoom >= MEDIA_PREVIEW_MAX_ZOOM}
              aria-label="Приблизить"
            >
              +
            </button>
            <button
              type="button"
              className="media-preview__action media-preview__action--compact"
              onClick={onResetZoom}
              disabled={zoom === 1}
              aria-label="Сбросить масштаб"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="media-preview__action" onClick={onDownload}>
              Скачать
            </button>
            {hasGallery ? (
              <button type="button" className="media-preview__action" onClick={onDownloadAll}>
                Скачать всё
              </button>
            ) : null}
            {mediaPreview.type === "video" ? (
              <button type="button" className="media-preview__action" onClick={onFullscreen}>
                На весь экран
              </button>
            ) : null}
            <button
              type="button"
              className="media-preview__close"
              onClick={onClose}
              aria-label="Закрыть предпросмотр"
            >
              <span className="media-preview__close-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="media-preview__content">
          {hasGallery ? (
            <>
              <button
                type="button"
                className="media-preview__nav media-preview__nav--prev"
                onClick={() => onNavigate(-1)}
                aria-label="Предыдущее вложение"
              >
                ‹
              </button>
              <button
                type="button"
                className="media-preview__nav media-preview__nav--next"
                onClick={() => onNavigate(1)}
                aria-label="Следующее вложение"
              >
                ›
              </button>
            </>
          ) : null}
          <div
            className={`media-preview__viewport ${canPan ? "media-preview__viewport--pannable" : ""} ${isDragging ? "media-preview__viewport--dragging" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
            onWheel={handleWheelZoom}
          >
            {mediaPreview.type === "image" ? (
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
                controls
                autoPlay
                playsInline
                preload="metadata"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

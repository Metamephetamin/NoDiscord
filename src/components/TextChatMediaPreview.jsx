import { MEDIA_PREVIEW_MAX_ZOOM, MEDIA_PREVIEW_MIN_ZOOM, MEDIA_PREVIEW_ZOOM_STEP } from "../utils/textChatHelpers";

export default function TextChatMediaPreview({
  mediaPreview,
  videoRef,
  onClose,
  onDownload,
  onFullscreen,
  onNavigate,
  onZoom,
  onResetZoom,
}) {
  if (!mediaPreview) {
    return null;
  }

  const zoom = Number(mediaPreview.zoom) || 1;
  const hasGallery = mediaPreview.items?.length > 1;

  return (
    <div className="media-preview" onClick={onClose} role="presentation">
      <div className="media-preview__dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={mediaPreview.name}>
        <div className="media-preview__header">
          <div className="media-preview__meta">
            <strong>{mediaPreview.name}</strong>
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
          {mediaPreview.type === "image" ? (
            <img
              className="media-preview__image"
              src={mediaPreview.url}
              alt={mediaPreview.name}
              style={{ transform: `scale(${zoom})` }}
            />
          ) : (
            <video
              ref={videoRef}
              className="media-preview__video"
              src={mediaPreview.url}
              style={{ transform: `scale(${zoom})` }}
              controls
              autoPlay
              playsInline
              preload="metadata"
            />
          )}
        </div>
        <div className="media-preview__caption">{mediaPreview.name}</div>
      </div>
    </div>
  );
}

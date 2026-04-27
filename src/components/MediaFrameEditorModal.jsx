import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import AnimatedMedia from "./AnimatedMedia";
import PercentageSlider from "./PercentageSlider";
import { getDefaultMediaFrame, getMediaFramePositionBounds, normalizeMediaFrame } from "../utils/mediaFrames";

const TARGET_COPY = {
  avatar: {
    title: "Кадрирование аватара",
    subtitle: "Покажи, какой участок фото или видео будет виден в аватаре.",
  },
  profileBackground: {
    title: "Кадрирование фона профиля",
    subtitle: "Настрой, какой участок будет виден на обложке профиля.",
  },
  serverIcon: {
    title: "Кадрирование иконки сервера",
    subtitle: "Подгони кадр так, как он будет смотреться в списке серверов.",
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function PreviewMedia({ className, src, fallback, alt, frame, mediaType }) {
  return (
    <AnimatedAvatar
      className={className}
      src={src}
      fallback={fallback}
      alt={alt}
      frame={frame}
      mediaType={mediaType}
      loading="eager"
      decoding="sync"
    />
  );
}

export default function MediaFrameEditorModal({
  open,
  source,
  fallback = "",
  frame = null,
  target = "avatar",
  avatarSource = "",
  avatarFrame = null,
  avatarAlt = "",
  mediaType = "",
  autoFrame = null,
  onCancel,
  onConfirm,
}) {
  const previewFrameRef = useRef(null);
  const dragStateRef = useRef(null);
  const draftTouchedRef = useRef(false);
  const sourceRef = useRef("");
  const suppressBackdropCloseRef = useRef(false);
  const [draftFrame, setDraftFrame] = useState(() => normalizeMediaFrame(frame));
  const copy = TARGET_COPY[target] || TARGET_COPY.avatar;
  const isAvatarEditor = target === "avatar";
  const previewTitle = avatarAlt || (target === "serverIcon" ? "Сервер" : "Ваш профиль");

  useEffect(() => {
    if (!open) {
      sourceRef.current = "";
      draftTouchedRef.current = false;
      return;
    }

    if (sourceRef.current !== source) {
      sourceRef.current = source;
      draftTouchedRef.current = false;
    } else if (draftTouchedRef.current) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftFrame(normalizeMediaFrame(frame));
  }, [frame, open, source]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState || !previewFrameRef.current) {
        return;
      }

      const rect = previewFrameRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      const zoomTravelBoost = 1 + (Math.max(0, dragState.frame.zoom - 1) * 0.72);
      const horizontalDragSpeed = 1.18 * zoomTravelBoost * 1.18;
      const verticalDragSpeed = 1.18 * zoomTravelBoost;
      const deltaX = ((event.clientX - dragState.startX) / rect.width) * (100 * horizontalDragSpeed);
      const deltaY = ((event.clientY - dragState.startY) / rect.height) * (100 * verticalDragSpeed);
      const bounds = getMediaFramePositionBounds(dragState.frame.zoom);

      if (
        !suppressBackdropCloseRef.current
        && (Math.abs(event.clientX - dragState.startX) > 3 || Math.abs(event.clientY - dragState.startY) > 3)
      ) {
        suppressBackdropCloseRef.current = true;
      }

      setDraftFrame({
        x: clamp(dragState.frame.x - deltaX, bounds.min, bounds.max),
        y: clamp(dragState.frame.y - deltaY, bounds.min, bounds.max),
        zoom: dragState.frame.zoom,
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [open]);

  const normalizedDraftFrame = useMemo(() => normalizeMediaFrame(draftFrame), [draftFrame]);

  if (!open || !source) {
    return null;
  }

  const handlePointerDown = (event) => {
    if (!previewFrameRef.current) {
      return;
    }

    event.preventDefault();
    draftTouchedRef.current = true;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      frame: normalizeMediaFrame(normalizedDraftFrame),
    };
  };

  const handleZoomChange = (event) => {
    const nextZoom = clamp(Number(event.target.value) || 1, 1, 5);
    draftTouchedRef.current = true;
    setDraftFrame((previous) => ({
      ...normalizeMediaFrame(previous),
      zoom: nextZoom,
    }));
  };

  const handleReset = () => {
    draftTouchedRef.current = true;
    setDraftFrame(normalizeMediaFrame(autoFrame || getDefaultMediaFrame()));
  };

  const handleBackdropClick = (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (suppressBackdropCloseRef.current) {
      suppressBackdropCloseRef.current = false;
      return;
    }

    onCancel?.();
  };

  return (
    <div className="media-frame-editor" onClick={handleBackdropClick}>
      <div
        className={`media-frame-editor__dialog ${isAvatarEditor ? "media-frame-editor__dialog--avatar" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="media-frame-editor__header">
          <div>
            <h3>{isAvatarEditor ? "Редактировать изображение" : copy.title}</h3>
            {!isAvatarEditor ? <p>{copy.subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="settings-popup__close media-frame-editor__close"
            onClick={onCancel}
            aria-label="Закрыть редактор кадра"
          />
        </div>

        {isAvatarEditor ? (
          <div className="media-frame-editor__avatar-layout">
            <div className="media-frame-editor__avatar-stage">
              <div
                ref={previewFrameRef}
                className="media-frame-editor__frame media-frame-editor__frame--avatar-modal"
                onPointerDown={handlePointerDown}
              >
                <AnimatedMedia
                  className="media-frame-editor__media"
                  src={source}
                  fallback={fallback}
                  alt={copy.title}
                  frame={normalizedDraftFrame}
                  mediaType={mediaType}
                  loading="eager"
                  decoding="sync"
                  draggable={false}
                />
                <div className="media-frame-editor__avatar-mask" aria-hidden="true" />
              </div>
            </div>

            <div className="media-frame-editor__avatar-toolbar">
              <label className="media-frame-editor__slider-field media-frame-editor__slider-field--avatar">
                <span className="media-frame-editor__slider-label">Масштаб</span>
                <PercentageSlider
                  min={1}
                  max={5}
                  step={0.01}
                  value={normalizedDraftFrame.zoom}
                  onChange={handleZoomChange}
                  ariaLabel="Масштаб аватара"
                  formatValue={(nextValue) => `${Math.round(Number(nextValue) * 100)}%`}
                />
                <strong>{Math.round(normalizedDraftFrame.zoom * 100)}%</strong>
              </label>
            </div>

            <div className="media-frame-editor__avatar-actions">
              <button
                type="button"
                className="media-frame-editor__reset-link"
                onClick={handleReset}
              >
                Сброс
              </button>
              <div className="media-frame-editor__avatar-actions-main">
                <button type="button" className="settings-inline-button" onClick={onCancel}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="mobile-profile-screen__primary"
                  onClick={() => onConfirm?.(normalizeMediaFrame(normalizedDraftFrame))}
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="media-frame-editor__body">
            <div className={`media-frame-editor__preview media-frame-editor__preview--${target}`}>
              {target === "profileBackground" ? (
                <div className="media-frame-editor__profile-card">
                  <div
                    ref={previewFrameRef}
                    className="media-frame-editor__frame media-frame-editor__frame--profileBackground"
                    onPointerDown={handlePointerDown}
                  >
                    <AnimatedMedia
                      className="media-frame-editor__media"
                      src={source}
                      fallback={fallback}
                      alt={copy.title}
                      frame={normalizedDraftFrame}
                      mediaType={mediaType}
                      loading="eager"
                      decoding="sync"
                      draggable={false}
                    />
                    <div className="media-frame-editor__grid" aria-hidden="true" />
                  </div>
                  <div className="media-frame-editor__profile-card-body">
                    <div className="media-frame-editor__profile-avatar">
                      <AnimatedAvatar
                        className="media-frame-editor__preview-media"
                        src={avatarSource}
                        fallback={avatarSource}
                        alt={avatarAlt}
                        frame={avatarFrame}
                        loading="eager"
                        decoding="sync"
                      />
                    </div>
                    <div className="media-frame-editor__profile-copy">
                      <strong>{avatarAlt || "Ваш профиль"}</strong>
                      <span>Так фон будет выглядеть в карточке профиля</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="media-frame-editor__single-preview">
                  <div
                    ref={previewFrameRef}
                    className={`media-frame-editor__frame media-frame-editor__frame--${target}`}
                    onPointerDown={handlePointerDown}
                  >
                    <AnimatedMedia
                      className="media-frame-editor__media"
                      src={source}
                      fallback={fallback}
                      alt={copy.title}
                      frame={normalizedDraftFrame}
                      mediaType={mediaType}
                      loading="eager"
                      decoding="sync"
                      draggable={false}
                    />
                    <div className="media-frame-editor__grid" aria-hidden="true" />
                  </div>

                  <div className="media-frame-editor__live-preview">
                    <span className="media-frame-editor__live-preview-label">Итоговый вид</span>
                    {target === "serverIcon" ? (
                      <div className="media-frame-editor__server-preview">
                        <div className="media-frame-editor__server-preview-icon">
                          <PreviewMedia
                            className="media-frame-editor__preview-media"
                            src={source}
                            fallback={fallback}
                            alt={previewTitle}
                            frame={normalizedDraftFrame}
                            mediaType={mediaType}
                          />
                        </div>
                        <div className="media-frame-editor__server-preview-copy">
                          <strong>{previewTitle}</strong>
                          <span>Так иконка будет смотреться в списке серверов и в шапке</span>
                        </div>
                      </div>
                    ) : (
                      <div className="media-frame-editor__avatar-preview-card">
                        <div className="media-frame-editor__avatar-preview-row">
                          <div className="media-frame-editor__avatar-preview-large">
                            <PreviewMedia
                              className="media-frame-editor__preview-media"
                              src={source}
                              fallback={fallback}
                              alt={previewTitle}
                              frame={normalizedDraftFrame}
                              mediaType={mediaType}
                            />
                          </div>
                          <div className="media-frame-editor__avatar-preview-copy">
                            <strong>{previewTitle}</strong>
                            <span>Так аватарка будет выглядеть в профиле, чатах и компактных списках</span>
                          </div>
                        </div>
                        <div className="media-frame-editor__avatar-preview-strip">
                          <div className="media-frame-editor__avatar-preview-small">
                            <PreviewMedia
                              className="media-frame-editor__preview-media"
                              src={source}
                              fallback={fallback}
                              alt={previewTitle}
                              frame={normalizedDraftFrame}
                              mediaType={mediaType}
                            />
                          </div>
                          <div className="media-frame-editor__avatar-preview-small media-frame-editor__avatar-preview-small--tiny">
                            <PreviewMedia
                              className="media-frame-editor__preview-media"
                              src={source}
                              fallback={fallback}
                              alt={previewTitle}
                              frame={normalizedDraftFrame}
                              mediaType={mediaType}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="media-frame-editor__controls">
              <div className="media-frame-editor__tip">
                Тяните само изображение в нужную сторону, чтобы попасть в кадр. Масштаб регулируется ползунком.
              </div>
              <label className="media-frame-editor__slider-field">
                <span>Масштаб</span>
                <PercentageSlider
                  min={1}
                  max={5}
                  step={0.01}
                  value={normalizedDraftFrame.zoom}
                  onChange={handleZoomChange}
                  ariaLabel="Масштаб изображения"
                  formatValue={(nextValue) => `${Math.round(Number(nextValue) * 100)}%`}
                />
                <strong>{normalizedDraftFrame.zoom.toFixed(2)}x</strong>
              </label>

              <div className="media-frame-editor__actions">
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={handleReset}
                >
                  Сбросить
                </button>
                <button type="button" className="settings-inline-button" onClick={onCancel}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="mobile-profile-screen__primary"
                  onClick={() => onConfirm?.(normalizeMediaFrame(normalizedDraftFrame))}
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

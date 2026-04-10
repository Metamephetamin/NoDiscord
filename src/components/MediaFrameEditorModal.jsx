import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedMedia from "./AnimatedMedia";
import { getDefaultMediaFrame, normalizeMediaFrame } from "../utils/mediaFrames";

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

export default function MediaFrameEditorModal({
  open,
  source,
  fallback = "",
  frame = null,
  target = "avatar",
  onCancel,
  onConfirm,
}) {
  const previewFrameRef = useRef(null);
  const dragStateRef = useRef(null);
  const [draftFrame, setDraftFrame] = useState(() => normalizeMediaFrame(frame));
  const copy = TARGET_COPY[target] || TARGET_COPY.avatar;

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftFrame(normalizeMediaFrame(frame));
  }, [frame, open]);

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

      const deltaX = ((event.clientX - dragState.startX) / rect.width) * (100 / dragState.zoom);
      const deltaY = ((event.clientY - dragState.startY) / rect.height) * (100 / dragState.zoom);
      setDraftFrame({
        x: clamp(dragState.frame.x + deltaX, 0, 100),
        y: clamp(dragState.frame.y + deltaY, 0, 100),
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
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      frame: normalizeMediaFrame(normalizedDraftFrame),
      zoom: Math.max(1, Number(normalizedDraftFrame.zoom) || 1),
    };
  };

  return (
    <div className="media-frame-editor" onClick={onCancel}>
      <div className="media-frame-editor__dialog" onClick={(event) => event.stopPropagation()}>
        <div className="media-frame-editor__header">
          <div>
            <h3>{copy.title}</h3>
            <p>{copy.subtitle}</p>
          </div>
          <button type="button" className="stream-modal__close" onClick={onCancel} aria-label="Закрыть редактор кадра">
            x
          </button>
        </div>

        <div className="media-frame-editor__body">
          <div className={`media-frame-editor__preview media-frame-editor__preview--${target}`}>
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
                draggable={false}
              />
              <div className="media-frame-editor__grid" aria-hidden="true" />
            </div>
          </div>

          <div className="media-frame-editor__controls">
            <label className="media-frame-editor__slider-field">
              <span>Масштаб</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={normalizedDraftFrame.zoom}
                onChange={(event) =>
                  setDraftFrame((previous) => ({
                    ...normalizeMediaFrame(previous),
                    zoom: clamp(Number(event.target.value) || 1, 1, 3),
                  }))
                }
              />
              <strong>{normalizedDraftFrame.zoom.toFixed(2)}x</strong>
            </label>

            <div className="media-frame-editor__actions">
              <button
                type="button"
                className="settings-inline-button"
                onClick={() => setDraftFrame(getDefaultMediaFrame())}
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
      </div>
    </div>
  );
}

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MEDIA_PREVIEW_ZOOM_STEP } from "../utils/textChatHelpers";
import { MISSING_MEDIA_EVENT, isMediaUrlKnownMissing, markMediaUrlMissing } from "../utils/media";
import { canLoadVideoPreviewUrl } from "../utils/mediaPreviewUrls.mjs";
import "../css/TextChatMediaPreview.css";

const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const WHEEL_NAVIGATION_COOLDOWN_MS = 180;
const CLICK_CLOSE_DRAG_THRESHOLD = 6;
const DEFAULT_VIDEO_CONTROL_STATE = {
  sourceUrl: "",
  currentTime: 0,
  duration: 0,
  playing: false,
  muted: false,
  volume: 1,
  playbackRate: 1,
};
const VIDEO_PLAYBACK_RATES = [1, 1.25, 1.5, 2];

function formatPreviewTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPlaybackRate(value) {
  const rate = Number(value) || 1;
  return `${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2).replace(/0$/, "")}x`;
}

function setMediaElementProperty(mediaNode, propertyName, value) {
  if (!mediaNode) {
    return;
  }

  Reflect.set(mediaNode, propertyName, value);
}

const BOOTSTRAP_ICON_PATHS = {
  download: (
    <>
      <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5Z" />
      <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3Z" />
    </>
  ),
  trash3: (
    <>
      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h13a.5.5 0 0 0 0-1H11Z" />
      <path d="M3.038 3.5h9.924l-.846 10.58a1 1 0 0 1-.997.92H4.881a1 1 0 0 1-.997-.92L3.038 3.5Zm2.462 2a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 1 0V6a.5.5 0 0 0-.5-.5Zm2.5 0a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 1 0V6a.5.5 0 0 0-.5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z" />
    </>
  ),
  volumeMuteFill: (
    <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06Z" />
  ),
  volumeUpFill: (
    <>
      <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707Z" />
      <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.482 5.482 0 0 1 11.025 8a5.482 5.482 0 0 1-1.61 3.89l.706.706Z" />
      <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707ZM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06Z" />
    </>
  ),
};

function BootstrapIcon({ kind, className = "" }) {
  return (
    <svg className={`media-preview__bootstrap-icon ${className}`.trim()} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {BOOTSTRAP_ICON_PATHS[kind] || BOOTSTRAP_ICON_PATHS.download}
    </svg>
  );
}

function VideoVolumeIcon({ muted }) {
  return (
    <BootstrapIcon
      kind={muted ? "volumeMuteFill" : "volumeUpFill"}
      className="media-preview__video-volume-icon"
    />
  );
}

function TextChatMediaPreview({
  mediaPreview,
  videoRef,
  onClose,
  onDownload,
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
  const [videoControlState, setVideoControlState] = useState(DEFAULT_VIDEO_CONTROL_STATE);
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
  const canLoadPreviewVideo = canLoadVideoPreviewUrl(videoPreviewUrl);
  const isImageKnownMissing = Boolean(missingMediaVersion >= 0 && imagePreviewUrl && isMediaUrlKnownMissing(imagePreviewUrl));
  const isVideoKnownMissing = Boolean(missingMediaVersion >= 0 && videoPreviewUrl && isMediaUrlKnownMissing(videoPreviewUrl));
  const currentVideoControlState = videoControlState.sourceUrl === videoPreviewUrl
    ? videoControlState
    : DEFAULT_VIDEO_CONTROL_STATE;
  const videoDuration = Math.max(0, Number(currentVideoControlState.duration) || 0);
  const videoCurrentTime = Math.max(0, Math.min(videoDuration || Number.MAX_SAFE_INTEGER, Number(currentVideoControlState.currentTime) || 0));
  const remainingVideoTime = videoDuration > 0 ? Math.max(0, videoDuration - videoCurrentTime) : 0;
  const videoProgress = videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0;
  const videoVolumeProgress = currentVideoControlState.muted ? 0 : Math.round(currentVideoControlState.volume * 100);
  const isCachedImageReady = imagePreviewUrl && loadedImageUrls.has(imagePreviewUrl);
  const isImageReady = !isImagePreview || (imagePreviewUrl && (isCachedImageReady || imageLoadState.url === imagePreviewUrl) && !imageLoadState.failed && !isImageKnownMissing);
  const imageLoadFailed = isImagePreview && imagePreviewUrl && (isImageKnownMissing || (imageLoadState.url === imagePreviewUrl && imageLoadState.failed));
  const videoLoadFailed = isVideoPreview && videoPreviewUrl && (!canLoadPreviewVideo || isVideoKnownMissing || (videoLoadState.url === videoPreviewUrl && videoLoadState.failed));

  const stopEvent = useCallback((event) => {
    event.stopPropagation();
  }, []);

  const syncVideoControlState = useCallback(() => {
    const mediaNode = videoRef?.current;
    if (!mediaNode) {
      return;
    }

    setVideoControlState({
      sourceUrl: videoPreviewUrl,
      currentTime: Number(mediaNode.currentTime) || 0,
      duration: Number.isFinite(Number(mediaNode.duration)) ? Number(mediaNode.duration) : 0,
      playing: !mediaNode.paused && !mediaNode.ended,
      muted: Boolean(mediaNode.muted),
      volume: Number.isFinite(Number(mediaNode.volume)) ? Number(mediaNode.volume) : 1,
      playbackRate: Number.isFinite(Number(mediaNode.playbackRate)) ? Number(mediaNode.playbackRate) : 1,
    });
  }, [videoPreviewUrl, videoRef]);

  const toggleVideoPlayback = useCallback((event) => {
    stopEvent(event);
    const mediaNode = videoRef?.current;
    if (!mediaNode) {
      return;
    }

    if (mediaNode.paused || mediaNode.ended) {
      mediaNode.play?.().catch?.(() => {});
      return;
    }

    mediaNode.pause?.();
  }, [stopEvent, videoRef]);

  const toggleVideoMute = useCallback((event) => {
    stopEvent(event);
    const mediaNode = videoRef?.current;
    if (!mediaNode) {
      return;
    }

    setMediaElementProperty(mediaNode, "muted", !mediaNode.muted);
    syncVideoControlState();
  }, [stopEvent, syncVideoControlState, videoRef]);

  const handleVideoVolumeChange = useCallback((event) => {
    stopEvent(event);
    const mediaNode = videoRef?.current;
    if (!mediaNode) {
      return;
    }

    const nextVolume = Math.max(0, Math.min(1, Number(event.currentTarget.value) / 100 || 0));
    setMediaElementProperty(mediaNode, "volume", nextVolume);
    setMediaElementProperty(mediaNode, "muted", nextVolume <= 0);
    syncVideoControlState();
  }, [stopEvent, syncVideoControlState, videoRef]);

  const handleVideoSeek = useCallback((event) => {
    stopEvent(event);
    const mediaNode = videoRef?.current;
    const nextTime = Number(event.currentTarget.value) || 0;
    if (!mediaNode) {
      return;
    }

    setMediaElementProperty(mediaNode, "currentTime", nextTime);
    syncVideoControlState();
  }, [stopEvent, syncVideoControlState, videoRef]);

  const handleVideoFullscreen = useCallback((event) => {
    stopEvent(event);
    const fullscreenTarget = viewportRef.current?.closest?.(".media-preview__content") || viewportRef.current;
    fullscreenTarget?.requestFullscreen?.().catch?.(() => {});
  }, [stopEvent]);

  const cycleVideoPlaybackRate = useCallback((event) => {
    stopEvent(event);
    const mediaNode = videoRef?.current;
    if (!mediaNode) {
      return;
    }

    const currentRate = Number(mediaNode.playbackRate) || 1;
    const currentIndex = VIDEO_PLAYBACK_RATES.findIndex((rate) => Math.abs(rate - currentRate) < 0.01);
    const nextRate = VIDEO_PLAYBACK_RATES[(currentIndex + 1) % VIDEO_PLAYBACK_RATES.length];
    setMediaElementProperty(mediaNode, "playbackRate", nextRate);
    syncVideoControlState();
  }, [stopEvent, syncVideoControlState, videoRef]);

  const handleVideoPictureInPicture = useCallback((event) => {
    stopEvent(event);
    const mediaNode = videoRef?.current;
    if (!mediaNode || typeof document === "undefined" || !document.pictureInPictureEnabled) {
      return;
    }

    if (document.pictureInPictureElement) {
      document.exitPictureInPicture?.().catch?.(() => {});
      return;
    }

    mediaNode.requestPictureInPicture?.().catch?.(() => {});
  }, [stopEvent, videoRef]);

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
                onLoadedMetadata={syncVideoControlState}
                onLoadedData={() => {
                  setVideoLoadState({ url: videoPreviewUrl, failed: false });
                  syncVideoControlState();
                }}
                onCanPlay={() => {
                  setVideoLoadState({ url: videoPreviewUrl, failed: false });
                  syncVideoControlState();
                }}
                onPlay={syncVideoControlState}
                onPause={syncVideoControlState}
                onTimeUpdate={syncVideoControlState}
                onDurationChange={syncVideoControlState}
                onVolumeChange={syncVideoControlState}
                onRateChange={syncVideoControlState}
                onError={() => {
                  markMediaUrlMissing(videoPreviewUrl);
                  setVideoLoadState({ url: videoPreviewUrl, failed: true });
                }}
                autoPlay
                playsInline
                preload="auto"
                controls={false}
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
              />
            )}
          </div>

          {isVideoPreview && !videoLoadFailed ? (
            <div className="media-preview__video-controls" onClick={stopEvent} onPointerDown={stopEvent}>
              <div className="media-preview__video-volume">
                <button
                  type="button"
                  className="media-preview__video-control-button"
                  onClick={toggleVideoMute}
                  aria-label={currentVideoControlState.muted ? "Unmute video" : "Mute video"}
                >
                  <VideoVolumeIcon muted={currentVideoControlState.muted || currentVideoControlState.volume <= 0} />
                </button>
                <input
                  className="media-preview__video-volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={videoVolumeProgress}
                  style={{ "--media-preview-volume": `${videoVolumeProgress}%` }}
                  onInput={handleVideoVolumeChange}
                  onChange={handleVideoVolumeChange}
                  aria-label="Video volume"
                />
              </div>

              <button
                type="button"
                className="media-preview__video-play"
                onClick={toggleVideoPlayback}
                aria-label={currentVideoControlState.playing ? "Pause video" : "Play video"}
              >
                <span className={`media-preview__video-play-icon ${currentVideoControlState.playing ? "media-preview__video-play-icon--pause" : "media-preview__video-play-icon--play"}`} aria-hidden="true" />
              </button>

              <div className="media-preview__video-tools">
                <button
                  type="button"
                  className="media-preview__video-control-button"
                  onClick={handleVideoFullscreen}
                  aria-label="Fullscreen video"
                >
                  <span className="media-preview__video-icon media-preview__video-icon--fullscreen" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="media-preview__video-control-button"
                  onClick={handleVideoPictureInPicture}
                  aria-label="Picture in picture"
                >
                  <span className="media-preview__video-icon media-preview__video-icon--pip" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="media-preview__video-control-button"
                  onClick={cycleVideoPlaybackRate}
                  aria-label="Change video speed"
                >
                  <span className="media-preview__video-speed-label">{formatPlaybackRate(currentVideoControlState.playbackRate)}</span>
                </button>
                <button
                  type="button"
                  className="media-preview__video-control-button"
                  onClick={() => onDownload?.()}
                  aria-label="Download video"
                >
                  <BootstrapIcon kind="download" />
                </button>
              </div>

              <div className="media-preview__video-timeline">
                <span className="media-preview__video-time">{formatPreviewTime(videoCurrentTime)}</span>
                <input
                  className="media-preview__video-seek"
                  type="range"
                  min="0"
                  max={videoDuration || 0}
                  step="0.1"
                  value={videoCurrentTime}
                  onChange={handleVideoSeek}
                  style={{ "--media-preview-progress": `${videoProgress}%` }}
                  aria-label="Video progress"
                />
                <span className="media-preview__video-time">-{formatPreviewTime(remainingVideoTime)}</span>
              </div>
            </div>
          ) : null}

          {!isVideoPreview ? (
          <div className="media-preview__dock media-preview__dock--bottom-right" onClick={stopEvent}>
            {onDeleteActive ? (
              <button
                type="button"
                className="media-preview__icon-button media-preview__icon-button--danger"
                onClick={() => onDeleteActive()}
                aria-label="Удалить текущее вложение"
                title="Удалить текущее вложение"
              >
                <BootstrapIcon kind="trash3" />
              </button>
            ) : null}
            <button
              type="button"
              className="media-preview__icon-button"
              onClick={() => onDownload?.()}
              aria-label="Скачать текущее вложение"
              title="Скачать текущее вложение"
            >
              <BootstrapIcon kind="download" />
            </button>
          </div>
          ) : null}
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
    && previousProps.onDeleteActive === nextProps.onDeleteActive
    && previousProps.onNavigate === nextProps.onNavigate
    && previousProps.onZoom === nextProps.onZoom
    && previousProps.onPan === nextProps.onPan;
}

export default memo(TextChatMediaPreview, areMediaPreviewPropsEqual);

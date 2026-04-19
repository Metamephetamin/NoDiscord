import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAnimatedAvatarUrl, isVideoAvatarUrl } from "../utils/avatarMedia";
import { getMediaFrameStyle } from "../utils/mediaFrames";
import { resolveMediaUrl, resolveOptimizedMediaUrl } from "../utils/media";
import { recordPerfEvent } from "../utils/perf";

let optimizedMediaEndpointDisabled = false;
const failedOptimizedMediaSourceSet = new Set();

export default function AnimatedMedia({
  src,
  fallback = "",
  alt = "",
  className = "",
  frame = null,
  mediaType = "",
  allowVideo = true,
  style = undefined,
  loading = "lazy",
  decoding = "async",
  optimize = true,
  ...rest
}) {
  const resolvedSrc = useMemo(() => resolveMediaUrl(src, fallback), [fallback, src]);
  const [failedVideoSrc, setFailedVideoSrc] = useState("");
  const [readyVideoSrc, setReadyVideoSrc] = useState("");
  const readyVideoSrcRef = useRef("");
  const [node, setNode] = useState(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(() => loading === "eager");
  const [failedOptimizedImageSrc, setFailedOptimizedImageSrc] = useState("");
  const resolvedFallback = resolveMediaUrl(fallback, "");
  const normalizedMediaType = String(mediaType || "").toLowerCase().trim();
  const shouldPreferVideo = normalizedMediaType.startsWith("video/");
  const shouldRenderVideo = allowVideo
    && (shouldPreferVideo || isVideoAvatarUrl(resolvedSrc))
    && failedVideoSrc !== resolvedSrc;
  const hasVisualSource = Boolean(resolvedSrc || resolvedFallback);
  const mediaStyle = useMemo(() => getMediaFrameStyle(frame, style), [frame, style]);
  const isVideoReady = readyVideoSrc === resolvedSrc;
  const shouldTrackVisibility = loading !== "eager" && typeof IntersectionObserver === "function";
  const canOptimizeImage = optimize
    && !optimizedMediaEndpointDisabled
    && !failedOptimizedMediaSourceSet.has(resolvedSrc)
    && failedOptimizedImageSrc !== resolvedSrc
    && !shouldRenderVideo;
  const isAnimatedImage = !shouldRenderVideo && isAnimatedAvatarUrl(resolvedSrc);
  const targetWidth = Math.max(32, Math.min(512, Math.round((bounds.width || 48) * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1))));
  const targetHeight = Math.max(32, Math.min(512, Math.round((bounds.height || bounds.width || 48) * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1))));
  const optimizedImageSrc = useMemo(
    () => (
      canOptimizeImage && resolvedSrc
        ? resolveOptimizedMediaUrl(resolvedSrc, {
            width: targetWidth,
            height: targetHeight,
            animated: isAnimatedImage,
          })
        : resolvedSrc
    ),
    [canOptimizeImage, isAnimatedImage, resolvedSrc, targetHeight, targetWidth]
  );
  const fallbackPosterSrc = useMemo(
    () => (
      resolvedFallback
        ? resolveOptimizedMediaUrl(resolvedFallback, {
            width: targetWidth,
            height: targetHeight,
            animated: false,
          })
        : ""
    ),
    [resolvedFallback, targetHeight, targetWidth]
  );
  const mediaDebugPayload = useMemo(() => ({
    src: resolvedSrc,
    className,
    targetWidth,
    targetHeight,
    optimize,
    shouldRenderVideo,
    shouldTrackVisibility,
    optimized: optimizedImageSrc !== resolvedSrc,
  }), [className, optimize, optimizedImageSrc, resolvedSrc, shouldRenderVideo, shouldTrackVisibility, targetHeight, targetWidth]);

  const attachNodeRef = useCallback((nextNode) => {
    setNode(nextNode);
  }, []);

  useEffect(() => {
    readyVideoSrcRef.current = readyVideoSrc;
  }, [readyVideoSrc]);

  const markVideoReady = useCallback((action) => {
    if (readyVideoSrcRef.current === resolvedSrc) {
      return;
    }

    readyVideoSrcRef.current = resolvedSrc;
    setReadyVideoSrc(resolvedSrc);
    recordPerfEvent("media", action, mediaDebugPayload);
  }, [mediaDebugPayload, resolvedSrc]);

  useEffect(() => {
    if (!node) {
      return undefined;
    }

    const updateBounds = () => {
      const nextWidth = Math.round(node.clientWidth || node.offsetWidth || 0);
      const nextHeight = Math.round(node.clientHeight || node.offsetHeight || 0);
      setBounds((previous) => (
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight }
      ));
    };

    updateBounds();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => updateBounds());
      observer.observe(node);
      return () => observer.disconnect();
    }

    return undefined;
  }, [node]);

  useEffect(() => {
    if (!node) {
      return undefined;
    }

    if (!shouldTrackVisibility) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: "240px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, shouldTrackVisibility]);

  if (!hasVisualSource) {
    return (
      <span
        {...rest}
        ref={attachNodeRef}
        className={["animated-avatar--empty", className].filter(Boolean).join(" ")}
        aria-label={alt}
        style={mediaStyle}
      />
    );
  }

  if (shouldRenderVideo) {
    return (
      <video
        key={resolvedSrc || resolvedFallback}
        {...rest}
        ref={attachNodeRef}
        className={className}
        style={{
          ...mediaStyle,
          backgroundColor: "rgba(16, 18, 24, 0.58)",
          opacity: isVideoReady ? 1 : 0.999,
        }}
        src={(!shouldTrackVisibility || isVisible) ? resolvedSrc : undefined}
        poster={fallbackPosterSrc || resolvedFallback || undefined}
        autoPlay={!shouldTrackVisibility || isVisible}
        loop
        muted
        playsInline
        preload={!shouldTrackVisibility || isVisible ? "metadata" : "none"}
        draggable={false}
        aria-label={alt}
        onLoadedMetadata={() => markVideoReady("animated-media:video-loaded-metadata")}
        onLoadedData={() => markVideoReady("animated-media:video-loaded-data")}
        onCanPlay={() => markVideoReady("animated-media:video-can-play")}
        onPlaying={() => markVideoReady("animated-media:video-playing")}
        onError={() => {
          recordPerfEvent("media", "animated-media:video-error", mediaDebugPayload);
          if (readyVideoSrcRef.current === resolvedSrc) {
            readyVideoSrcRef.current = "";
            setReadyVideoSrc("");
          }
          setFailedVideoSrc(resolvedSrc);
        }}
      />
    );
  }

  return (
    <img
      key={optimizedImageSrc || resolvedFallback}
      {...rest}
      ref={attachNodeRef}
      className={className}
      style={{
        display: "block",
        imageRendering: "auto",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        ...mediaStyle,
      }}
      src={optimizedImageSrc || resolvedFallback}
      alt={alt}
      draggable={false}
      loading={loading}
      decoding={decoding}
      onLoad={() => {
        recordPerfEvent("media", "animated-media:image-loaded", mediaDebugPayload);
      }}
      onError={(event) => {
        recordPerfEvent("media", "animated-media:image-error", mediaDebugPayload);
        if (optimizedImageSrc && optimizedImageSrc !== resolvedSrc) {
          optimizedMediaEndpointDisabled = true;
          failedOptimizedMediaSourceSet.add(resolvedSrc);
          setFailedOptimizedImageSrc(resolvedSrc);
          event.currentTarget.src = resolvedSrc;
          return;
        }

        if (resolvedFallback && event.currentTarget.src !== resolvedFallback) {
          event.currentTarget.src = resolvedFallback;
        }
      }}
    />
  );
}

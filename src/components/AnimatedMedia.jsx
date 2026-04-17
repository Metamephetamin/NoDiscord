import { useMemo, useState } from "react";
import { isVideoAvatarUrl } from "../utils/avatarMedia";
import { getMediaFrameStyle } from "../utils/mediaFrames";
import { resolveMediaUrl } from "../utils/media";

export default function AnimatedMedia({
  src,
  fallback = "",
  alt = "",
  className = "",
  frame = null,
  mediaType = "",
  style = undefined,
  loading = "lazy",
  decoding = "async",
  ...rest
}) {
  const resolvedSrc = useMemo(() => resolveMediaUrl(src, fallback), [fallback, src]);
  const [failedVideoSrc, setFailedVideoSrc] = useState("");
  const [readyVideoSrc, setReadyVideoSrc] = useState("");
  const resolvedFallback = resolveMediaUrl(fallback, "");
  const normalizedMediaType = String(mediaType || "").toLowerCase().trim();
  const shouldPreferVideo = normalizedMediaType.startsWith("video/");
  const shouldRenderVideo = (shouldPreferVideo || isVideoAvatarUrl(resolvedSrc)) && failedVideoSrc !== resolvedSrc;
  const hasVisualSource = Boolean(resolvedSrc || resolvedFallback);
  const mediaStyle = useMemo(() => getMediaFrameStyle(frame, style), [frame, style]);
  const isVideoReady = readyVideoSrc === resolvedSrc;

  if (!hasVisualSource) {
    return (
      <span
        {...rest}
        className={["animated-avatar--empty", className].filter(Boolean).join(" ")}
        aria-label={alt}
        style={mediaStyle}
      />
    );
  }

  if (shouldRenderVideo) {
    return (
      <video
        key={resolvedSrc}
        {...rest}
        className={className}
        style={{
          ...mediaStyle,
          backgroundColor: "rgba(16, 18, 24, 0.58)",
          opacity: isVideoReady ? 1 : 0.999,
        }}
        src={resolvedSrc}
        poster={resolvedFallback || undefined}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        draggable={false}
        aria-label={alt}
        onLoadedMetadata={() => setReadyVideoSrc(resolvedSrc)}
        onLoadedData={() => setReadyVideoSrc(resolvedSrc)}
        onCanPlay={() => setReadyVideoSrc(resolvedSrc)}
        onPlaying={() => setReadyVideoSrc(resolvedSrc)}
        onError={() => {
          if (readyVideoSrc === resolvedSrc) {
            setReadyVideoSrc("");
          }
          setFailedVideoSrc(resolvedSrc);
        }}
      />
    );
  }

  return (
    <img
      key={resolvedSrc || resolvedFallback}
      {...rest}
      className={className}
      style={{
        display: "block",
        imageRendering: "auto",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        ...mediaStyle,
      }}
      src={resolvedSrc || resolvedFallback}
      alt={alt}
      draggable={false}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        if (resolvedFallback && event.currentTarget.src !== resolvedFallback) {
          event.currentTarget.src = resolvedFallback;
        }
      }}
    />
  );
}

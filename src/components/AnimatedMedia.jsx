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
  style = undefined,
  ...rest
}) {
  const resolvedSrc = useMemo(() => resolveMediaUrl(src, fallback), [fallback, src]);
  const [failedVideoSrc, setFailedVideoSrc] = useState("");
  const resolvedFallback = resolveMediaUrl(fallback, "");
  const shouldRenderVideo = isVideoAvatarUrl(resolvedSrc) && failedVideoSrc !== resolvedSrc;
  const hasVisualSource = Boolean(resolvedSrc || resolvedFallback);
  const mediaStyle = useMemo(() => getMediaFrameStyle(frame, style), [frame, style]);

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
        style={mediaStyle}
        src={resolvedSrc}
        poster={resolvedFallback || undefined}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-label={alt}
        onError={() => setFailedVideoSrc(resolvedSrc)}
      />
    );
  }

  return (
    <img
      key={resolvedSrc || resolvedFallback}
      {...rest}
      className={className}
      style={mediaStyle}
      src={resolvedSrc || resolvedFallback}
      alt={alt}
      loading="lazy"
      onError={(event) => {
        if (resolvedFallback && event.currentTarget.src !== resolvedFallback) {
          event.currentTarget.src = resolvedFallback;
        }
      }}
    />
  );
}

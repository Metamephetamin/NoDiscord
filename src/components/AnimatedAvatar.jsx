import { useEffect, useMemo, useState } from "react";
import { isVideoAvatarUrl } from "../utils/avatarMedia";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

export default function AnimatedAvatar({
  src,
  fallback = DEFAULT_AVATAR,
  alt = "",
  className = "",
  ...rest
}) {
  const resolvedSrc = useMemo(() => resolveMediaUrl(src, fallback), [fallback, src]);
  const [videoFailed, setVideoFailed] = useState(false);
  const resolvedFallback = resolveMediaUrl(fallback, DEFAULT_AVATAR);
  const shouldRenderVideo = isVideoAvatarUrl(resolvedSrc) && !videoFailed;

  useEffect(() => {
    setVideoFailed(false);
  }, [resolvedSrc]);

  if (shouldRenderVideo) {
    return (
      <video
        key={resolvedSrc}
        {...rest}
        className={className}
        src={resolvedSrc}
        poster={resolvedFallback}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-label={alt}
        onError={() => setVideoFailed(true)}
      />
    );
  }

  return (
    <img
      key={resolvedSrc || resolvedFallback}
      {...rest}
      className={className}
      src={resolvedSrc || resolvedFallback}
      alt={alt}
      loading="lazy"
      onError={(event) => {
        if (event.currentTarget.src !== resolvedFallback) {
          event.currentTarget.src = resolvedFallback;
        }
      }}
    />
  );
}

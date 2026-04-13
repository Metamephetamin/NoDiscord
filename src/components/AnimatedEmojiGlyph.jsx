const getLiteAnimatedEmojiMode = (() => {
  let cachedValue = null;

  return () => {
    if (cachedValue !== null) {
      return cachedValue;
    }

    if (typeof window === "undefined" || typeof navigator === "undefined") {
      cachedValue = false;
      return cachedValue;
    }

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const saveData = Boolean(connection?.saveData);
    const slowConnection = ["slow-2g", "2g", "3g"].includes(String(connection?.effectiveType || ""));
    const lowCpu = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;

    cachedValue = Boolean(prefersReducedMotion || saveData || slowConnection || lowCpu);
    return cachedValue;
  };
})();

export default function AnimatedEmojiGlyph({ emoji, className = "", showAsset = true, fallbackText = "" }) {
  const assetUrl = String(emoji?.assetUrl || "");
  const glyph = String(emoji?.glyph || "");
  const combinedClassName = ["animated-emoji-glyph", className].filter(Boolean).join(" ");
  const fallbackGlyph = String(fallbackText || glyph || "").trim();
  const shouldRenderAsset = showAsset && assetUrl && !getLiteAnimatedEmojiMode();

  return (
    <span className={combinedClassName} aria-hidden="true">
      {shouldRenderAsset ? (
        <img src={assetUrl} alt="" draggable="false" loading="lazy" decoding="async" fetchPriority="low" />
      ) : (
        <span className="animated-emoji-glyph__fallback">{fallbackGlyph || "*"}</span>
      )}
    </span>
  );
}

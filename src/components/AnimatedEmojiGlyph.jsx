const ANIMATED_EMOJI_ASSETS_ENABLED = false;

export default function AnimatedEmojiGlyph({ emoji, className = "", showAsset = true, fallbackText = "" }) {
  const assetUrl = String(emoji?.assetUrl || "");
  const glyph = String(emoji?.glyph || "");
  const combinedClassName = ["animated-emoji-glyph", className].filter(Boolean).join(" ");
  const fallbackGlyph = String(fallbackText || glyph || "").trim();
  const shouldRenderAsset = ANIMATED_EMOJI_ASSETS_ENABLED && showAsset && assetUrl;

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

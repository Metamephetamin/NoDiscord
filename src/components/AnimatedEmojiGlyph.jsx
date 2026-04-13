export default function AnimatedEmojiGlyph({ emoji, className = "", showAsset = true, fallbackText = "" }) {
  const assetUrl = String(emoji?.assetUrl || "");
  const glyph = String(emoji?.glyph || "");
  const combinedClassName = ["animated-emoji-glyph", className].filter(Boolean).join(" ");
  const fallbackGlyph = String(fallbackText || glyph || "").trim();

  return (
    <span className={combinedClassName} aria-hidden="true">
      {showAsset && assetUrl ? (
        <img src={assetUrl} alt="" draggable="false" loading="lazy" decoding="async" />
      ) : (
        <span className="animated-emoji-glyph__fallback">{fallbackGlyph || "*"}</span>
      )}
    </span>
  );
}

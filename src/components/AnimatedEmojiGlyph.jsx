export default function AnimatedEmojiGlyph({ emoji, className = "" }) {
  const assetUrl = String(emoji?.assetUrl || "");
  const glyph = String(emoji?.glyph || "");
  const combinedClassName = ["animated-emoji-glyph", className].filter(Boolean).join(" ");

  return (
    <span className={combinedClassName} aria-hidden="true">
      {assetUrl ? (
        <img src={assetUrl} alt="" draggable="false" loading="lazy" />
      ) : (
        glyph
      )}
    </span>
  );
}

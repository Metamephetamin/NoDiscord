import { useMemo, useState } from "react";

const TWEMOJI_SVG_BASE_URL = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/";
const EMOJI_VARIATION_SELECTOR = "fe0f";

const buildTwemojiCodepoint = (glyph) => {
  const codepoints = Array.from(String(glyph || "").trim())
    .map((symbol) => symbol.codePointAt(0)?.toString(16))
    .filter((codepoint) => codepoint && codepoint !== EMOJI_VARIATION_SELECTOR);

  return codepoints.length ? codepoints.join("-") : "";
};

const getTwemojiSvgUrl = (glyph) => {
  const codepoint = buildTwemojiCodepoint(glyph);
  return codepoint ? `${TWEMOJI_SVG_BASE_URL}${codepoint}.svg` : "";
};

export default function AnimatedEmojiGlyph({ emoji, className = "", showAsset = true, fallbackText = "" }) {
  const glyph = String(emoji?.glyph || "");
  const fallbackGlyph = String(fallbackText || glyph || "").trim();
  const imageUrl = useMemo(() => String(emoji?.imageUrl || getTwemojiSvgUrl(fallbackGlyph)), [emoji?.imageUrl, fallbackGlyph]);
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const combinedClassName = ["animated-emoji-glyph", className].filter(Boolean).join(" ");
  const shouldRenderImage = showAsset && imageUrl && failedImageUrl !== imageUrl;

  return (
    <span className={combinedClassName} aria-hidden="true">
      {shouldRenderImage ? (
        <img
          src={imageUrl}
          alt=""
          draggable="false"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        <span className="animated-emoji-glyph__fallback">{fallbackGlyph || "*"}</span>
      )}
    </span>
  );
}

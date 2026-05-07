import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const component = readFileSync("src/components/VoiceMessageBubble.jsx", "utf8");
const css = readFileSync("src/css/TextChat.css", "utf8");

assert(component.includes("handleWaveformSeek"), "VoiceMessageBubble should seek when the waveform is pressed.");
assert(component.includes("const VOICE_WAVEFORM_BAR_COUNT = 64;"), "Voice waveform should use more, thinner seek bars.");
assert(component.includes("onPointerDown={handleWaveformSeek}"), "Waveform should support pointer seeking.");
assert(component.includes("onKeyDown={handleWaveformKeyDown}"), "Waveform should support keyboard seeking.");
assert(component.includes('role="slider"'), "Waveform should expose slider semantics for seeking.");
assert(component.includes("audio.currentTime = nextTimeSeconds"), "Seeking should update the audio element currentTime.");
assert(component.includes("getBarFill") && component.includes("--voice-bar-fill"), "Waveform progress should fill bars smoothly instead of rounding active bars.");
assert(!component.includes("activeBars"), "Waveform progress should not use rounded active bar counts.");
assert(css.includes("cursor: pointer;") && css.includes(".voice-message__waveform:focus-visible"), "Waveform seek target should be visibly interactive.");
assert(css.includes("gap: 1px;") && css.includes("width: 2px;") && css.includes("flex: 0 0 2px;"), "Voice waveform bars should be thinner and denser.");
assert(css.includes(".voice-message__bar::after") && css.includes("opacity: var(--voice-bar-fill);"), "Voice waveform active fill should be a smooth overlay.");
assert(!css.includes(".voice-message__bar--active"), "Voice waveform should not rely on discrete active bar classes.");
assert(
  css.includes(".msg-content--voice-only .message-bottom-row--voice {\n  position: absolute;\n  right: 8px;\n  bottom: 6px;"),
  "Voice-only message footer should sit inside the voice bubble instead of a separate right column."
);
assert(
  css.includes(".voice-message__speed {\n  position: absolute;\n  right: 8px;\n  top: 50%;") && css.includes("transform: translateY(-50%);"),
  "Voice playback speed button should be vertically centered inside the voice bubble."
);

console.log("voice-message-seek smoke passed");

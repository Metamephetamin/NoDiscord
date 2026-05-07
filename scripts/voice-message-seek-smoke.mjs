import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const component = readFileSync("src/components/VoiceMessageBubble.jsx", "utf8");
const css = readFileSync("src/css/TextChat.css", "utf8");

assert(component.includes("handleWaveformSeek"), "VoiceMessageBubble should seek when the waveform is pressed.");
assert(component.includes("onPointerDown={handleWaveformSeek}"), "Waveform should support pointer seeking.");
assert(component.includes("onKeyDown={handleWaveformKeyDown}"), "Waveform should support keyboard seeking.");
assert(component.includes('role="slider"'), "Waveform should expose slider semantics for seeking.");
assert(component.includes("audio.currentTime = nextTimeSeconds"), "Seeking should update the audio element currentTime.");
assert(css.includes("cursor: pointer;") && css.includes(".voice-message__waveform:focus-visible"), "Waveform seek target should be visibly interactive.");

console.log("voice-message-seek smoke passed");

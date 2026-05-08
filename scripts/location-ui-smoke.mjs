import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pickerSource = readFileSync("src/components/TextChatLocationPickerModal.jsx", "utf8");
const sendActionsSource = readFileSync("src/hooks/useTextChatSendActions.js", "utf8");
const css = readFileSync("src/css/TextChat.css", "utf8");
const backendSource = readFileSync("BackNoDiscord/BackNoDiscord/Program.cs", "utf8");

assert(pickerSource.includes("mt{s}.google.com/vt/lyrs=m"), "Location picker should use Google map tiles.");
assert(sendActionsSource.includes("https://www.google.com/maps?q="), "Location messages should open in Google Maps.");
assert(!sendActionsSource.includes("openstreetmap.org/?mlat="), "Location messages should not use OpenStreetMap links.");
assert(css.includes(".location-picker-map__marker"), "Location marker styles must exist.");
assert(css.includes("z-index: 5"), "Location marker must stay above Leaflet map panes.");
assert(css.includes("pointer-events: none"), "Location marker must not intercept map clicks.");
assert(css.includes(".location-picker-modal__close::before"), "Location close button should draw its own cross.");
assert(css.includes(".location-picker-modal__close::after"), "Location close button should draw its own cross.");
assert(backendSource.includes("https://mt0.google.com"), "Production CSP must allow Google map tiles.");
assert(css.includes("width: clamp(240px, 32vw, 340px);"), "Location message card should be wider than the old narrow preview.");
assert(css.includes(".message-location-card__footer"), "Location message timestamp footer should render inside the card.");
assert(css.includes("bottom: 7px;") && css.includes("background: rgba(7, 11, 18, 0.66);"), "Location footer should be an in-card overlay like media timestamps.");
assert(!css.includes("width: min(100%, 340px);\n  overflow: hidden;\n  border-radius: 16px;"), "Location card should not use the old shrink-prone width rule.");

console.log("Location UI smoke checks passed.");

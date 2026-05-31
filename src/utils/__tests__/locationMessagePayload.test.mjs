import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocationMessageText,
  parseLocationMessageText,
} from "../locationMessagePayload.js";

test("location messages avoid plaintext coordinates in transport text", () => {
  const messageText = buildLocationMessageText({
    latitude: 55.123456,
    longitude: 37.567891,
    zoom: 15,
  });

  assert.match(messageText, /^📍 tend-location:/u);
  assert.doesNotMatch(messageText, /55\.1235/);
  assert.doesNotMatch(messageText, /37\.5679/);
  assert.doesNotMatch(messageText, /google\.com\/maps/);

  const parsed = parseLocationMessageText(messageText);

  assert.equal(parsed.latitude, 55.1235);
  assert.equal(parsed.longitude, 37.5679);
  assert.equal(parsed.zoom, 15);
});

test("legacy plaintext location messages still render", () => {
  const parsed = parseLocationMessageText("📍 55.1, 37.6\nhttps://www.google.com/maps?q=55.1,37.6&z=14");

  assert.equal(parsed.latitude, 55.1);
  assert.equal(parsed.longitude, 37.6);
  assert.equal(parsed.zoom, 14);
});

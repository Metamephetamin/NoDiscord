import assert from "node:assert/strict";
import test from "node:test";

let mediaFramesModule = null;
let mediaFramesLoadError = null;

try {
  mediaFramesModule = await import("../mediaFrames.js");
} catch (error) {
  mediaFramesLoadError = error;
}

test("media frame bounds can allow wider horizontal avatar travel", () => {
  assert.ifError(mediaFramesLoadError);

  const { getMediaFramePositionBounds } = mediaFramesModule;
  const squareBounds = getMediaFramePositionBounds(2, { axis: "x", target: "avatar" });
  const wideBounds = getMediaFramePositionBounds(2, { axis: "x", target: "avatar", mediaAspectRatio: 2 });
  const verticalBounds = getMediaFramePositionBounds(2, { axis: "y", target: "avatar", mediaAspectRatio: 2 });

  assert.ok(wideBounds.min < squareBounds.min);
  assert.ok(wideBounds.max > squareBounds.max);
  assert.deepEqual(verticalBounds, squareBounds);
});

test("media frame style uses frame position as transform origin", () => {
  assert.ifError(mediaFramesLoadError);

  const { getMediaFrameStyle } = mediaFramesModule;
  const style = getMediaFrameStyle({ x: 80, y: 26, zoom: 2 });

  assert.equal(style["--media-frame-x"], "80%");
  assert.equal(style["--media-frame-y"], "26%");
  assert.equal(style.transformOrigin, "var(--media-frame-x) var(--media-frame-y)");
});

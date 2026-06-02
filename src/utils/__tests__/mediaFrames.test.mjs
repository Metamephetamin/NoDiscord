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

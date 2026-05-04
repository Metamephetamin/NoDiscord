import test from "node:test";
import assert from "node:assert/strict";
import { canReuseVideoStream, getReusableVideoTrack } from "../localShareStreamReuse.mjs";

const createStream = ({ readyState = "live", deviceId = "camera-1" } = {}) => {
  const track = {
    readyState,
    getSettings: () => ({ deviceId }),
  };

  return {
    track,
    getVideoTracks: () => [track],
  };
};

test("reuses live preview stream when device matches", () => {
  const stream = createStream({ deviceId: "device-a" });

  assert.equal(getReusableVideoTrack(stream, "device-a"), stream.track);
  assert.equal(canReuseVideoStream(stream, "device-a"), true);
});

test("does not reuse ended or mismatched preview stream", () => {
  assert.equal(canReuseVideoStream(createStream({ readyState: "ended", deviceId: "device-a" }), "device-a"), false);
  assert.equal(canReuseVideoStream(createStream({ deviceId: "device-a" }), "device-b"), false);
});

test("allows reuse when browser does not expose a stable device id", () => {
  assert.equal(canReuseVideoStream(createStream({ deviceId: "" }), "device-a"), true);
  assert.equal(canReuseVideoStream(createStream({ deviceId: "device-a" }), "camera-1"), true);
});

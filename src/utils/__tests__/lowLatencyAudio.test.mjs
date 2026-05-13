import assert from "node:assert/strict";
import test from "node:test";

import {
  playLowLatencyAudio,
  primeLowLatencyAudio,
  resetLowLatencyAudioCache,
} from "../lowLatencyAudio.js";

test("low latency audio primes a reusable pool and replays without creating new elements", () => {
  const created = [];
  const originalAudio = globalThis.Audio;

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.currentTime = 12;
      this.volume = 0;
      this.playCount = 0;
      this.pauseCount = 0;
      this.loadCount = 0;
      created.push(this);
    }

    load() {
      this.loadCount += 1;
    }

    pause() {
      this.pauseCount += 1;
    }

    play() {
      this.playCount += 1;
      return Promise.resolve();
    }
  }

  try {
    globalThis.Audio = FakeAudio;
    resetLowLatencyAudioCache();

    primeLowLatencyAudio("/sounds/tend-voice-leave.wav", { volume: 0.45, poolSize: 3 });
    assert.equal(created.length, 3);
    assert.equal(created.every((audio) => audio.loadCount === 1), true);

    assert.equal(playLowLatencyAudio("/sounds/tend-voice-leave.wav", { volume: 0.45, poolSize: 3 }), true);
    assert.equal(created.length, 3);
    assert.equal(created[0].pauseCount, 1);
    assert.equal(created[0].currentTime, 0);
    assert.equal(created[0].playCount, 1);

    assert.equal(playLowLatencyAudio("/sounds/tend-voice-leave.wav", { volume: 0.45, poolSize: 3 }), true);
    assert.equal(created.length, 3);
    assert.equal(created[1].playCount, 1);
  } finally {
    resetLowLatencyAudioCache();
    globalThis.Audio = originalAudio;
  }
});

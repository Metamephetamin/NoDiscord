import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceSessionPrewarmCache } from "../voiceSessionPrewarmCache.mjs";

test("reuses a prewarmed session for the same channel and user", () => {
  const cache = createVoiceSessionPrewarmCache({ ttlMs: 1000, now: () => 100 });
  const session = { participantToken: "token-1", serverUrl: "wss://voice.example" };

  cache.store("server::voice", { id: "user-1" }, session, 100);

  assert.equal(cache.isReusable("server::voice", { id: "user-1" }, 500), true);
  assert.equal(cache.take("server::voice", { id: "user-1" }, 500), session);
  assert.equal(cache.take("server::voice", { id: "user-1" }, 500), null);
});

test("does not reuse expired or mismatched prewarmed sessions", () => {
  const cache = createVoiceSessionPrewarmCache({ ttlMs: 1000, now: () => 100 });
  const session = { participantToken: "token-1", serverUrl: "wss://voice.example" };

  cache.store("server::voice", { id: "user-1" }, session, 100);
  assert.equal(cache.isReusable("server::voice", { id: "user-2" }, 500), false);

  cache.store("server::voice", { id: "user-1" }, session, 100);
  assert.equal(cache.isReusable("server::other", { id: "user-1" }, 500), false);

  cache.store("server::voice", { id: "user-1" }, session, 100);
  assert.equal(cache.isReusable("server::voice", { id: "user-1" }, 1201), false);
});

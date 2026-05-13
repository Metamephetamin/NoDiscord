import test from "node:test";
import assert from "node:assert/strict";

import {
  invokeVoiceSignalWithRetry,
  isRetryableVoiceSignalError,
} from "../voiceSignalRetry.mjs";

test("isRetryableVoiceSignalError retries definite transport disconnects", () => {
  assert.equal(isRetryableVoiceSignalError(new Error("Cannot send data if the connection is not in the Connected State.")), true);
  assert.equal(isRetryableVoiceSignalError(new Error("Connection disconnected.")), true);
  assert.equal(isRetryableVoiceSignalError(new Error("WebSocket closed with status code 1006.")), true);
});

test("isRetryableVoiceSignalError does not retry server validation or uncertain timeouts", () => {
  assert.equal(isRetryableVoiceSignalError(new Error("Forbidden")), false);
  assert.equal(isRetryableVoiceSignalError(new Error("Unauthorized")), false);
  assert.equal(isRetryableVoiceSignalError(new Error("Target user is busy")), false);
  assert.equal(isRetryableVoiceSignalError(new Error("Server timeout elapsed without receiving a message from the server.")), false);
});

test("invokeVoiceSignalWithRetry reconnects before retrying retryable failures", async () => {
  const calls = [];
  let attempts = 0;

  const result = await invokeVoiceSignalWithRetry({
    invoke: async () => {
      attempts += 1;
      calls.push(`invoke:${attempts}`);
      if (attempts === 1) {
        throw new Error("Connection disconnected.");
      }
      return "ok";
    },
    reconnect: async () => {
      calls.push("reconnect");
    },
    delayMs: 0,
  });

  assert.equal(result, "ok");
  assert.deepEqual(calls, ["invoke:1", "reconnect", "invoke:2"]);
});

test("invokeVoiceSignalWithRetry does not retry validation failures", async () => {
  let attempts = 0;

  await assert.rejects(
    invokeVoiceSignalWithRetry({
      invoke: async () => {
        attempts += 1;
        throw new Error("Forbidden");
      },
      reconnect: async () => {
        throw new Error("should not reconnect");
      },
      delayMs: 0,
    }),
    /Forbidden/
  );

  assert.equal(attempts, 1);
});

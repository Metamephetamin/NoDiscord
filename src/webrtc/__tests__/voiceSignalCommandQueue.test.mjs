import test from "node:test";
import assert from "node:assert/strict";

import { createVoiceSignalCommandQueue } from "../voiceSignalCommandQueue.mjs";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushQueueStart() {
  await Promise.resolve();
  await Promise.resolve();
}

test("voice signal command queue runs commands sequentially", async () => {
  const firstGate = createDeferred();
  const events = [];
  const queue = createVoiceSignalCommandQueue({
    execute: async (command) => {
      events.push(`start:${command.methodName}`);
      if (command.methodName === "first") {
        await firstGate.promise;
      }
      events.push(`finish:${command.methodName}`);
      return command.methodName;
    },
  });

  const first = queue.enqueue({ methodName: "first", key: "first" });
  const second = queue.enqueue({ methodName: "second", key: "second" });

  await flushQueueStart();
  assert.deepEqual(events, ["start:first"]);

  firstGate.resolve();
  assert.equal(await first, "first");
  assert.equal(await second, "second");
  assert.deepEqual(events, ["start:first", "finish:first", "start:second", "finish:second"]);
});

test("voice signal command queue supersedes duplicate queued commands", async () => {
  const firstGate = createDeferred();
  const events = [];
  const queue = createVoiceSignalCommandQueue({
    execute: async (command) => {
      events.push(`run:${command.id}`);
      if (command.id === "running") {
        await firstGate.promise;
      }
      return command.id;
    },
  });

  const running = queue.enqueue({ id: "running", methodName: "StartDirectCall", key: "start:1:2" });
  const stale = queue.enqueue({ id: "stale", methodName: "AcceptDirectCall", key: "accept:1:2" });
  const latest = queue.enqueue({ id: "latest", methodName: "AcceptDirectCall", key: "accept:1:2" });

  assert.deepEqual(await stale, { status: "superseded" });
  firstGate.resolve();

  assert.equal(await running, "running");
  assert.equal(await latest, "latest");
  assert.deepEqual(events, ["run:running", "run:latest"]);
});

test("voice signal command queue forwards retrying and failed statuses", async () => {
  const statuses = [];
  const queue = createVoiceSignalCommandQueue({
    execute: async (command) => {
      command.reportStatus("retrying", { attempt: 1 });
      throw new Error("Connection disconnected.");
    },
    onStatus: (status) => {
      statuses.push([status.status, status.attempt || 0]);
    },
  });

  await assert.rejects(
    queue.enqueue({ id: "failed", methodName: "EndDirectCall", key: "end:1:2" }),
    /Connection disconnected/
  );

  assert.deepEqual(statuses, [["queued", 0], ["running", 0], ["retrying", 1], ["failed", 0]]);
});

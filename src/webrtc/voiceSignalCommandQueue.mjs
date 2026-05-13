function normalizeCommandKey(command) {
  const explicitKey = String(command?.key || "").trim();
  if (explicitKey) {
    return explicitKey;
  }

  return [
    String(command?.methodName || "").trim(),
    ...(Array.isArray(command?.args) ? command.args : []).map((value) => String(value ?? "")),
  ].join(":");
}

function createSupersededResult() {
  return { status: "superseded" };
}

export function createVoiceSignalCommandQueue({
  execute,
  onStatus = null,
} = {}) {
  if (typeof execute !== "function") {
    throw new Error("voice signal command queue execute function is required");
  }

  let tail = Promise.resolve();
  const queuedByKey = new Map();

  const emitStatus = (command, status, extra = {}) => {
    if (typeof onStatus !== "function") {
      return;
    }

    onStatus({
      id: command.id,
      key: command.key,
      methodName: command.methodName,
      args: command.args,
      status,
      ...extra,
    });
  };

  const enqueue = (rawCommand = {}) => {
    const key = normalizeCommandKey(rawCommand);
    const command = {
      ...rawCommand,
      id: String(rawCommand?.id || `${key || "voice-signal"}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`),
      key,
      methodName: String(rawCommand?.methodName || "").trim(),
      args: Array.isArray(rawCommand?.args) ? rawCommand.args : [],
      started: false,
      cancelled: false,
      reportStatus: null,
      resolve: null,
      reject: null,
    };
    command.reportStatus = (status, extra = {}) => emitStatus(command, status, extra);

    const promise = new Promise((resolve, reject) => {
      command.resolve = resolve;
      command.reject = reject;
    });

    if (key) {
      const previousQueued = queuedByKey.get(key);
      if (previousQueued && !previousQueued.started) {
        previousQueued.cancelled = true;
        queuedByKey.delete(key);
        emitStatus(previousQueued, "superseded", { supersededById: command.id });
        previousQueued.resolve(createSupersededResult());
      }

      queuedByKey.set(key, command);
    }

    emitStatus(command, "queued");

    const runCommand = tail.catch(() => undefined).then(async () => {
      if (command.cancelled) {
        return createSupersededResult();
      }

      command.started = true;
      if (key && queuedByKey.get(key) === command) {
        queuedByKey.delete(key);
      }

      emitStatus(command, "running");
      try {
        const result = await execute(command);
        emitStatus(command, "sent");
        command.resolve(result);
        return result;
      } catch (error) {
        emitStatus(command, "failed", {
          errorName: error?.name || "",
          error: error?.message || String(error),
        });
        command.reject(error);
        throw error;
      }
    });

    tail = runCommand.catch(() => undefined);
    return promise;
  };

  return {
    enqueue,
    getQueuedCount() {
      return queuedByKey.size;
    },
  };
}

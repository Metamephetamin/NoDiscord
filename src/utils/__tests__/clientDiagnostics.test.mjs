import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeClientDiagnosticEvent,
} from "../clientDiagnostics.js";

test("sanitizeClientDiagnosticEvent keeps safe diagnostic fields", () => {
  const event = sanitizeClientDiagnosticEvent({
    type: "chat signalr start failed",
    surface: "chat-signalr",
    route: "/channels/1?access_token=secret&view=chat",
    appVersion: "1.2.3",
    errorName: "NetworkError",
    phase: "start-failed",
    status: "Disconnected",
    timestamp: "2026-05-13T10:00:00.000Z",
  });

  assert.deepEqual(event, {
    type: "chat signalr start failed",
    surface: "chat-signalr",
    route: "/channels/1?access_token=[redacted]&view=chat",
    appVersion: "1.2.3",
    errorName: "NetworkError",
    phase: "start-failed",
    status: "Disconnected",
    timestamp: "2026-05-13T10:00:00.000Z",
  });
});

test("sanitizeClientDiagnosticEvent rejects message content and token-like fields", () => {
  assert.equal(sanitizeClientDiagnosticEvent({
    type: "renderer uncaught exception",
    surface: "window-error",
    message: "private message text",
  }), null);

  assert.equal(sanitizeClientDiagnosticEvent({
    type: "renderer uncaught exception",
    surface: "window-error",
    authorization: "Bearer secret",
  }), null);

  assert.equal(sanitizeClientDiagnosticEvent({
    type: "renderer uncaught exception",
    surface: "window-error",
    nested: {
      token: "secret",
    },
  }), null);
});

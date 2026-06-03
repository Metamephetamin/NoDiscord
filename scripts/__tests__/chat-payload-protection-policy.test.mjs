import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("chat payload helpers do not imply frontend end-to-end encryption", () => {
  assert.equal(
    existsSync("src/security/chatPayloadCrypto.js"),
    false,
    "plaintext transport helpers should not live in a crypto-named module",
  );

  const serializer = read("src/security/chatPayloadSerialization.js");
  assert.match(
    serializer,
    /export const CHAT_PAYLOAD_PROTECTION_MODE = "server-readable"/,
    "chat payload serializer should explicitly document server-readable transport",
  );
  assert.match(
    serializer,
    /encryptionState: normalizedText \? "server-readable-plaintext" : "empty"/,
    "outgoing text payloads should not report a vague plaintext encryption state",
  );
  assert.match(
    serializer,
    /attachmentProtectionMode: CHAT_PAYLOAD_PROTECTION_MODE/,
    "attachment payloads should expose the same server-readable protection mode",
  );
});

test("chat payload imports use serialization module name", () => {
  const sources = [
    "src/hooks/useTextChatSendActions.js",
    "src/hooks/useTextChatOptimisticUploadQueue.js",
    "src/hooks/useTextChatMessageActions.js",
    "src/hooks/useTextChatVoiceSpeech.js",
    "src/features/text-chat/TextChatController.jsx",
    "src/utils/textChatForwardPayload.js",
    "src/utils/textChatSendCompat.js",
  ].map(read).join("\n");

  assert.doesNotMatch(
    sources,
    /chatPayloadCrypto/,
    "imports should not reference the old crypto module name",
  );
  assert.match(
    sources,
    /chatPayloadSerialization/,
    "chat payload callers should import the serialization helper",
  );
});

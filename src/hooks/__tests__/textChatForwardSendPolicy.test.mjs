import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");

function readRepoFile(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("forward submit keeps the hub forward path enabled", () => {
  const source = readRepoFile("src/hooks/useTextChatMessageActions.js");

  assert.doesNotMatch(source, /sendMessagesCompat\([^;\n]*\{\s*allowBatch:\s*false\s*\}/);
});

test("forward modal closes before messages are sent", () => {
  const source = readRepoFile("src/hooks/useTextChatMessageActions.js");
  const closeIndex = source.indexOf("closeForwardModal();", source.indexOf("const handleForwardSubmit"));
  const sendIndex = source.indexOf("await sendMessagesCompat", source.indexOf("const handleForwardSubmit"));

  assert.notEqual(closeIndex, -1);
  assert.notEqual(sendIndex, -1);
  assert.ok(closeIndex < sendIndex);
});

test("sendMessagesCompat tries ForwardMessages before SendMessage when batch hub is allowed", () => {
  const source = readRepoFile("src/utils/textChatSendCompat.js");
  const forwardIndex = source.indexOf('chatConnection.invoke("ForwardMessages"');
  const sendIndex = source.indexOf('chatConnection.invoke("SendMessage"');

  assert.notEqual(forwardIndex, -1);
  assert.notEqual(sendIndex, -1);
  assert.ok(forwardIndex < sendIndex);
  assert.match(source, /containsForwardPayload/);
  assert.match(source, /allowBatch\s*&&\s*\(\s*containsForwardPayload/);
});

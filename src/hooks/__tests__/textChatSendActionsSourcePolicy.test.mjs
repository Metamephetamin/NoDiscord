import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(testDir, "../useTextChatSendActions.js"), "utf8");

test("pending upload creation cancellation callback does not depend on itself", () => {
  const declarationStart = source.indexOf("const cancelPendingUploadCreation = useCallback");
  const declarationEnd = source.indexOf("const isCancelledPendingUploadError", declarationStart);
  const declaration = source.slice(declarationStart, declarationEnd);

  assert.notEqual(declarationStart, -1);
  assert.notEqual(declarationEnd, -1);
  assert.doesNotMatch(
    declaration,
    /\[\s*cancelPendingUploadCreation\s*\]/,
  );
});

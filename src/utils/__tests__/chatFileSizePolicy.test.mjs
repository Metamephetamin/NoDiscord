import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const textChatModelSource = readFileSync("src/utils/textChatModel.js", "utf8");
const mainSource = readFileSync("src/main.js", "utf8");

test("chat file size policy is 500 MB in renderer and Electron", () => {
  assert.match(
    textChatModelSource,
    /MAX_FILE_SIZE_BYTES\s*=\s*500\s*\*\s*1024\s*\*\s*1024/,
    "renderer chat upload limit should be 500 MB"
  );
  assert.match(
    textChatModelSource,
    /MAX_FILE_SIZE_LABEL\s*=\s*"500 МБ"/,
    "renderer chat upload label should be 500 МБ"
  );
  assert.match(
    mainSource,
    /MAX_ELECTRON_DOWNLOAD_BYTES\s*=\s*500\s*\*\s*1024\s*\*\s*1024/,
    "Electron download limit should be 500 MB"
  );
  assert.match(
    mainSource,
    /ATTACHMENT_PICKER_MAX_FILE_SIZE_BYTES\s*=\s*MAX_ELECTRON_DOWNLOAD_BYTES/,
    "Electron attachment picker should use the same limit as chat downloads"
  );
});

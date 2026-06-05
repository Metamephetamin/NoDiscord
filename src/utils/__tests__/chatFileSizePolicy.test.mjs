import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const textChatModelSource = readFileSync("src/utils/textChatModel.js", "utf8");
const mainSource = readFileSync("src/main.js", "utf8");

test("chat file size policy is 30 GB in renderer and Electron", () => {
  assert.match(
    textChatModelSource,
    /MAX_FILE_SIZE_BYTES\s*=\s*30\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/,
    "renderer chat upload limit should be 30 GB"
  );
  assert.match(
    textChatModelSource,
    /MAX_FILE_SIZE_LABEL\s*=\s*"30 ГБ"/,
    "renderer chat upload label should be 30 ГБ"
  );
  assert.match(
    mainSource,
    /MAX_ELECTRON_DOWNLOAD_BYTES\s*=\s*30\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/,
    "Electron download limit should be 30 GB"
  );
  assert.match(
    mainSource,
    /ATTACHMENT_PICKER_MAX_FILE_SIZE_BYTES\s*=\s*MAX_ELECTRON_DOWNLOAD_BYTES/,
    "Electron attachment picker should use the same limit as chat downloads"
  );
});

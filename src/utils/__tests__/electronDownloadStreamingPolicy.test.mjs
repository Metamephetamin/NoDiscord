import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync("src/main.js", "utf8");

function getHandlerBody(channel) {
  const marker = `ipcMain.handle("${channel}"`;
  const start = mainSource.lastIndexOf(marker);
  assert.notEqual(start, -1, `Missing IPC handler: ${channel}`);

  const nextHandler = mainSource.indexOf("ipcMain.handle(", start + marker.length);
  return nextHandler === -1 ? mainSource.slice(start) : mainSource.slice(start, nextHandler);
}

test("large Electron downloads stream to disk instead of buffering whole response", () => {
  const fetchAndSaveBody = getHandlerBody("downloads:fetch-and-save");
  const fetchAndSaveManyBody = getHandlerBody("downloads:fetch-and-save-many");

  assert.match(
    mainSource,
    /streamDownloadResponseToFile/,
    "main process should expose a streaming download writer"
  );
  assert.doesNotMatch(
    fetchAndSaveBody,
    /readDownloadResponseBuffer|arrayBuffer\(\)|fs\.writeFile\(filePath,\s*buffer/,
    "single-file downloads should not buffer the full response before writing"
  );
  assert.doesNotMatch(
    fetchAndSaveManyBody,
    /readDownloadResponseBuffer|arrayBuffer\(\)|fs\.writeFile\(nextFilePath,\s*buffer/,
    "batch downloads should not buffer each full response before writing"
  );
  assert.match(
    fetchAndSaveBody,
    /streamDownloadResponseToFile\(response,\s*filePath/,
    "single-file downloads should write the response stream to the selected path"
  );
  assert.match(
    fetchAndSaveManyBody,
    /streamDownloadResponseToFile\(response,\s*nextFilePath/,
    "batch downloads should write each response stream to its target path"
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedChatAttachmentFile } from "../chatAttachmentPolicy.js";

function createFile(name, type = "application/octet-stream") {
  return new globalThis.File(["content"], name, { type });
}

test("allows common document and data files", () => {
  [
    "report.docx",
    "table.xlsx",
    "slides.pptx",
    "paper.pdf",
    "notes.txt",
    "data.csv",
    "payload.json",
    "readme.log",
  ].forEach((name) => {
    assert.equal(isAllowedChatAttachmentFile(createFile(name)), true, name);
  });
});

test("allows installer and script-like attachments", () => {
  [
    "start.bat",
    "deploy.cmd",
    "app.apk",
    "tool.exe",
    "installer.msi",
    "script.ps1",
    "payload.js",
    "page.html",
  ].forEach((name) => {
    assert.equal(isAllowedChatAttachmentFile(createFile(name)), true, name);
  });
});

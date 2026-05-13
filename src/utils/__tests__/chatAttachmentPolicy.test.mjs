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

test("rejects dangerous executable and script-like attachments", () => {
  [
    "start.bat",
    "deploy.cmd",
    "tool.exe",
    "installer.msi",
    "script.ps1",
    "payload.js",
  ].forEach((name) => {
    assert.equal(isAllowedChatAttachmentFile(createFile(name)), false, name);
  });
});

test("rejects dangerous double-extension traps", () => {
  [
    "invoice.exe.pdf",
    "photo.scr.jpg",
    "readme.ps1.txt",
  ].forEach((name) => {
    assert.equal(isAllowedChatAttachmentFile(createFile(name)), false, name);
  });
});

test("allows non-executable attachments without a strict allowlist", () => {
  [
    "app.apk",
    "page.html",
    "archive.zip",
    "design.fig",
  ].forEach((name) => {
    assert.equal(isAllowedChatAttachmentFile(createFile(name)), true, name);
  });
});

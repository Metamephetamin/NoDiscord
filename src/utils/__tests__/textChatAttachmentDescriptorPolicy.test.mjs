import assert from "node:assert/strict";
import test from "node:test";
import { buildUploadDescriptors } from "../textChatUploadDescriptors.mjs";

/* global File */

function createUpload({ kind, name = "attachment.bin", type = "application/octet-stream" }) {
  return {
    id: `${kind}-upload`,
    file: new File(["payload"], name, { type }),
    name,
    size: 7,
    type,
    kind,
  };
}

test("document uploads are sent as file attachments", () => {
  const [descriptor] = buildUploadDescriptors({
    filesToSend: [createUpload({ kind: "file", name: "archive.zip", type: "application/zip" })],
  });

  assert.equal(descriptor.attachments.length, 1);
  assert.equal(descriptor.attachments[0].attachmentAsFile, true);
});

test("images are media by default and file attachments only when sent as documents", () => {
  const [mediaDescriptor] = buildUploadDescriptors({
    filesToSend: [createUpload({ kind: "image", name: "photo.png", type: "image/png" })],
    sendAsDocuments: false,
  });
  const [documentDescriptor] = buildUploadDescriptors({
    filesToSend: [createUpload({ kind: "image", name: "photo.png", type: "image/png" })],
    sendAsDocuments: true,
  });

  assert.equal(mediaDescriptor.attachments[0].attachmentAsFile, false);
  assert.equal(documentDescriptor.attachments[0].attachmentAsFile, true);
});

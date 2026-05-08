import test from "node:test";
import assert from "node:assert/strict";

import { getActiveUploadedAttachments } from "../textChatOptimisticUploadQueuePolicy.mjs";

test("getActiveUploadedAttachments excludes uploads cancelled before message send", () => {
  const uploadedAttachments = getActiveUploadedAttachments(
    [
      { fileUrl: "/chat-files/first.png", fileName: "first.png" },
      { fileUrl: "/chat-files/second.png", fileName: "second.png" },
    ],
    [
      { uploadId: "first-upload" },
      { uploadId: "second-upload" },
    ],
    new Set(["first-upload"])
  );

  assert.deepEqual(uploadedAttachments, [
    { fileUrl: "/chat-files/second.png", fileName: "second.png" },
  ]);
});

test("getActiveUploadedAttachments returns empty when every upload was cancelled", () => {
  const uploadedAttachments = getActiveUploadedAttachments(
    [
      { fileUrl: "/chat-files/first.png", fileName: "first.png" },
    ],
    [
      { uploadId: "first-upload" },
    ],
    new Set(["first-upload"])
  );

  assert.deepEqual(uploadedAttachments, []);
});

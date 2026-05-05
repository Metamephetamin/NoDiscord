import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pickerFlowSource = readFileSync("src/hooks/useTextChatAttachmentPickerFlow.js", "utf8");
const batchSheetSource = readFileSync("src/components/TextChatBatchUploadSheet.jsx", "utf8");
const pendingUploadSource = readFileSync("src/utils/chatPendingUploads.js", "utf8");

assert(
  pickerFlowSource.includes("allSelectedAreMedia"),
  "Attachment picker must treat images and videos as media selections."
);
assert(
  pickerFlowSource.includes("fileType.startsWith(\"image/\") || fileType.startsWith(\"video/\")"),
  "Attachment picker must not force video uploads into document mode."
);
assert(
  batchSheetSource.includes("const showSendAsDocumentsOption = !showPendingShell && hasMediaOnlySelection"),
  "Batch upload sheet must show send-as-file only for pure media selections."
);
assert(
  batchSheetSource.includes("{showSendAsDocumentsOption ? ("),
  "Batch upload sheet must hide the send-as-file option for ordinary files."
);
assert(
  pendingUploadSource.includes("return normalizeUploadFileSignature(sourceFile);"),
  "Chat uploads must preserve original image bytes apart from signature/type normalization."
);

console.log("Upload UI smoke checks passed.");

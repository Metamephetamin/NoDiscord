export function getActiveUploadedAttachments(attachmentResults = [], attachmentDrafts = [], cancelledAttachmentIds = null) {
  const cancelledIds = cancelledAttachmentIds instanceof Set
    ? cancelledAttachmentIds
    : new Set(Array.isArray(cancelledAttachmentIds) ? cancelledAttachmentIds : []);

  return (Array.isArray(attachmentResults) ? attachmentResults : []).filter((attachmentResult, attachmentIndex) => {
    if (!attachmentResult) {
      return false;
    }

    const uploadId = String(attachmentDrafts?.[attachmentIndex]?.uploadId || "");
    return !uploadId || !cancelledIds.has(uploadId);
  });
}

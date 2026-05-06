export function getChatAttachmentExtension(name) {
  const normalizedName = String(name || "").trim();
  const dotIndex = normalizedName.lastIndexOf(".");
  return dotIndex > 0 ? normalizedName.slice(dotIndex).toLowerCase() : "";
}

export function isAllowedChatAttachmentFile(file) {
  return file instanceof File;
}

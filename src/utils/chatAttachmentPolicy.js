export function getChatAttachmentExtension(name) {
  const normalizedName = String(name || "").trim();
  const dotIndex = normalizedName.lastIndexOf(".");
  return dotIndex > 0 ? normalizedName.slice(dotIndex).toLowerCase() : "";
}

const DANGEROUS_CHAT_ATTACHMENT_EXTENSIONS = new Set([
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".deb",
  ".dll",
  ".exe",
  ".hta",
  ".jar",
  ".js",
  ".jse",
  ".lnk",
  ".msi",
  ".msp",
  ".ps1",
  ".reg",
  ".rpm",
  ".scr",
  ".sh",
  ".vb",
  ".vbe",
  ".vbs",
  ".wsf",
]);

function hasDangerousDoubleExtension(name) {
  const parts = String(name || "")
    .trim()
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return false;
  }

  return parts
    .slice(1, -1)
    .some((part) => DANGEROUS_CHAT_ATTACHMENT_EXTENSIONS.has(`.${part.toLowerCase()}`));
}

export function isAllowedChatAttachmentFile(file) {
  if (!(file instanceof File)) {
    return false;
  }

  const extension = getChatAttachmentExtension(file.name);
  return !DANGEROUS_CHAT_ATTACHMENT_EXTENSIONS.has(extension)
    && !hasDangerousDoubleExtension(file.name);
}

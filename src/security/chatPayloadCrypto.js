export async function prepareOutgoingTextPayload({ text }) {
  const normalizedText = String(text || "").trim();
  return {
    message: normalizedText,
    encryption: null,
    encryptionState: normalizedText ? "plaintext" : "empty",
  };
}

export async function readIncomingMessageText(messageItem) {
  const legacyEncryption = messageItem?.encryption || messageItem?.Encryption;
  if (legacyEncryption?.ciphertext || legacyEncryption?.Ciphertext) {
    return {
      text: "[Сообщение было зашифровано старым клиентским форматом и больше недоступно]",
      encryptionState: "legacy-client-encrypted",
    };
  }

  return {
    text: String(messageItem?.message || ""),
    encryptionState: "plaintext",
  };
}

export async function prepareOutgoingAttachmentPayload({ file }) {
  if (!(file instanceof Blob)) {
    throw new Error("Attachment blob is required.");
  }

  return {
    uploadBlob: file,
    uploadFileName: String(file.name || "attachment"),
    attachmentEncryption: null,
  };
}

import { API_URL } from "../config/runtime";
import { authFetch } from "./auth";

export async function uploadChatAttachment({ blob, fileName = "" }) {
  const uploadFile = blob instanceof File
    ? blob
    : new File([blob], fileName || "attachment.bin", { type: blob?.type || "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", uploadFile);

  const response = await authFetch(`${API_URL}/api/chat-files/upload`, {
    method: "POST",
    body: formData,
  });

  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText };
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || "Не удалось загрузить файл");
  }

  return data;
}

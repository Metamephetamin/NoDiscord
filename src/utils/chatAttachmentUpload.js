import { API_URL } from "../config/runtime";
import { authFetch, getStoredToken } from "./auth";

function uploadWithProgress({ formData, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_URL}/api/chat-files/upload`, true);
    request.responseType = "text";

    const token = getStoredToken();
    if (token) {
      request.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    request.upload.onprogress = (event) => {
      if (!onProgress) {
        return;
      }

      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
        return;
      }

      onProgress(0.5);
    };

    request.onload = () => {
      const rawText = typeof request.response === "string" ? request.response : String(request.responseText || "");
      let data = null;

      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = { message: rawText };
        }
      }

      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve(data);
        return;
      }

      reject(new Error(data?.message || "Не удалось загрузить файл"));
    };

    request.onerror = () => reject(new Error("Не удалось загрузить файл"));
    request.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));

    if (signal) {
      const abortHandler = () => request.abort();
      if (signal.aborted) {
        request.abort();
        return;
      }

      signal.addEventListener("abort", abortHandler, { once: true });
      request.addEventListener("loadend", () => signal.removeEventListener("abort", abortHandler), { once: true });
    }

    request.send(formData);
  });
}

export async function uploadChatAttachment({ blob, fileName = "", onProgress, signal }) {
  const uploadFile = blob instanceof File
    ? blob
    : new File([blob], fileName || "attachment.bin", { type: blob?.type || "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", uploadFile);

  if (typeof onProgress === "function" || signal) {
    return uploadWithProgress({ formData, onProgress, signal });
  }

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

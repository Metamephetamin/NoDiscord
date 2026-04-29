import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage } from "./auth";

export const COMPOSER_TRANSLATION_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "tr", label: "Türkçe" },
  { value: "ja", label: "日本語 (яп.)" },
  { value: "ko", label: "한국어 (кор.)" },
  { value: "zh-CN", label: "中文 (кит.)" },
  { value: "ar", label: "العربية (араб.)" },
];

export async function translateComposerText(text, targetLanguage) {
  const normalizedText = String(text || "").trim();
  const normalizedTargetLanguage = String(targetLanguage || "").trim() || "en";
  if (!normalizedText) {
    return {
      text: "",
      sourceLanguage: "auto",
      targetLanguage: normalizedTargetLanguage,
      provider: "empty",
    };
  }

  const response = await authFetch(`${API_BASE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: normalizedText,
      targetLanguage: normalizedTargetLanguage,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, payload, "Не удалось перевести текст."));
  }

  return {
    text: String(payload?.text || normalizedText).trim(),
    sourceLanguage: String(payload?.sourceLanguage || "auto").trim(),
    targetLanguage: String(payload?.targetLanguage || normalizedTargetLanguage).trim(),
    provider: String(payload?.provider || "server").trim(),
  };
}

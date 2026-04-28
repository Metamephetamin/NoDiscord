import { API_URL } from "../config/runtime";
import { authFetch } from "./auth";
import { autocorrectUserText } from "./textAutocorrect";
import { formatTypedMessageText, shouldAutoPunctuateTypedText } from "./textChatModel";
import { restoreRussianSpeechPunctuation } from "./voiceMessages";

export async function punctuateTextOnServer(rawText) {
  const normalizedText = String(rawText || "").trim();
  if (!normalizedText) {
    return "";
  }

  const response = await authFetch(`${API_URL}/api/speech/punctuate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: normalizedText }),
  });

  if (!response.ok) {
    throw new Error("Speech punctuation request failed.");
  }

  const payload = await response.json().catch(() => ({}));
  return {
    text: String(payload?.text || normalizedText).trim(),
    provider: String(payload?.provider || "server").trim(),
    usedModel: payload?.usedModel === true,
  };
}

export function formatServerPunctuationResult(result, fallbackText = "") {
  const normalizedResult = typeof result === "string"
    ? { text: result, usedModel: false }
    : result || {};
  const normalizedText = String(normalizedResult.text || fallbackText || "").trim();
  if (!normalizedText) {
    return "";
  }

  if (normalizedResult.usedModel === true) {
    return autocorrectUserText(normalizedText);
  }

  return autocorrectUserText(restoreRussianSpeechPunctuation(normalizedText, { finalize: true }));
}

export async function punctuateTypedMessageText(rawText) {
  const normalizedText = autocorrectUserText(String(rawText || "").trim());
  if (!shouldAutoPunctuateTypedText(normalizedText)) {
    return normalizedText;
  }

  try {
    const punctuationResult = await punctuateTextOnServer(normalizedText);
    return formatServerPunctuationResult(punctuationResult, normalizedText);
  } catch (error) {
    console.error("Typed message punctuation error:", error);
    return formatTypedMessageText(normalizedText);
  }
}

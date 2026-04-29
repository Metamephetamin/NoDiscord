import { API_URL } from "../config/runtime";
import { authFetch } from "./auth";
import { autocorrectUserText } from "./textAutocorrect";

const TYPED_PUNCTUATION_TIMEOUT_MS = 3500;

function shouldUseServerTypedPunctuation(text) {
  const normalizedText = String(text || "").trim();
  if (normalizedText.length < 8) {
    return false;
  }

  if (!/\p{Script=Cyrillic}/u.test(normalizedText)) {
    return false;
  }

  if (/https?:\/\/|www\.|```|^\s*[/>]|[\w.+-]+@[\w.-]+\.\w+/i.test(normalizedText)) {
    return false;
  }

  return normalizedText.split(/\s+/).filter(Boolean).length >= 3;
}

export async function punctuateTextOnServer(rawText, options = {}) {
  const normalizedText = String(rawText || "").trim();
  if (!normalizedText) {
    return "";
  }

  const response = await authFetch(`${API_URL}/api/speech/punctuate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: normalizedText }),
    signal: options.signal,
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

  return autocorrectUserText(normalizedText);
}

export async function punctuateTypedMessageText(rawText) {
  const normalizedText = autocorrectUserText(String(rawText || "").trim());
  if (!shouldUseServerTypedPunctuation(normalizedText)) {
    return normalizedText;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), TYPED_PUNCTUATION_TIMEOUT_MS)
    : 0;

  try {
    const result = await punctuateTextOnServer(normalizedText, {
      signal: controller?.signal,
    });
    return formatServerPunctuationResult(result, normalizedText);
  } catch {
    return normalizedText;
  } finally {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

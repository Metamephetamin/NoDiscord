import { API_URL } from "../config/runtime";
import { authFetch } from "./auth";
import { autocorrectUserText } from "./textAutocorrect";

const TYPED_PUNCTUATION_TIMEOUT_MS = 3500;
const COMPOSER_PUNCTUATION_TIMEOUT_MS = 8000;

function shouldUseServerTypedPunctuation(text) {
  const normalizedText = String(text || "").trim();
  if (normalizedText.length < 4) {
    return false;
  }

  if (!/\p{Script=Cyrillic}/u.test(normalizedText)) {
    return false;
  }

  if (/https?:\/\/|www\.|```|^\s*[/>]|[\w.+-]+@[\w.-]+\.\w+|@\w|#\w|:[A-Za-z0-9_+-]+:/i.test(normalizedText)) {
    return false;
  }

  const words = normalizedText.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return true;
  }

  if (words.length === 2) {
    return /^(?:как|что|где|когда|почему|зачем|если|ну|да|нет|можно|надо|нужно)$/iu.test(words[0])
      || /^(?:ли|что|если|когда|почему|зачем)$/iu.test(words[1]);
  }

  return false;
}

function normalizePunctuationSpacing(text) {
  return String(text || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?=[^\s.,;:!?])/g, (match, punctuation, offset, source) => {
      const previousChar = source[offset - 1] || "";
      const nextChar = source[offset + 1] || "";
      return (punctuation === "," || punctuation === ".") && /\d/.test(previousChar) && /\d/.test(nextChar)
        ? punctuation
        : `${punctuation} `;
    })
    .replace(/\s+([.!?\u2026])$/u, "$1")
    .trim();
}

function normalizeTextIdentity(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isUnsafePunctuationResult(resultText, fallbackText) {
  const normalizedResult = String(resultText || "").trim();
  const normalizedFallback = String(fallbackText || "").trim();
  if (!normalizedResult) {
    return true;
  }

  if (/\p{Script=Cyrillic}/u.test(normalizedFallback) && /^[?\s.,;:!]+$/u.test(normalizedResult)) {
    return true;
  }

  return normalizeTextIdentity(normalizedResult) !== normalizeTextIdentity(normalizedFallback);
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

  if (isUnsafePunctuationResult(normalizedText, fallbackText)) {
    return autocorrectUserText(normalizePunctuationSpacing(fallbackText));
  }

  return autocorrectUserText(normalizePunctuationSpacing(normalizedText));
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

export async function punctuateComposerText(rawText) {
  const normalizedText = autocorrectUserText(String(rawText || "").trim());
  if (!normalizedText) {
    return "";
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), COMPOSER_PUNCTUATION_TIMEOUT_MS)
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

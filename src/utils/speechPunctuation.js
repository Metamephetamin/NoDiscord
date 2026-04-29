import { API_URL } from "../config/runtime";
import { authFetch } from "./auth";
import { autocorrectUserText } from "./textAutocorrect";

const TYPED_PUNCTUATION_TIMEOUT_MS = 3500;
const CYRILLIC_WORD = "[А-Яа-яЁё-]+";
const CLAUSE_LEADS = "я|мы|ты|вы|он|она|они|это|мне|тебе|нам|вам|ему|ей|им|меня|тебя|его|ее|её|их";
const QUESTION_START_RE = /^(кто|что|где|куда|откуда|когда|почему|зачем|как|какой|какая|какое|какие|чей|чья|чьё|чьи|сколько|разве|неужели|можно ли|нужно ли|стоит ли)\b/i;
const HAS_TERMINAL_PUNCTUATION_RE = /[.!?…]$/;
const SAFE_TYPED_PUNCTUATION_SKIP_RE = /https?:\/\/|www\.|```|^\s*[/>]|[\w.+-]+@[\w.-]+\.\w+|@\w|#\w|:[A-Za-z0-9_+-]+:/i;

const INTRODUCTORY_PHRASES = [
  "честно говоря",
  "если честно",
  "по правде говоря",
  "к счастью",
  "к сожалению",
  "как ни странно",
  "как правило",
  "может быть",
  "скорее всего",
  "вообще-то",
  "в общем",
  "по сути",
  "по-моему",
  "наверное",
  "возможно",
  "кажется",
  "пожалуй",
  "конечно",
  "кстати",
  "например",
  "короче",
  "смотри",
  "слушай",
  "ну",
];

const COMPLEX_TYPED_RULES = [
  [/\b(я думаю|я считаю|мне кажется|дело в том)\s+что\b/giu, "$1, что"],
  [/\b(не знаю)\s+(похоже)\b/giu, "$1, $2"],
  [/\b(да|нет)\s+(конечно|наверное|пожалуй|думаю)\b/giu, "$1, $2"],
  [/\b(пожалуйста)\s+(если|когда|передай|напиши|посмотри|скажи|проверь)\b/giu, "$1, $2"],
  [/\b(не только)\s+(.+?)\s+(но и)\b/giu, "$1 $2, $3"],
  [/\b(как)\s+(.+?)\s+(так и)\b/giu, "$1 $2, $3"],
  [/\b(не столько)\s+(.+?)\s+(сколько)\b/giu, "$1 $2, $3"],
];

function shouldUseLocalTypedPunctuation(text) {
  const normalizedText = String(text || "").trim();
  return normalizedText.length >= 4
    && /\p{Script=Cyrillic}/u.test(normalizedText)
    && !SAFE_TYPED_PUNCTUATION_SKIP_RE.test(normalizedText);
}

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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    .replace(/\s+([.!?…])$/u, "$1")
    .trim();
}

function insertIntroductoryCommas(text) {
  return INTRODUCTORY_PHRASES.reduce((currentText, phrase) => {
    const escapedPhrase = escapeRegex(phrase);
    const openingRegex = new RegExp(`(^|[.!?…]\\s+)(${escapedPhrase})\\s+`, "giu");
    const inlineRegex = new RegExp(`\\s+(${escapedPhrase})\\s+`, "giu");
    return currentText
      .replace(openingRegex, (match, prefix, foundPhrase) => `${prefix}${foundPhrase}, `)
      .replace(inlineRegex, (match, foundPhrase, offset, source) => {
        const previousChar = source[offset - 1] || "";
        const nextIndex = offset + match.length;
        const nextChar = source[nextIndex] || "";
        const prefix = previousChar === "," ? " " : ", ";
        const suffix = nextChar === "," ? " " : ", ";
        return `${prefix}${foundPhrase}${suffix}`;
      });
  }, text);
}

function insertLeadingSubordinateComma(text) {
  const clauseLead = `(?:${CLAUSE_LEADS})`;
  const subordinate = "(если|когда|хотя|пока|раз|поскольку|как только|едва)";
  return String(text || "").replace(
    new RegExp(`^(${subordinate}\\b(?:\\s+${CYRILLIC_WORD}){1,8})\\s+(${clauseLead}\\b)`, "iu"),
    "$1, $3"
  );
}

function insertInitialAddressComma(text) {
  return String(text || "").replace(
    new RegExp(`^(${CYRILLIC_WORD})\\s+(ты|вы|посмотри|смотри|слушай|скажи|напиши|ответь|подскажи|помоги|проверь|кинь|глянь|где|как|что|пожалуйста)\\b`, "iu"),
    "$1, $2"
  );
}

function applyLocalTypedPunctuation(text, { inferTerminalPunctuation = true } = {}) {
  if (!shouldUseLocalTypedPunctuation(text)) {
    return autocorrectUserText(String(text || "").trim());
  }

  let nextText = autocorrectUserText(String(text || "").trim());

  COMPLEX_TYPED_RULES.forEach(([regex, replacement]) => {
    nextText = nextText.replace(regex, replacement);
  });

  nextText = nextText
    .replace(/(?<![,.;:!?])\s+(а|но|однако|зато|хотя|причем|причём|притом|то есть)\s+/giu, ", $1 ")
    .replace(/(?<![,.;:!?])\s+(если|когда|пока|хотя|чтобы|будто|словно|так как|потому что|так что|как только)\s+/giu, ", $1 ")
    .replace(/(?<![,.;:!?])\s+(что|чем|где|куда|откуда|почему|зачем|который|которая|которое|которые|которого|которой|которым|которыми)\s+/giu, ", $1 ")
    .replace(new RegExp(`(?<![,.;:!?])\\s+(и|или)\\s+(${CLAUSE_LEADS})\\b`, "giu"), ", $1 $2");

  nextText = insertIntroductoryCommas(nextText);
  nextText = insertLeadingSubordinateComma(nextText);
  nextText = insertInitialAddressComma(nextText);
  nextText = normalizePunctuationSpacing(nextText);
  nextText = autocorrectUserText(nextText);

  if (!inferTerminalPunctuation || HAS_TERMINAL_PUNCTUATION_RE.test(nextText)) {
    return nextText;
  }

  return QUESTION_START_RE.test(nextText) ? `${nextText}?` : `${nextText}.`;
}

function countCommas(text) {
  return (String(text || "").match(/,/g) || []).length;
}

function shouldApplyLocalFallback(serverText, sourceText, localFallbackText) {
  const normalizedServerText = String(serverText || "").trim();
  const normalizedSourceText = String(sourceText || "").trim();
  const normalizedLocalFallbackText = String(localFallbackText || "").trim();
  if (!shouldUseLocalTypedPunctuation(normalizedSourceText)) {
    return false;
  }

  return normalizedServerText === normalizedSourceText
    || countCommas(normalizedLocalFallbackText) > countCommas(normalizedServerText)
    || (!/[,.!?…]/u.test(normalizedServerText) && normalizedSourceText.split(/\s+/).filter(Boolean).length >= 3);
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
  if (!shouldUseLocalTypedPunctuation(normalizedText)) {
    return normalizedText;
  }

  const localFallbackText = applyLocalTypedPunctuation(normalizedText);
  if (!shouldUseServerTypedPunctuation(normalizedText)) {
    return localFallbackText;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), TYPED_PUNCTUATION_TIMEOUT_MS)
    : 0;

  try {
    const result = await punctuateTextOnServer(normalizedText, {
      signal: controller?.signal,
    });
    const serverText = formatServerPunctuationResult(result, normalizedText);
    return shouldApplyLocalFallback(serverText, normalizedText, localFallbackText) ? localFallbackText : serverText;
  } catch {
    return localFallbackText;
  } finally {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

export const MAX_VOICE_MESSAGE_DURATION_MS = 10 * 60 * 1000;
export const VOICE_WAVEFORM_BAR_COUNT = 42;

const VOICE_RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
];

const QUESTION_START_REGEX = /^(кто|что|где|когда|почему|зачем|как|какой|какая|какие|сколько|разве|неужели|ли)\b/i;
const QUESTION_END_REGEX = /\b(ли|почему|зачем|когда|где|как|что|кто)\b/i;
const EXCLAMATION_START_REGEX = /^(привет|спасибо|пожалуйста|срочно|осторожно|внимание)\b/i;

const SPOKEN_PUNCTUATION_RULES = [
  { regex: /\s+восклицательный знак\s+/gi, replacement: "! " },
  { regex: /\s+вопросительный знак\s+/gi, replacement: "? " },
  { regex: /\s+точка с запятой\s+/gi, replacement: "; " },
  { regex: /\s+двоеточие\s+/gi, replacement: ": " },
  { regex: /\s+многоточие\s+/gi, replacement: "… " },
  { regex: /\s+запятая\s+/gi, replacement: ", " },
  { regex: /\s+точка\s+/gi, replacement: ". " },
  { regex: /\s+(новая строка|новый абзац|абзац)\s+/gi, replacement: ". " },
];

const COMMA_BEFORE_RULES = [
  /\s+(а|но|однако|зато)\s+/gi,
  /\s+(если|когда|хотя|чтобы|будто|словно|так как|потому что|несмотря на то что|так что)\s+/gi,
  /\s+(что|чем|где|куда|откуда|который|которая|которое|которые)\s+/gi,
  /\s+(например|конечно|кстати|наверное|возможно|может быть|кажется|по-моему|по сути|во-первых|во-вторых|с одной стороны|с другой стороны)\s+/gi,
];

const INTRODUCTORY_PHRASES_REGEX = /(^|[.!?]\s+)(ну|в общем|короче|слушай|смотри|кстати|например)\s+/gi;

const COMPLEX_PHRASE_REPLACEMENTS = [
  [/\b(я думаю|я считаю|мне кажется|по-моему)\s+что\b/gi, "$1, что"],
  [/\b(дело в том)\s+что\b/gi, "$1, что"],
  [/\b(да|нет)\s+(конечно|наверное|пожалуй|думаю)\b/gi, "$1, $2"],
  [/\b(пожалуйста)\s+(если|когда|передай|напиши|посмотри|скажи)\b/gi, "$1, $2"],
  [/\b(привет|здравствуйте|добрый день|добрый вечер)\s+([А-ЯЁA-Z][а-яёa-z-]+)/g, "$1, $2"],
];

const INTRODUCTORY_WORDS = [
  "конечно",
  "наверное",
  "возможно",
  "кажется",
  "кстати",
  "например",
  "во-первых",
  "во-вторых",
  "по-моему",
  "по сути",
  "как правило",
];

const GERUND_SUFFIX_REGEX = /(в|вши|вшись|ши|я|ясь|учи|ючи|аясь|яясь|ившись|ыв|ывши|ывшись)$/i;
const CLAUSE_START_REGEX = /^(я|мы|ты|вы|он|она|оно|они|это|тот|та|те|кто|все|всё|мне|нам|ему|ей|им|меня|тебя|его|её|их|[а-яё-]+(?:л|ла|ло|ли|ет|ют|ут|ит|ат|ят|ем|им|ешь|ишь|ете|ите|ался|алась|алось|ались|ется|ются|утся|ится|ятся))$/i;

function applySpokenPunctuation(text) {
  let normalizedText = ` ${String(text || "").trim()} `;

  SPOKEN_PUNCTUATION_RULES.forEach(({ regex, replacement }) => {
    normalizedText = normalizedText.replace(regex, replacement);
  });

  return normalizedText.trim();
}

function capitalizeSentences(text) {
  return String(text || "")
    .split(/([.!?…]\s+)/)
    .map((chunk) => {
      if (!chunk || /^[.!?…]\s*$/.test(chunk)) {
        return chunk;
      }

      return chunk.charAt(0).toUpperCase() + chunk.slice(1);
    })
    .join("")
    .trim();
}

function insertIntroductoryWordCommas(text) {
  let normalizedText = text;

  INTRODUCTORY_WORDS.forEach((word) => {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[,.!?]\\s+|\\s+)(${escapedWord})(\\s+)`, "gi");
    normalizedText = normalizedText.replace(regex, (match, prefix, foundWord, spacing) => {
      if (String(prefix).endsWith(",")) {
        return `${prefix}${foundWord}${spacing}`;
      }

      return `${prefix}${foundWord}, `;
    });
  });

  return normalizedText;
}

function insertInitialGerundComma(text) {
  return String(text || "").replace(
    /(^|[.!?…]\s+)([А-ЯЁа-яё-]+(?:\s+[А-ЯЁа-яё-]+){0,5})\s+([А-ЯЁа-яё-]+)/g,
    (match, prefix, phrase, nextWord) => {
      const words = String(phrase || "").split(/\s+/).filter(Boolean);
      const firstWord = words[0] || "";
      if (!GERUND_SUFFIX_REGEX.test(firstWord)) {
        return match;
      }

      if (!CLAUSE_START_REGEX.test(String(nextWord || ""))) {
        return match;
      }

      if (String(phrase).includes(",")) {
        return match;
      }

      return `${prefix}${phrase}, ${nextWord}`;
    }
  );
}

function normalizeSpacing(text) {
  return String(text || "")
    .replace(/\s+([,.!?;:…])/g, "$1")
    .replace(/([,.!?;:…])(?=[^\s,.!?;:…])/g, "$1 ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ", ")
    .replace(/([.!?…])\s*,/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getSupportedVoiceRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return VOICE_RECORDING_MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

export function getVoiceRecordingExtension(mimeType) {
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  if (normalizedMimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

export function formatVoiceMessageDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildVoiceWaveform(levelSamples = [], barCount = VOICE_WAVEFORM_BAR_COUNT) {
  const normalizedSamples = Array.isArray(levelSamples)
    ? levelSamples
      .map((sample) => Math.max(0, Math.min(1, Number(sample) || 0)))
      .filter((sample) => Number.isFinite(sample))
    : [];

  if (!normalizedSamples.length) {
    return Array.from({ length: barCount }, (_, index) => 0.22 + ((index % 5) / 20));
  }

  const chunkSize = Math.max(1, Math.floor(normalizedSamples.length / barCount));
  const bars = [];

  for (let index = 0; index < barCount; index += 1) {
    const chunk = normalizedSamples.slice(index * chunkSize, (index + 1) * chunkSize);
    const average = chunk.length
      ? chunk.reduce((sum, sample) => sum + sample, 0) / chunk.length
      : normalizedSamples[normalizedSamples.length - 1];
    bars.push(Math.max(0.14, Math.min(1, average)));
  }

  return bars;
}

export function normalizeVoiceMessageMetadata(rawVoiceMessage) {
  if (!rawVoiceMessage || typeof rawVoiceMessage !== "object") {
    return null;
  }

  const durationMs = Math.max(0, Number(rawVoiceMessage.durationMs || rawVoiceMessage.DurationMs || 0) || 0);
  const mimeType = String(rawVoiceMessage.mimeType || rawVoiceMessage.MimeType || "").trim();
  const fileName = String(rawVoiceMessage.fileName || rawVoiceMessage.FileName || "").trim();
  const waveform = buildVoiceWaveform(rawVoiceMessage.waveform || rawVoiceMessage.Waveform || []);

  if (!durationMs && !mimeType && !fileName) {
    return null;
  }

  return {
    durationMs,
    mimeType,
    fileName,
    waveform,
  };
}

export function restoreRussianSpeechPunctuation(text, { finalize = true } = {}) {
  let normalizedText = applySpokenPunctuation(text);

  if (!normalizedText) {
    return "";
  }

  COMMA_BEFORE_RULES.forEach((regex) => {
    normalizedText = normalizedText.replace(regex, ", $1 ");
  });

  normalizedText = normalizedText.replace(INTRODUCTORY_PHRASES_REGEX, (match, prefix, phrase) => `${prefix}${phrase}, `);

  COMPLEX_PHRASE_REPLACEMENTS.forEach(([regex, replacement]) => {
    normalizedText = normalizedText.replace(regex, replacement);
  });

  normalizedText = insertIntroductoryWordCommas(normalizedText);
  normalizedText = insertInitialGerundComma(normalizedText);
  normalizedText = normalizeSpacing(normalizedText);
  normalizedText = capitalizeSentences(normalizedText);

  if (!finalize) {
    return normalizedText;
  }

  if (/[.!?…]$/.test(normalizedText)) {
    return normalizedText;
  }

  if (QUESTION_START_REGEX.test(normalizedText) || QUESTION_END_REGEX.test(normalizedText)) {
    return `${normalizedText}?`;
  }

  if (EXCLAMATION_START_REGEX.test(normalizedText)) {
    return `${normalizedText}!`;
  }

  return `${normalizedText}.`;
}

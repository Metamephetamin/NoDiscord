import { autocorrectUserText } from "./textAutocorrect";

export const MAX_VOICE_MESSAGE_DURATION_MS = 10 * 60 * 1000;
export const VOICE_WAVEFORM_BAR_COUNT = 42;

const VOICE_RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
];

const QUESTION_START_REGEX = /^(кто|что|где|куда|откуда|когда|почему|зачем|как|какой|какая|какое|какие|чей|чья|чьё|чьи|сколько|разве|неужели|можно ли|нужно ли|стоит ли|ли)\b/i;
const QUESTION_END_REGEX = /\bли\b|(?:,\s*)?(правда|верно)\s*$/i;
const QUESTION_TAIL_REGEX = /(кто|что|где|куда|откуда|когда|почему|зачем|как|чего)\s*$/i;
const COMPARATIVE_PAIR_REGEX = /\bкак\b.+\bтак и\b/i;
const EXCLAMATION_START_REGEX = /^(привет|спасибо|пожалуйста|срочно|осторожно|внимание|ура|класс|супер|отлично)\b/i;

const SPOKEN_PUNCTUATION_RULES = [
  { regex: /\s+(знак восклицания|восклицание)\s+/gi, replacement: "! " },
  { regex: /\s+восклицательный знак\s+/gi, replacement: "! " },
  { regex: /\s+знак вопроса\s+/gi, replacement: "? " },
  { regex: /\s+вопросительный знак\s+/gi, replacement: "? " },
  { regex: /\s+точка с запятой\s+/gi, replacement: "; " },
  { regex: /\s+двоеточие\s+/gi, replacement: ": " },
  { regex: /\s+многоточие\s+/gi, replacement: "… " },
  { regex: /\s+(открой скобку|открыть скобку)\s+/gi, replacement: " (" },
  { regex: /\s+(закрой скобку|закрыть скобку)\s+/gi, replacement: ") " },
  { regex: /\s+(тире|длинное тире)\s+/gi, replacement: " - " },
  { regex: /\s+дефис\s+/gi, replacement: "-" },
  { regex: /\s+запятая\s+/gi, replacement: ", " },
  { regex: /\s+точка\s+/gi, replacement: ". " },
  { regex: /\s+(новая строка|перенос строки|новый абзац|абзац)\s+/gi, replacement: ". " },
];

const COMMA_BEFORE_RULES = [
  /\s+(а|но|однако|зато|либо|хотя|причем|причём|притом|то есть)\s+/gi,
  /\s+(если|когда|пока|хотя|чтобы|будто|словно|как будто|так как|потому что|из-за того что|для того чтобы|перед тем как|после того как|несмотря на то что|так что|раз уж|едва|как только)\s+/gi,
  /\s+(что|чем|где|куда|откуда|почему|зачем|который|которая|которое|которые|которого|которой|которым|которыми)\s+/gi,
  /\s+(например|конечно|кстати|наверное|возможно|может быть|кажется|вероятно|по-моему|по сути|во-первых|во-вторых|в-третьих|с одной стороны|с другой стороны|как правило|скорее всего|безусловно|разумеется|к счастью|к сожалению|по идее|по правде|честно говоря|грубо говоря|мягко говоря|собственно|значит|видимо)\s+/gi,
];

const INTRODUCTORY_PHRASES_REGEX = /(^|[.!?]\s+)(ну|в общем|короче|слушай|смотри|кстати|например|честно говоря|по правде|по идее|по сути|в принципе|кажется|похоже|видимо|значит)\s+/gi;
const SENTENCE_OPENING_INTERJECTION_REGEX = /(^|[.!?…]\s+)(блин|бля|блядь|блинчик|капец|жесть|господи|чёрт|черт|ё-моё|ё мое|ёмаё|елки-палки|ёлки-палки|мда|ух|эх)\s+/gi;
const INLINE_INTERJECTION_REGEX = /\s+(блин|бля|блядь|капец|жесть|господи|чёрт|черт|ё-моё|ё мое|ёмаё|елки-палки|ёлки-палки|мда)\s+/gi;

const COMPLEX_PHRASE_REPLACEMENTS = [
  [/\b(я думаю|я считаю|я уверен|я надеюсь|мне кажется|по-моему|скорее всего|вероятно|кажется|похоже|видимо|очевидно)\s+что\b/gi, "$1, что"],
  [/\b(дело в том|проблема в том|суть в том|прикол в том|факт в том)\s+что\b/gi, "$1, что"],
  [/\b(главное|важно|хорошо|плохо|странно|понятно|ясно|обидно|приятно|жаль|видно|слышно|заметно)\s+что\b/gi, "$1, что"],
  [/\b(значит|получается|выходит)\s+что\b/gi, "$1, что"],
  [/\b(да|нет)\s+(конечно|наверное|пожалуй|думаю)\b/gi, "$1, $2"],
  [/\b(пожалуйста)\s+(если|когда|передай|напиши|посмотри|скажи|проверь|глянь|помоги|скинь|кинь)\b/gi, "$1, $2"],
  [/\b(не знаю)\s+(похоже)\b/gi, "$1, $2"],
  [/\b(ладно|окей|хорошо)\s+(если|когда|давай|попробуй|проверь|посмотри|напиши|скинь|кинь)\b/gi, "$1, $2"],
  [/\b(давай|можешь|можете)\s+(если|когда|как только)\b/gi, "$1, $2"],
  [/\b(не только)\s+(.+?)\s+(но и)\b/gi, "$1 $2, $3"],
  [/\b(как)\s+(.+?)\s+(так и)\b/gi, "$1 $2, $3"],
  [/\b(не столько)\s+(.+?)\s+(сколько)\b/gi, "$1 $2, $3"],
  [/\b(с одной стороны)\s+(.+?)\s+(с другой стороны)\b/gi, "$1, $2, $3"],
  [/\b(с одной стороны)\s+/gi, "$1, "],
  [/\b(с другой стороны)\s+/gi, "$1, "],
  [/\b(во-первых|во-вторых|в-третьих)\s+/gi, "$1, "],
  [/\b(привет|здравствуйте|добрый день|добрый вечер)\s+([А-ЯЁA-Z][а-яёa-z-]+)/g, "$1, $2"],
];

const INTRODUCTORY_WORDS = [
  "конечно",
  "наверное",
  "возможно",
  "вероятно",
  "кажется",
  "кстати",
  "например",
  "во-первых",
  "во-вторых",
  "в-третьих",
  "по-моему",
  "по сути",
  "по идее",
  "по правде",
  "как правило",
  "скорее всего",
  "безусловно",
  "разумеется",
  "вообще-то",
  "собственно",
  "значит",
  "видимо",
  "очевидно",
  "честно говоря",
  "грубо говоря",
  "мягко говоря",
  "к счастью",
  "к сожалению",
  "похоже",
];

const GERUND_SUFFIX_REGEX = /(в|вши|вшись|ши|я|ясь|учи|ючи|аясь|яясь|ившись|ыв|ывши|ывшись)$/i;
const CLAUSE_START_REGEX = /^(я|мы|ты|вы|он|она|оно|они|это|тот|та|те|кто|все|всё|мне|нам|ему|ей|им|меня|тебя|его|её|их|[а-яё-]+(?:л|ла|ло|ли|ет|ют|ут|ит|ат|ят|ем|им|ешь|ишь|ете|ите|ался|алась|алось|ались|ется|ются|утся|ится|ятся))$/i;
const ADDRESS_LEAD_STOP_WORDS = new Set([
  "я", "мы", "ты", "вы", "он", "она", "оно", "они", "это", "кто", "что", "где", "когда", "зачем",
  "почему", "как", "если", "пока", "хотя", "чтобы", "будто", "словно", "так", "просто", "ладно", "давай",
  "сегодня", "завтра", "вчера", "сейчас", "потом", "вообще", "кстати", "например", "ну", "блин", "капец",
  "жесть", "господи", "чёрт", "черт", "привет", "здравствуйте", "добрый", "доброе",
]);

const SENTENCE_START_SUBORDINATE_REGEX = /(^|[.!?…]\s+)((?:если|когда|пока|хотя|раз|раз уж|как только|перед тем как|после того как|потому что|так как|несмотря на то что|для того чтобы|чтобы)\s+[А-ЯЁа-яё0-9'"-]+(?:\s+[А-ЯЁа-яё0-9'"-]+){0,7})\s+([А-ЯЁа-яё-]+)/gi;
const ADDRESS_FOLLOWER_TOKENS = new Set([
  "ты", "вы", "посмотри", "смотри", "слушай", "скажи", "напиши", "ответь", "подскажи", "подойди",
  "глянь", "зацени", "пожалуйста", "помоги", "давай", "иди", "проверь", "кинь", "пришли", "можешь",
  "можете", "где", "как", "что", "чего", "когда", "зачем", "почему", "нужно", "надо", "будешь",
  "будете", "помнишь", "знаешь",
]);

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
    normalizedText = normalizedText.replace(regex, (match, prefix, foundWord, spacing, offset, source) => {
      if (String(prefix).endsWith(",")) {
        return `${prefix}${foundWord}${spacing}`;
      }

      if (/^\s+$/.test(prefix)) {
        const previousText = String(source || "").slice(0, offset).trimEnd();
        const previousChar = previousText.charAt(previousText.length - 1);
        if (previousChar && !/[.!?…,(;-]/.test(previousChar)) {
          return `${prefix}, ${foundWord}, `;
        }
      }

      return `${prefix}${foundWord}, `;
    });
  });

  return normalizedText;
}

function insertSentenceStartSubordinateComma(text) {
  return String(text || "").replace(SENTENCE_START_SUBORDINATE_REGEX, (match, prefix, clause, nextWord) => {
    const normalizedClause = String(clause || "").trim();
    const normalizedNextWord = String(nextWord || "").trim();
    if (!normalizedClause || !normalizedNextWord || String(normalizedClause).includes(",")) {
      return match;
    }

    if (!CLAUSE_START_REGEX.test(normalizedNextWord)) {
      return match;
    }

    return `${prefix}${normalizedClause}, ${normalizedNextWord}`;
  });
}

function looksLikeFiniteVerb(token) {
  const normalizedToken = String(token || "").trim().replace(/^[,.;:!?…"'`]+|[,.;:!?…"'`]+$/g, "");
  return /(?:л|ла|ло|ли|ет|ют|ут|ит|ат|ят|ем|им|ешь|ишь|ете|ите|ался|алась|алось|ались|ется|ются|утся|ится|ятся|будет|будут|был|была|было|были|можно|нужно|стоит|получится|выйдет|лся|лась|лось|лись)$/i.test(normalizedToken);
}

function insertSentenceOpeningAddressComma(text) {
  return String(text || "").replace(
    /(^|[.!?…]\s+)([А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z0-9_-]{1,31})\s+([А-ЯЁа-яёA-Za-z-]+)/g,
    (match, prefix, candidate, follower) => {
      const normalizedCandidate = String(candidate || "").trim();
      const normalizedFollower = String(follower || "").trim().toLowerCase();
      if (
        !normalizedCandidate
        || !normalizedFollower
        || ADDRESS_LEAD_STOP_WORDS.has(normalizedCandidate.toLowerCase())
        || !ADDRESS_FOLLOWER_TOKENS.has(normalizedFollower)
        || looksLikeFiniteVerb(normalizedCandidate)
      ) {
        return match;
      }

      return `${prefix}${normalizedCandidate}, ${follower}`;
    }
  );
}

function insertInlineInterjectionCommas(text) {
  return String(text || "").replace(INLINE_INTERJECTION_REGEX, (match, phrase) => `, ${String(phrase || "").trim()}, `);
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

function shouldEndWithQuestionMark(text) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return false;
  }

  if (COMPARATIVE_PAIR_REGEX.test(normalizedText)) {
    return false;
  }

  return QUESTION_START_REGEX.test(normalizedText)
    || QUESTION_END_REGEX.test(normalizedText)
    || QUESTION_TAIL_REGEX.test(normalizedText);
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
  let normalizedText = autocorrectUserText(applySpokenPunctuation(text), { capitalize: false });

  if (!normalizedText) {
    return "";
  }

  COMMA_BEFORE_RULES.forEach((regex) => {
    normalizedText = normalizedText.replace(regex, ", $1 ");
  });

  normalizedText = normalizedText.replace(SENTENCE_OPENING_INTERJECTION_REGEX, (match, prefix, phrase) => `${prefix}${phrase}, `);
  normalizedText = normalizedText.replace(INTRODUCTORY_PHRASES_REGEX, (match, prefix, phrase) => `${prefix}${phrase}, `);

  COMPLEX_PHRASE_REPLACEMENTS.forEach(([regex, replacement]) => {
    normalizedText = normalizedText.replace(regex, replacement);
  });

  normalizedText = insertSentenceOpeningAddressComma(normalizedText);
  normalizedText = insertInlineInterjectionCommas(normalizedText);
  normalizedText = insertIntroductoryWordCommas(normalizedText);
  normalizedText = insertInitialGerundComma(normalizedText);
  normalizedText = insertSentenceStartSubordinateComma(normalizedText);
  normalizedText = normalizeSpacing(normalizedText);
  normalizedText = autocorrectUserText(normalizedText, { capitalize: false });
  normalizedText = capitalizeSentences(normalizedText);

  if (!finalize) {
    return normalizedText;
  }

  if (/[.!?…]$/.test(normalizedText)) {
    return normalizedText;
  }

  if (shouldEndWithQuestionMark(normalizedText)) {
    return `${normalizedText}?`;
  }

  if (EXCLAMATION_START_REGEX.test(normalizedText)) {
    return `${normalizedText}!`;
  }

  return `${normalizedText}.`;
}

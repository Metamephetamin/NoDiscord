const PROTECTED_TOKEN_PATTERN =
  /(```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|@[A-Za-zА-Яа-яЁё0-9_.-]+|#[A-Za-zА-Яа-яЁё0-9_.-]+|:[A-Za-z0-9_+-]+:)/giu;

const WORD_REPLACEMENTS = new Map([
  ["отображаються", "отображаются"],
  ["отображаеться", "отображается"],
  ["отображатся", "отображаться"],
  ["сообшение", "сообщение"],
  ["сообшения", "сообщения"],
  ["сообщщение", "сообщение"],
  ["сообщщения", "сообщения"],
  ["ссобщение", "сообщение"],
  ["ссобщения", "сообщения"],
  ["собешедник", "собеседник"],
  ["собеседнк", "собеседник"],
  ["настройик", "настройки"],
  ["настройкки", "настройки"],
  ["клавиаутра", "клавиатура"],
  ["обясни", "объясни"],
  ["обяснение", "объяснение"],
  ["подезд", "подъезд"],
  ["вобщем", "в общем"],
  ["вообщем", "в общем"],
  ["потомучто", "потому что"],
  ["потому-что", "потому что"],
  ["пожалуйсто", "пожалуйста"],
  ["пожалуста", "пожалуйста"],
  ["спосибо", "спасибо"],
  ["счас", "сейчас"],
  ["щас", "сейчас"],
  ["немогу", "не могу"],
  ["зделать", "сделать"],
  ["зделал", "сделал"],
  ["зделаю", "сделаю"],
  ["сдесь", "здесь"],
  ["всмысле", "в смысле"],
  ["всмылсе", "в смысле"],
  ["кароче", "короче"],
  ["короч", "короче"],
  ["чтоли", "что ли"],
  ["впринципе", "в принципе"],
  ["почемуто", "почему-то"],
  ["какойто", "какой-то"],
  ["какаято", "какая-то"],
  ["какоето", "какое-то"],
  ["какието", "какие-то"],
  ["чтото", "что-то"],
  ["кудато", "куда-то"],
  ["гдето", "где-то"],
  ["когдато", "когда-то"],
  ["зачемто", "зачем-то"],
  ["почемут", "почему-то"],
  ["незнаю", "не знаю"],
  ["незнаеш", "не знаешь"],
  ["незнаешь", "не знаешь"],
  ["ниразу", "ни разу"],
  ["будующее", "будущее"],
  ["следущий", "следующий"],
  ["следущая", "следующая"],
  ["следущее", "следующее"],
  ["следущие", "следующие"],
  ["вообщето", "вообще-то"],
  ["изза", "из-за"],
  ["вообще то", "вообще-то"],
  ["попробуйти", "попробуйте"],
  ["проверьти", "проверьте"],
  ["исправьти", "исправьте"],
  ["посмотрите", "посмотрите"],
]);

const PHRASE_REPLACEMENTS = [
  [/(^|[^\p{L}\p{N}_])как[-\s]+будто(?=$|[^\p{L}\p{N}_])/giu, "$1как будто"],
  [/(^|[^\p{L}\p{N}_])вообще\s+то(?=$|[^\p{L}\p{N}_])/giu, "$1вообще-то"],
  [/(^|[^\p{L}\p{N}_])из\s+за(?=$|[^\p{L}\p{N}_])/giu, "$1из-за"],
  [/(^|[^\p{L}\p{N}_])из\s+под(?=$|[^\p{L}\p{N}_])/giu, "$1из-под"],
];

const LAYOUT_REPLACEMENTS = new Map([
  ["ghbdtn", "привет"],
  ["ghbdtnbr", "приветик"],
  ["rfr", "как"],
  ["ltkf", "дела"],
  ["cgjcb,j", "спасибо"],
  ["gj;fkeqcnf", "пожалуйста"],
  ["руддщ", "hello"],
  ["цщкдв", "world"],
]);

function protectTextParts(text) {
  const protectedParts = [];
  const protectedText = String(text || "").replace(PROTECTED_TOKEN_PATTERN, (match) => {
    const token = `\uE000${protectedParts.length}\uE001`;
    protectedParts.push(match);
    return token;
  });

  return { protectedText, protectedParts };
}

function restoreTextParts(text, protectedParts) {
  return String(text || "").replace(/\uE000(\d+)\uE001/g, (match, index) => protectedParts[Number(index)] ?? match);
}

function preserveCase(source, replacement) {
  const rawSource = String(source || "");
  const rawReplacement = String(replacement || "");
  if (!rawSource || !rawReplacement) {
    return rawReplacement;
  }

  if (rawSource === rawSource.toUpperCase() && /[A-ZА-ЯЁ]/.test(rawSource)) {
    return rawReplacement.toUpperCase();
  }

  const firstChar = rawSource[0];
  if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return `${rawReplacement.charAt(0).toUpperCase()}${rawReplacement.slice(1)}`;
  }

  return rawReplacement;
}

function applyWordReplacements(text) {
  let nextText = String(text || "");
  PHRASE_REPLACEMENTS.forEach(([regex, replacement]) => {
    nextText = nextText.replace(regex, replacement);
  });

  return nextText.replace(/[A-Za-zА-Яа-яЁё]+(?:-[A-Za-zА-Яа-яЁё]+)?/g, (word) => {
    const normalizedWord = word.toLowerCase();
    const replacement = WORD_REPLACEMENTS.get(normalizedWord) || LAYOUT_REPLACEMENTS.get(normalizedWord);
    return replacement ? preserveCase(word, replacement) : word;
  });
}

function normalizeRepeatedLetters(text) {
  return String(text || "")
    .replace(/([А-Яа-яЁёA-Za-z])\1{3,}/g, "$1$1")
    .replace(/\b(приве)е+т\b/giu, "$1т")
    .replace(/\b(спаси)и+бо\b/giu, "$1бо")
    .replace(/\b(пожа)а+луйста\b/giu, "$1луйста");
}

function normalizeSpacingAndPunctuation(text) {
  return String(text || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?=[^\s.,;:!?])/g, (match, punctuation, offset, source) => {
      const previousChar = source[offset - 1] || "";
      const nextChar = source[offset + 1] || "";
      if ((punctuation === "," || punctuation === ".") && /\d/.test(previousChar) && /\d/.test(nextChar)) {
        return punctuation;
      }

      return `${punctuation} `;
    })
    .replace(/([!?]){4,}/g, "$1$1$1")
    .replace(/\.{4,}/g, "...")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function capitalizeSentences(text) {
  return String(text || "").replace(/(^|[.!?]\s+)([a-zа-яё])/giu, (match, prefix, letter) => (
    `${prefix}${letter.toUpperCase()}`
  ));
}

function normalizeAccidentalCapsLock(text) {
  const rawText = String(text || "");
  const letters = rawText.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if (letters.length < 8) {
    return rawText;
  }

  const upperLetters = letters.filter((letter) => letter === letter.toUpperCase() && letter !== letter.toLowerCase());
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;
  const looksExpressive = /[!?]{2,}/.test(rawText);
  if (wordCount < 2 || looksExpressive || upperLetters.length / letters.length < 0.88) {
    return rawText;
  }

  return capitalizeSentences(rawText.toLowerCase());
}

function shouldSkipAutocorrect(text) {
  const normalizedText = String(text || "").trim();
  return !normalizedText
    || normalizedText.startsWith("/")
    || normalizedText.startsWith("```")
    || normalizedText.length > 5000;
}

export function autocorrectUserText(text, { capitalize = true } = {}) {
  const rawText = String(text || "");
  if (shouldSkipAutocorrect(rawText)) {
    return rawText.trim();
  }

  const { protectedText, protectedParts } = protectTextParts(rawText);
  let nextText = protectedText;

  nextText = normalizeAccidentalCapsLock(nextText);
  nextText = normalizeRepeatedLetters(nextText);
  nextText = applyWordReplacements(nextText);
  nextText = normalizeSpacingAndPunctuation(nextText);

  if (capitalize) {
    nextText = capitalizeSentences(nextText);
  }

  return restoreTextParts(nextText, protectedParts);
}

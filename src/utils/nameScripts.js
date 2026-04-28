export const NAME_SCRIPT_CYRILLIC = "cyrillic";
export const NAME_SCRIPT_LATIN = "latin";
export const NAME_SCRIPT_MIXED = "mixed";

const LETTER_MARK_REGEX = /\p{M}/u;
const GENERIC_LETTER_REGEX = /\p{L}/u;
const NUMBER_REGEX = /\p{N}/u;
const WHITESPACE_REGEX = /\s/u;
const NAME_PUNCTUATION_REGEX = /['-]/;

function isCyrillicLetter(char) {
  const code = String(char || "").codePointAt(0) ?? 0;

  return (
    (code >= 0x0400 && code <= 0x052f) ||
    (code >= 0x1c80 && code <= 0x1c8f) ||
    (code >= 0x2de0 && code <= 0x2dff) ||
    (code >= 0xa640 && code <= 0xa69f)
  );
}

function isLatinLetter(char) {
  const code = String(char || "").codePointAt(0) ?? 0;

  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x00c0 && code <= 0x024f) ||
    (code >= 0x1e00 && code <= 0x1eff)
  );
}

export function detectNameScript(value) {
  let hasCyrillic = false;
  let hasLatin = false;

  for (const char of String(value || "")) {
    if (isCyrillicLetter(char)) {
      hasCyrillic = true;
      continue;
    }

    if (isLatinLetter(char)) {
      hasLatin = true;
      continue;
    }

    if (LETTER_MARK_REGEX.test(char) || NAME_PUNCTUATION_REGEX.test(char)) {
      continue;
    }

    if (GENERIC_LETTER_REGEX.test(char)) {
      return NAME_SCRIPT_MIXED;
    }
  }

  if (hasCyrillic && hasLatin) {
    return NAME_SCRIPT_MIXED;
  }

  if (hasCyrillic) {
    return NAME_SCRIPT_CYRILLIC;
  }

  if (hasLatin) {
    return NAME_SCRIPT_LATIN;
  }

  return "";
}

export function normalizeSingleWordNameInput(value, maxLength, forcedScript = "") {
  const compactValue = String(value || "").replace(/\s+/g, "");
  const effectiveScript =
    forcedScript === NAME_SCRIPT_CYRILLIC || forcedScript === NAME_SCRIPT_LATIN
      ? forcedScript
      : "";
  const sanitized = [];
  let resolvedScript = effectiveScript;

  for (const char of compactValue) {
    if (isCyrillicLetter(char)) {
      if (!resolvedScript) {
        resolvedScript = NAME_SCRIPT_CYRILLIC;
      }

      if (resolvedScript === NAME_SCRIPT_CYRILLIC) {
        sanitized.push(char);
      }
      continue;
    }

    if (isLatinLetter(char)) {
      if (!resolvedScript) {
        resolvedScript = NAME_SCRIPT_LATIN;
      }

      if (resolvedScript === NAME_SCRIPT_LATIN) {
        sanitized.push(char);
      }
      continue;
    }

    if (LETTER_MARK_REGEX.test(char)) {
      if (resolvedScript && sanitized.length > 0) {
        sanitized.push(char);
      }
      continue;
    }

    if (NAME_PUNCTUATION_REGEX.test(char) && sanitized.length > 0) {
      sanitized.push(char);
    }
  }

  return sanitized.join("").slice(0, maxLength);
}

export function areNamesUsingSameScript(firstName, lastName) {
  const firstScript = detectNameScript(firstName);
  const lastScript = detectNameScript(lastName);

  return Boolean(
    firstScript &&
      lastScript &&
      firstScript !== NAME_SCRIPT_MIXED &&
      lastScript !== NAME_SCRIPT_MIXED &&
      firstScript === lastScript
  );
}

export function normalizeScriptAwareNicknameInput(value, maxLength, forcedScript = "") {
  const effectiveScript =
    forcedScript === NAME_SCRIPT_CYRILLIC || forcedScript === NAME_SCRIPT_LATIN
      ? forcedScript
      : "";
  const sanitized = [];
  let resolvedScript = effectiveScript;
  let previousWasSpace = true;

  for (const char of String(value || "")) {
    if (isCyrillicLetter(char)) {
      if (!resolvedScript) {
        resolvedScript = NAME_SCRIPT_CYRILLIC;
      }

      if (resolvedScript === NAME_SCRIPT_CYRILLIC) {
        sanitized.push(char);
        previousWasSpace = false;
      }
      continue;
    }

    if (isLatinLetter(char)) {
      if (!resolvedScript) {
        resolvedScript = NAME_SCRIPT_LATIN;
      }

      if (resolvedScript === NAME_SCRIPT_LATIN) {
        sanitized.push(char);
        previousWasSpace = false;
      }
      continue;
    }

    if (LETTER_MARK_REGEX.test(char)) {
      if (sanitized.length > 0 && !previousWasSpace) {
        sanitized.push(char);
      }
      continue;
    }

    if (NUMBER_REGEX.test(char)) {
      sanitized.push(char);
      previousWasSpace = false;
      continue;
    }

    if (WHITESPACE_REGEX.test(char)) {
      if (sanitized.length > 0 && !previousWasSpace) {
        sanitized.push(" ");
        previousWasSpace = true;
      }
    }
  }

  return sanitized.join("").slice(0, maxLength);
}

export function isNicknameUsingSingleScript(value) {
  return detectNameScript(value) !== NAME_SCRIPT_MIXED;
}

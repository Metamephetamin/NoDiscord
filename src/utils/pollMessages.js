const POLL_MESSAGE_PREFIX = "[[tend-poll]]";
const MAX_POLL_QUESTION_LENGTH = 220;
const MAX_POLL_OPTION_LENGTH = 120;
const MAX_POLL_OPTIONS = 12;

export const DEFAULT_POLL_THEME_ID = "blue";

export const POLL_THEME_PRESETS = [
  {
    id: "blue",
    label: "Синий",
    cardBackground: "linear-gradient(180deg, rgba(67, 108, 154, 0.96), rgba(52, 90, 133, 0.96))",
    cardShadow: "0 16px 38px rgba(18, 28, 46, 0.26)",
    badgeColor: "#9eccff",
    trackColor: "rgba(8, 15, 27, 0.16)",
    fillColor: "rgba(255, 255, 255, 0.14)",
    selectedRing: "rgba(61, 102, 147, 0.96)",
  },
  {
    id: "violet",
    label: "Фиолетовый",
    cardBackground: "linear-gradient(180deg, rgba(110, 79, 161, 0.97), rgba(84, 55, 133, 0.97))",
    cardShadow: "0 16px 38px rgba(36, 21, 62, 0.3)",
    badgeColor: "#d6b7ff",
    trackColor: "rgba(20, 12, 36, 0.2)",
    fillColor: "rgba(255, 255, 255, 0.16)",
    selectedRing: "rgba(110, 79, 161, 0.96)",
  },
  {
    id: "emerald",
    label: "Изумрудный",
    cardBackground: "linear-gradient(180deg, rgba(41, 115, 101, 0.97), rgba(28, 85, 76, 0.97))",
    cardShadow: "0 16px 38px rgba(12, 40, 35, 0.3)",
    badgeColor: "#9ef3d6",
    trackColor: "rgba(10, 24, 21, 0.2)",
    fillColor: "rgba(255, 255, 255, 0.16)",
    selectedRing: "rgba(41, 115, 101, 0.96)",
  },
  {
    id: "sunset",
    label: "Закатный",
    cardBackground: "linear-gradient(180deg, rgba(150, 92, 71, 0.97), rgba(118, 64, 52, 0.97))",
    cardShadow: "0 16px 38px rgba(58, 28, 20, 0.3)",
    badgeColor: "#ffc49a",
    trackColor: "rgba(34, 17, 13, 0.22)",
    fillColor: "rgba(255, 255, 255, 0.16)",
    selectedRing: "rgba(150, 92, 71, 0.96)",
  },
  {
    id: "graphite",
    label: "Графитовый",
    cardBackground: "linear-gradient(180deg, rgba(55, 62, 78, 0.97), rgba(39, 44, 56, 0.97))",
    cardShadow: "0 16px 38px rgba(9, 12, 18, 0.34)",
    badgeColor: "#c3cfdf",
    trackColor: "rgba(11, 15, 24, 0.22)",
    fillColor: "rgba(255, 255, 255, 0.14)",
    selectedRing: "rgba(55, 62, 78, 0.96)",
  },
];

function clampText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function encodeUtf8Base64(value) {
  try {
    return btoa(unescape(encodeURIComponent(String(value || ""))));
  } catch {
    return "";
  }
}

function decodeUtf8Base64(value) {
  try {
    return decodeURIComponent(escape(atob(String(value || ""))));
  } catch {
    return "";
  }
}

function normalizePollThemeId(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (!normalizedValue) {
    return DEFAULT_POLL_THEME_ID;
  }

  return POLL_THEME_PRESETS.some((theme) => theme.id === normalizedValue)
    ? normalizedValue
    : DEFAULT_POLL_THEME_ID;
}

function normalizePollVotes(rawVotes, normalizedOptions) {
  const allowedOptionIds = new Set(normalizedOptions.map((option) => option.id));
  if (!rawVotes || typeof rawVotes !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawVotes)
      .map(([optionId, voteCount]) => [String(optionId || ""), Math.max(0, Number(voteCount) || 0)])
      .filter(([optionId]) => allowedOptionIds.has(optionId))
  );
}

export function resolvePollTheme(themeId) {
  return POLL_THEME_PRESETS.find((theme) => theme.id === normalizePollThemeId(themeId)) || POLL_THEME_PRESETS[0];
}

export function normalizePollMessage(rawPoll) {
  const question = clampText(rawPoll?.question, MAX_POLL_QUESTION_LENGTH);
  const normalizedOptions = Array.isArray(rawPoll?.options)
    ? rawPoll.options
        .map((option, index) => ({
          id: String(option?.id || `option-${index + 1}`),
          text: clampText(option?.text, MAX_POLL_OPTION_LENGTH),
        }))
        .filter((option) => option.text)
        .slice(0, MAX_POLL_OPTIONS)
    : [];

  const options = normalizedOptions.length >= 2
    ? normalizedOptions
    : [
        { id: "option-1", text: "Вариант 1" },
        { id: "option-2", text: "Вариант 2" },
      ];

  const votes = normalizePollVotes(rawPoll?.votes, options);
  const totalVotersFromVotes = Object.values(votes).reduce((sum, voteCount) => sum + voteCount, 0);
  const totalVoters = Math.max(0, Number(rawPoll?.totalVoters) || totalVotersFromVotes);

  return {
    version: 2,
    question: question || "Новый опрос",
    options,
    themeId: normalizePollThemeId(rawPoll?.themeId || rawPoll?.theme || rawPoll?.backgroundTheme),
    votes,
    totalVoters,
    settings: {
      showWhoVoted: Boolean(rawPoll?.settings?.showWhoVoted),
      allowMultipleAnswers: Boolean(rawPoll?.settings?.allowMultipleAnswers),
      allowAddingOptions: Boolean(rawPoll?.settings?.allowAddingOptions),
      allowRevoting: Boolean(rawPoll?.settings?.allowRevoting),
      shuffleOptions: Boolean(rawPoll?.settings?.shuffleOptions),
      quizMode: Boolean(rawPoll?.settings?.quizMode),
      limitDuration: Boolean(rawPoll?.settings?.limitDuration),
    },
  };
}

export function createPollMessagePayload(rawPoll) {
  const normalizedPoll = normalizePollMessage(rawPoll);
  const serializedPoll = JSON.stringify(normalizedPoll);
  return `${POLL_MESSAGE_PREFIX}${encodeUtf8Base64(serializedPoll)}`;
}

export function parsePollMessage(rawMessage) {
  const normalizedMessage = String(rawMessage || "").trim();
  if (!normalizedMessage.startsWith(POLL_MESSAGE_PREFIX)) {
    return null;
  }

  const encodedPayload = normalizedMessage.slice(POLL_MESSAGE_PREFIX.length);
  const decodedPayload = decodeUtf8Base64(encodedPayload);
  if (!decodedPayload) {
    return null;
  }

  try {
    return normalizePollMessage(JSON.parse(decodedPayload));
  } catch {
    return null;
  }
}

export function isPollMessage(rawMessage) {
  return Boolean(parsePollMessage(rawMessage));
}

export function getPollPreview(rawMessage) {
  const poll = parsePollMessage(rawMessage);
  if (!poll) {
    return "";
  }

  const question = clampText(poll.question, 80);
  return question ? `Опрос: ${question}` : "Опрос";
}

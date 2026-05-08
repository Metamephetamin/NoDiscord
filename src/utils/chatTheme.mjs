export const CHAT_THEME_OPTIONS = Object.freeze([
  {
    id: "default",
    title: "Стандарт",
    description: "Текущий темный чат без отдельного фона.",
    preview: {
      background: "linear-gradient(135deg, #0b1018, #121b2b 48%, #171328)",
      bubble: "linear-gradient(135deg, #1b2330, #202a3a)",
      document: "linear-gradient(135deg, #151922, #0a0d13)",
    },
    variables: {
      "--chat-theme-background": "transparent",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(7, 10, 16, 0), rgba(7, 10, 16, 0))",
      "--chat-message-bubble-bg": "rgba(27, 35, 48, 0.9)",
      "--chat-document-bg": "linear-gradient(180deg, rgba(21, 25, 34, 0.98), rgba(10, 13, 19, 0.98))",
      "--chat-document-local-bg": "linear-gradient(180deg, rgba(27, 32, 43, 0.98), rgba(12, 15, 22, 0.98))",
    },
  },
  {
    id: "aurora",
    title: "Аврора",
    description: "Мягкий сине-розовый фон и спокойные стеклянные блоки.",
    preview: {
      background: "linear-gradient(135deg, #15243a, #26324b 42%, #3b274b 100%)",
      bubble: "linear-gradient(135deg, rgba(61, 78, 116, 0.86), rgba(88, 70, 122, 0.84))",
      document: "linear-gradient(135deg, rgba(32, 48, 76, 0.96), rgba(66, 49, 88, 0.94))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 18% 8%, rgba(94, 175, 255, 0.24), transparent 34%), radial-gradient(circle at 82% 18%, rgba(232, 122, 255, 0.22), transparent 32%), linear-gradient(135deg, rgba(14, 23, 36, 0.98), rgba(24, 34, 53, 0.98) 45%, rgba(35, 25, 48, 0.98))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(7, 10, 16, 0.16), rgba(7, 10, 16, 0.34))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(47, 61, 92, 0.9), rgba(75, 57, 102, 0.88))",
      "--chat-document-bg": "linear-gradient(135deg, rgba(30, 44, 70, 0.98), rgba(63, 48, 82, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(38, 54, 82, 0.98), rgba(71, 53, 92, 0.96))",
    },
  },
  {
    id: "mint",
    title: "Мята",
    description: "Свежий голубо-зеленый градиент без однотонной заливки.",
    preview: {
      background: "linear-gradient(135deg, #102c32, #16364b 50%, #263a36)",
      bubble: "linear-gradient(135deg, rgba(31, 82, 88, 0.86), rgba(42, 83, 118, 0.84))",
      document: "linear-gradient(135deg, rgba(24, 64, 74, 0.96), rgba(33, 57, 87, 0.95))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 15% 12%, rgba(99, 255, 213, 0.19), transparent 34%), radial-gradient(circle at 88% 24%, rgba(101, 158, 255, 0.19), transparent 32%), linear-gradient(135deg, rgba(9, 28, 32, 0.98), rgba(13, 31, 49, 0.98) 50%, rgba(24, 40, 37, 0.98))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(5, 11, 16, 0.14), rgba(5, 11, 16, 0.32))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(28, 75, 82, 0.9), rgba(38, 70, 102, 0.88))",
      "--chat-document-bg": "linear-gradient(135deg, rgba(21, 58, 68, 0.98), rgba(31, 52, 80, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(29, 70, 80, 0.98), rgba(39, 61, 91, 0.96))",
    },
  },
  {
    id: "pearl",
    title: "Перламутр",
    description: "Светлый градиент чата с читаемыми темными пузырями.",
    preview: {
      background: "linear-gradient(135deg, #dbeafe, #f5d0fe 48%, #d1fae5)",
      bubble: "linear-gradient(135deg, #29354b, #35415d)",
      document: "linear-gradient(135deg, #243246, #3a3152)",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 12% 10%, rgba(125, 191, 255, 0.3), transparent 34%), radial-gradient(circle at 82% 20%, rgba(238, 141, 255, 0.28), transparent 35%), linear-gradient(135deg, rgba(219, 234, 254, 0.94), rgba(245, 208, 254, 0.86) 48%, rgba(209, 250, 229, 0.9))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(8, 14, 24, 0.1), rgba(8, 14, 24, 0.22))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(38, 49, 70, 0.92), rgba(53, 63, 88, 0.9))",
      "--chat-document-bg": "linear-gradient(135deg, rgba(35, 49, 70, 0.98), rgba(57, 48, 78, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(45, 61, 84, 0.98), rgba(67, 56, 90, 0.96))",
    },
  },
]);

const SUPPORTED_CHAT_THEME_IDS = new Set(CHAT_THEME_OPTIONS.map((option) => option.id));
const DEFAULT_CHAT_THEME = CHAT_THEME_OPTIONS[0];

export function normalizeChatThemeId(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return SUPPORTED_CHAT_THEME_IDS.has(normalizedValue) ? normalizedValue : DEFAULT_CHAT_THEME.id;
}

export function resolveChatTheme(value) {
  const themeId = normalizeChatThemeId(value);
  return CHAT_THEME_OPTIONS.find((option) => option.id === themeId) || DEFAULT_CHAT_THEME;
}

function toCssUrl(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue || !normalizedValue.startsWith("data:image/")) {
    return "none";
  }

  return `url("${normalizedValue.replace(/["\\\n\r]/g, "")}")`;
}

export function applyChatThemePreference(value, options = {}) {
  const theme = resolveChatTheme(value);
  const documentRef = globalThis.document;
  const root = options.root || documentRef?.documentElement;
  const body = options.body || documentRef?.body;
  const customBackgroundData = String(options.customBackgroundData || "").trim();

  [root, body].forEach((node) => {
    if (!node) {
      return;
    }

    if (node.dataset) {
      node.dataset.chatTheme = theme.id;
      node.dataset.chatCustomBackground = customBackgroundData ? "true" : "false";
    }

    if (node.style) {
      Object.entries(theme.variables).forEach(([name, themeValue]) => {
        node.style.setProperty(name, themeValue);
      });
      node.style.setProperty("--chat-custom-background-image", toCssUrl(customBackgroundData));
    }
  });

  return theme;
}

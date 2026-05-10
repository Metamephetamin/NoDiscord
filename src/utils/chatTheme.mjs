export const CHAT_THEME_OPTIONS = Object.freeze([
  {
    id: "default",
    title: "Стандарт",
    description: "Текущий темный чат без отдельного фона.",
    preview: {
      background: "linear-gradient(135deg, #101827, #1f3352 48%, #272044)",
      bubble: "linear-gradient(135deg, #334766, #435a84)",
      document: "linear-gradient(135deg, #25334a, #182236)",
    },
    variables: {
      "--chat-theme-background": "transparent",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(7, 10, 16, 0), rgba(7, 10, 16, 0))",
      "--chat-message-bubble-bg": "rgba(48, 65, 92, 0.94)",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(48, 66, 96, 0.97), rgba(63, 82, 120, 0.96))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(62, 96, 151, 0.98), rgba(79, 103, 171, 0.96))",
      "--chat-message-border": "rgba(155, 180, 255, 0.14)",
      "--chat-document-bg": "linear-gradient(180deg, rgba(37, 51, 74, 0.98), rgba(24, 34, 54, 0.98))",
      "--chat-document-local-bg": "linear-gradient(180deg, rgba(47, 62, 88, 0.98), rgba(29, 39, 61, 0.98))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(42, 57, 82, 0.98), rgba(28, 40, 62, 0.98))",
      "--chat-topbar-bg": "linear-gradient(180deg, rgba(28, 39, 60, 0.97), rgba(18, 25, 41, 0.95))",
      "--chat-topbar-border": "rgba(155, 180, 255, 0.14)",
      "--chat-topbar-search-bg": "rgba(255, 255, 255, 0.055)",
      "--chat-topbar-search-border": "rgba(155, 180, 255, 0.12)",
    },
  },
  {
    id: "aurora",
    title: "Аврора",
    description: "Яркий сине-розовый фон и стеклянные цветные блоки.",
    preview: {
      background: "linear-gradient(135deg, #1e5f9e, #8148c8 46%, #d44f92 100%)",
      bubble: "linear-gradient(135deg, rgba(42, 116, 201, 0.94), rgba(181, 83, 214, 0.92))",
      document: "linear-gradient(135deg, rgba(46, 89, 178, 0.96), rgba(175, 74, 160, 0.94))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 18% 8%, rgba(91, 204, 255, 0.45), transparent 34%), radial-gradient(circle at 82% 18%, rgba(255, 116, 226, 0.42), transparent 32%), linear-gradient(135deg, rgba(18, 58, 98, 0.98), rgba(65, 50, 126, 0.98) 45%, rgba(112, 42, 92, 0.98))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(7, 10, 16, 0.08), rgba(7, 10, 16, 0.18))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(49, 105, 186, 0.94), rgba(154, 79, 198, 0.92))",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(56, 120, 208, 0.96), rgba(136, 83, 201, 0.94))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(32, 153, 214, 0.98), rgba(199, 77, 205, 0.96))",
      "--chat-message-border": "rgba(199, 169, 255, 0.18)",
      "--chat-document-bg": "linear-gradient(135deg, rgba(42, 92, 171, 0.98), rgba(133, 70, 168, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(52, 111, 191, 0.98), rgba(151, 78, 184, 0.96))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(36, 96, 176, 0.98), rgba(158, 62, 153, 0.98))",
      "--chat-topbar-bg": "linear-gradient(135deg, rgba(39, 88, 166, 0.95), rgba(122, 57, 159, 0.92))",
      "--chat-topbar-border": "rgba(199, 169, 255, 0.2)",
      "--chat-topbar-search-bg": "rgba(238, 225, 255, 0.08)",
      "--chat-topbar-search-border": "rgba(238, 225, 255, 0.14)",
    },
  },
  {
    id: "mint",
    title: "Мята",
    description: "Свежий голубо-зеленый градиент без однотонной заливки.",
    preview: {
      background: "linear-gradient(135deg, #0d7d71, #1b8fc9 50%, #64b94f)",
      bubble: "linear-gradient(135deg, rgba(23, 142, 124, 0.94), rgba(36, 128, 198, 0.92))",
      document: "linear-gradient(135deg, rgba(29, 122, 112, 0.96), rgba(45, 104, 173, 0.95))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 15% 12%, rgba(91, 255, 218, 0.38), transparent 34%), radial-gradient(circle at 88% 24%, rgba(88, 178, 255, 0.36), transparent 32%), linear-gradient(135deg, rgba(6, 88, 82, 0.98), rgba(13, 90, 143, 0.98) 50%, rgba(55, 114, 57, 0.98))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(5, 11, 16, 0.06), rgba(5, 11, 16, 0.16))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(28, 124, 113, 0.94), rgba(42, 111, 179, 0.92))",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(31, 138, 125, 0.96), rgba(43, 123, 196, 0.94))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(19, 170, 146, 0.98), rgba(45, 143, 218, 0.96))",
      "--chat-message-border": "rgba(132, 255, 226, 0.18)",
      "--chat-document-bg": "linear-gradient(135deg, rgba(26, 109, 103, 0.98), rgba(35, 91, 155, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(35, 128, 119, 0.98), rgba(44, 107, 174, 0.96))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(22, 119, 103, 0.98), rgba(27, 100, 169, 0.98))",
      "--chat-topbar-bg": "linear-gradient(135deg, rgba(15, 92, 85, 0.95), rgba(22, 78, 131, 0.92))",
      "--chat-topbar-border": "rgba(132, 255, 226, 0.2)",
      "--chat-topbar-search-bg": "rgba(203, 255, 244, 0.08)",
      "--chat-topbar-search-border": "rgba(203, 255, 244, 0.14)",
    },
  },
  {
    id: "pearl",
    title: "Перламутр",
    description: "Светлый градиент чата с читаемыми темными пузырями.",
    preview: {
      background: "linear-gradient(135deg, #c7e5ff, #f6b8ff 48%, #a7f3c8)",
      bubble: "linear-gradient(135deg, #44577d, #634d85)",
      document: "linear-gradient(135deg, #3f5c82, #704f85)",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 12% 10%, rgba(83, 173, 255, 0.36), transparent 34%), radial-gradient(circle at 82% 20%, rgba(234, 92, 255, 0.34), transparent 35%), linear-gradient(135deg, rgba(199, 229, 255, 0.96), rgba(246, 184, 255, 0.9) 48%, rgba(167, 243, 200, 0.94))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(8, 14, 24, 0.04), rgba(8, 14, 24, 0.12))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(68, 87, 125, 0.94), rgba(99, 77, 133, 0.92))",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(76, 95, 138, 0.96), rgba(105, 89, 148, 0.94))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(51, 122, 190, 0.98), rgba(154, 88, 190, 0.96))",
      "--chat-message-border": "rgba(255, 255, 255, 0.22)",
      "--chat-document-bg": "linear-gradient(135deg, rgba(57, 84, 123, 0.98), rgba(88, 65, 115, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(68, 100, 140, 0.98), rgba(103, 75, 130, 0.96))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(113, 170, 222, 0.96), rgba(199, 121, 218, 0.94))",
      "--chat-topbar-bg": "linear-gradient(135deg, rgba(66, 86, 125, 0.9), rgba(103, 70, 125, 0.84))",
      "--chat-topbar-border": "rgba(255, 255, 255, 0.24)",
      "--chat-topbar-search-bg": "rgba(255, 255, 255, 0.12)",
      "--chat-topbar-search-border": "rgba(255, 255, 255, 0.18)",
    },
  },
  {
    id: "sunset",
    title: "Закат",
    description: "Теплый коралл, янтарь и глубокий винный акцент.",
    preview: {
      background: "linear-gradient(135deg, #ff8a3d, #e94f78 48%, #6b4fd8)",
      bubble: "linear-gradient(135deg, rgba(219, 85, 72, 0.94), rgba(118, 82, 202, 0.92))",
      document: "linear-gradient(135deg, rgba(201, 93, 55, 0.96), rgba(132, 66, 151, 0.94))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 12% 12%, rgba(255, 190, 75, 0.48), transparent 34%), radial-gradient(circle at 86% 16%, rgba(118, 100, 255, 0.38), transparent 34%), linear-gradient(135deg, rgba(210, 77, 45, 0.98), rgba(212, 60, 102, 0.98) 48%, rgba(82, 62, 166, 0.98))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(24, 10, 12, 0.06), rgba(24, 10, 12, 0.18))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(197, 78, 68, 0.94), rgba(113, 73, 185, 0.92))",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(209, 91, 72, 0.96), rgba(139, 77, 184, 0.94))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(240, 112, 54, 0.98), rgba(219, 69, 137, 0.96))",
      "--chat-message-border": "rgba(255, 199, 147, 0.2)",
      "--chat-document-bg": "linear-gradient(135deg, rgba(177, 83, 56, 0.98), rgba(121, 64, 146, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(199, 96, 61, 0.98), rgba(139, 72, 163, 0.96))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(207, 87, 54, 0.98), rgba(130, 63, 148, 0.98))",
      "--chat-topbar-bg": "linear-gradient(135deg, rgba(171, 69, 52, 0.94), rgba(101, 57, 140, 0.92))",
      "--chat-topbar-border": "rgba(255, 199, 147, 0.2)",
      "--chat-topbar-search-bg": "rgba(255, 235, 205, 0.1)",
      "--chat-topbar-search-border": "rgba(255, 214, 176, 0.16)",
    },
  },
  {
    id: "citrus",
    title: "Цитрус",
    description: "Сочный лайм, желтый и голубой для светлого живого чата.",
    preview: {
      background: "linear-gradient(135deg, #f7d84a, #8adf4d 48%, #28b9d6)",
      bubble: "linear-gradient(135deg, rgba(55, 135, 104, 0.94), rgba(40, 122, 184, 0.92))",
      document: "linear-gradient(135deg, rgba(95, 139, 60, 0.96), rgba(37, 128, 162, 0.94))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 14% 12%, rgba(255, 232, 88, 0.54), transparent 34%), radial-gradient(circle at 86% 20%, rgba(45, 206, 232, 0.42), transparent 34%), linear-gradient(135deg, rgba(198, 175, 44, 0.96), rgba(94, 173, 65, 0.94) 48%, rgba(35, 151, 178, 0.96))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(7, 16, 10, 0.05), rgba(7, 16, 10, 0.14))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(55, 129, 92, 0.94), rgba(38, 116, 174, 0.92))",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(68, 148, 99, 0.96), rgba(42, 130, 190, 0.94))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(103, 178, 48, 0.98), rgba(31, 164, 193, 0.96))",
      "--chat-message-border": "rgba(231, 255, 164, 0.22)",
      "--chat-document-bg": "linear-gradient(135deg, rgba(75, 129, 62, 0.98), rgba(36, 115, 153, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(88, 148, 70, 0.98), rgba(44, 132, 172, 0.96))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(99, 147, 55, 0.98), rgba(30, 132, 164, 0.98))",
      "--chat-topbar-bg": "linear-gradient(135deg, rgba(76, 127, 57, 0.92), rgba(33, 113, 150, 0.9))",
      "--chat-topbar-border": "rgba(231, 255, 164, 0.22)",
      "--chat-topbar-search-bg": "rgba(248, 255, 216, 0.12)",
      "--chat-topbar-search-border": "rgba(239, 255, 184, 0.18)",
    },
  },
  {
    id: "midnight-pop",
    title: "Неон",
    description: "Контрастный ночной фон с яркими голубыми и розовыми блоками.",
    preview: {
      background: "linear-gradient(135deg, #111d4f, #0b7a88 44%, #d7378c)",
      bubble: "linear-gradient(135deg, rgba(28, 103, 184, 0.94), rgba(194, 54, 153, 0.92))",
      document: "linear-gradient(135deg, rgba(31, 83, 159, 0.96), rgba(145, 50, 138, 0.94))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 18% 10%, rgba(65, 146, 255, 0.42), transparent 32%), radial-gradient(circle at 82% 16%, rgba(255, 69, 173, 0.44), transparent 34%), linear-gradient(135deg, rgba(13, 26, 83, 0.98), rgba(7, 111, 126, 0.96) 44%, rgba(157, 34, 105, 0.98))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(4, 8, 20, 0.08), rgba(4, 8, 20, 0.22))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(28, 91, 168, 0.94), rgba(168, 49, 145, 0.92))",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(31, 105, 190, 0.96), rgba(184, 56, 157, 0.94))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(23, 153, 216, 0.98), rgba(219, 54, 151, 0.96))",
      "--chat-message-border": "rgba(139, 230, 255, 0.2)",
      "--chat-document-bg": "linear-gradient(135deg, rgba(24, 78, 151, 0.98), rgba(142, 45, 129, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(30, 92, 172, 0.98), rgba(161, 52, 145, 0.96))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(22, 80, 159, 0.98), rgba(144, 35, 121, 0.98))",
      "--chat-topbar-bg": "linear-gradient(135deg, rgba(20, 65, 136, 0.94), rgba(126, 38, 119, 0.92))",
      "--chat-topbar-border": "rgba(139, 230, 255, 0.2)",
      "--chat-topbar-search-bg": "rgba(205, 246, 255, 0.1)",
      "--chat-topbar-search-border": "rgba(179, 238, 255, 0.16)",
    },
  },
  {
    id: "orchard",
    title: "Сад",
    description: "Зеленый фон с ягодными и голубыми акцентами.",
    preview: {
      background: "linear-gradient(135deg, #2c8f55, #3aa5a1 48%, #a94779)",
      bubble: "linear-gradient(135deg, rgba(53, 133, 82, 0.94), rgba(57, 124, 160, 0.92))",
      document: "linear-gradient(135deg, rgba(52, 112, 73, 0.96), rgba(129, 61, 113, 0.94))",
    },
    variables: {
      "--chat-theme-background": "radial-gradient(circle at 14% 12%, rgba(111, 232, 126, 0.42), transparent 34%), radial-gradient(circle at 86% 18%, rgba(255, 91, 159, 0.34), transparent 34%), linear-gradient(135deg, rgba(37, 121, 70, 0.98), rgba(43, 139, 135, 0.96) 48%, rgba(130, 52, 91, 0.98))",
      "--chat-theme-overlay": "linear-gradient(180deg, rgba(5, 14, 9, 0.06), rgba(5, 14, 9, 0.18))",
      "--chat-message-bubble-bg": "linear-gradient(135deg, rgba(49, 121, 78, 0.94), rgba(53, 111, 153, 0.92))",
      "--chat-message-incoming-bg": "linear-gradient(135deg, rgba(56, 139, 87, 0.96), rgba(64, 123, 170, 0.94))",
      "--chat-message-own-bg": "linear-gradient(135deg, rgba(67, 169, 85, 0.98), rgba(178, 72, 122, 0.96))",
      "--chat-message-border": "rgba(178, 255, 195, 0.2)",
      "--chat-document-bg": "linear-gradient(135deg, rgba(46, 106, 69, 0.98), rgba(112, 56, 105, 0.96))",
      "--chat-document-local-bg": "linear-gradient(135deg, rgba(55, 125, 80, 0.98), rgba(130, 64, 119, 0.96))",
      "--chat-media-gap-bg": "linear-gradient(135deg, rgba(42, 113, 66, 0.98), rgba(119, 49, 99, 0.98))",
      "--chat-topbar-bg": "linear-gradient(135deg, rgba(41, 104, 65, 0.94), rgba(101, 48, 96, 0.92))",
      "--chat-topbar-border": "rgba(178, 255, 195, 0.2)",
      "--chat-topbar-search-bg": "rgba(225, 255, 232, 0.1)",
      "--chat-topbar-search-border": "rgba(200, 255, 212, 0.16)",
    },
  },
]);

const SUPPORTED_CHAT_THEME_IDS = new Set(CHAT_THEME_OPTIONS.map((option) => option.id));
const DEFAULT_CHAT_THEME = CHAT_THEME_OPTIONS[0];
const LIGHT_DEFAULT_CHAT_THEME_VARIABLES = Object.freeze({
  "--chat-theme-background": "linear-gradient(180deg, rgba(248, 250, 255, 0.98), rgba(242, 246, 253, 0.98))",
  "--chat-theme-overlay": "linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(226, 232, 240, 0.1))",
  "--chat-message-bubble-bg": "rgba(255, 255, 255, 0.94)",
  "--chat-message-incoming-bg": "linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 253, 0.98))",
  "--chat-message-own-bg": "linear-gradient(135deg, rgba(224, 234, 255, 0.98), rgba(207, 218, 255, 0.96))",
  "--chat-message-border": "rgba(148, 163, 184, 0.28)",
  "--chat-document-bg": "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  "--chat-document-local-bg": "linear-gradient(180deg, #ffffff 0%, #eef3ff 100%)",
  "--chat-media-gap-bg": "#ffffff",
  "--chat-topbar-bg": "linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.94))",
  "--chat-topbar-border": "rgba(203, 213, 225, 0.78)",
  "--chat-topbar-search-bg": "rgba(255, 255, 255, 0.88)",
  "--chat-topbar-search-border": "rgba(203, 213, 225, 0.8)",
});

export const CHAT_BACKGROUND_FIT_OPTIONS = Object.freeze([
  {
    id: "cover",
    title: "Заполнить",
    description: "Фон покрывает весь чат и может обрезаться по краям.",
    size: "cover",
    position: "center",
    repeat: "no-repeat",
  },
  {
    id: "contain",
    title: "Вместить",
    description: "Картинка видна целиком, вокруг могут остаться поля.",
    size: "contain",
    position: "center",
    repeat: "no-repeat",
  },
  {
    id: "stretch",
    title: "Растянуть",
    description: "Фон растягивается под размер чата без обрезки.",
    size: "100% 100%",
    position: "center",
    repeat: "no-repeat",
  },
  {
    id: "tile",
    title: "Плитка",
    description: "Небольшое изображение повторяется по всей области.",
    size: "auto",
    position: "top left",
    repeat: "repeat",
  },
]);

const SUPPORTED_CHAT_BACKGROUND_FIT_IDS = new Set(CHAT_BACKGROUND_FIT_OPTIONS.map((option) => option.id));
const DEFAULT_CHAT_BACKGROUND_FIT = CHAT_BACKGROUND_FIT_OPTIONS[0];

export function normalizeChatThemeId(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return SUPPORTED_CHAT_THEME_IDS.has(normalizedValue) ? normalizedValue : DEFAULT_CHAT_THEME.id;
}

export function normalizeChatBackgroundFit(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return SUPPORTED_CHAT_BACKGROUND_FIT_IDS.has(normalizedValue) ? normalizedValue : DEFAULT_CHAT_BACKGROUND_FIT.id;
}

export function resolveChatBackgroundFit(value) {
  const fitId = normalizeChatBackgroundFit(value);
  return CHAT_BACKGROUND_FIT_OPTIONS.find((option) => option.id === fitId) || DEFAULT_CHAT_BACKGROUND_FIT;
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
  const customBackgroundFit = resolveChatBackgroundFit(options.customBackgroundFit);
  const uiTheme = String(options.uiTheme || root?.dataset?.uiTheme || body?.dataset?.uiTheme || "").trim().toLowerCase();
  const themeVariables =
    theme.id === "default" && uiTheme === "light"
      ? { ...theme.variables, ...LIGHT_DEFAULT_CHAT_THEME_VARIABLES }
      : theme.variables;

  [root, body].forEach((node) => {
    if (!node) {
      return;
    }

    if (node.dataset) {
      node.dataset.chatTheme = theme.id;
      node.dataset.chatCustomBackground = customBackgroundData ? "true" : "false";
    }

    if (node.style) {
      Object.entries(themeVariables).forEach(([name, themeValue]) => {
        node.style.setProperty(name, themeValue);
      });
      node.style.setProperty("--chat-custom-background-image", toCssUrl(customBackgroundData));
      node.style.setProperty("--chat-custom-background-size", customBackgroundFit.size);
      node.style.setProperty("--chat-custom-background-position", customBackgroundFit.position);
      node.style.setProperty("--chat-custom-background-repeat", customBackgroundFit.repeat);
    }
  });

  return theme;
}

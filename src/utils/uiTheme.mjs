export const UI_THEME_OPTIONS = Object.freeze([
  {
    id: "dark",
    title: "Темная",
    description: "Текущий контрастный интерфейс.",
  },
  {
    id: "light",
    title: "Светлая",
    description: "Белая тема для дневной работы.",
  },
  {
    id: "purple",
    title: "Фиолетовая",
    description: "Темная тема с мягкими фиолетовыми акцентами.",
  },
]);

const SUPPORTED_UI_THEME_IDS = new Set(UI_THEME_OPTIONS.map((option) => option.id));

export function normalizeUiTheme(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return SUPPORTED_UI_THEME_IDS.has(normalizedValue) ? normalizedValue : "dark";
}

export function applyUiThemePreference(value, options = {}) {
  const theme = normalizeUiTheme(value);
  const documentRef = globalThis.document;
  const root = options.root || documentRef?.documentElement;
  const body = options.body || documentRef?.body;

  if (root?.dataset) {
    root.dataset.uiTheme = theme;
  }

  if (body?.dataset) {
    body.dataset.uiTheme = theme;
  }

  return theme;
}

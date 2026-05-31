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
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeUiTheme(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return SUPPORTED_UI_THEME_IDS.has(normalizedValue) ? normalizedValue : "dark";
}

export function normalizeUiAccentColor(value) {
  const normalizedValue = String(value || "").trim();
  return HEX_COLOR_PATTERN.test(normalizedValue) ? normalizedValue.toLowerCase() : "";
}

function applyAccentTokens(target, accentColor) {
  if (!target?.style) {
    return;
  }

  if (!accentColor) {
    target.style.removeProperty("--app-accent");
    target.style.removeProperty("--app-accent-strong");
    target.style.removeProperty("--app-accent-soft");
    return;
  }

  target.style.setProperty("--app-accent", accentColor);
  target.style.setProperty("--app-accent-strong", `color-mix(in srgb, ${accentColor} 72%, #ffffff)`);
  target.style.setProperty("--app-accent-soft", `color-mix(in srgb, ${accentColor} 16%, transparent)`);
}

export function applyUiAccentPreference(value, options = {}) {
  const accentColor = normalizeUiAccentColor(value);
  const documentRef = globalThis.document;
  const root = options.root || documentRef?.documentElement;
  const body = options.body || documentRef?.body;

  applyAccentTokens(root, accentColor);
  applyAccentTokens(body, accentColor);

  return accentColor;
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

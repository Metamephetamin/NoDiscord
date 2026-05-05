import { resolveStaticAssetUrl } from "./media";

export const APP_LOGO_STORAGE_KEY = "nd:app-logo";
export const APP_LOGO_CHANGE_EVENT = "tend:app-logo-change";
export const DEFAULT_APP_LOGO_ID = "mono-light";

export const APP_LOGO_OPTIONS = [
  {
    id: "mono-light",
    label: "Моно светлый",
    description: "Черный знак на светлой плитке.",
    src: resolveStaticAssetUrl("/image/app-logos/logo-mono-light.png"),
    electronAsset: "app-logos/logo-mono-light.png",
  },
  {
    id: "gradient-light",
    label: "Градиент светлый",
    description: "Цветной знак на светлой плитке.",
    src: resolveStaticAssetUrl("/image/app-logos/logo-gradient-light.png"),
    electronAsset: "app-logos/logo-gradient-light.png",
  },
  {
    id: "gradient-dark",
    label: "Градиент темный",
    description: "Цветной знак на темной плитке.",
    src: resolveStaticAssetUrl("/image/app-logos/logo-gradient-dark.png"),
    electronAsset: "app-logos/logo-gradient-dark.png",
  },
  {
    id: "white-dark",
    label: "Белый темный",
    description: "Белый знак на темной плитке.",
    src: resolveStaticAssetUrl("/image/app-logos/logo-white-dark.png"),
    electronAsset: "app-logos/logo-white-dark.png",
  },
];

const getDefaultAppLogoOption = () =>
  APP_LOGO_OPTIONS.find((option) => option.id === DEFAULT_APP_LOGO_ID) || APP_LOGO_OPTIONS[0];

export function getAppLogoOption(id) {
  return APP_LOGO_OPTIONS.find((option) => option.id === id) || getDefaultAppLogoOption();
}

export function normalizeAppLogoId(id) {
  return getAppLogoOption(id).id;
}

export function getStoredAppLogoId() {
  if (typeof window === "undefined") {
    return DEFAULT_APP_LOGO_ID;
  }

  try {
    return normalizeAppLogoId(window.localStorage.getItem(APP_LOGO_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_LOGO_ID;
  }
}

export function getCurrentAppLogoOption() {
  return getAppLogoOption(getStoredAppLogoId());
}

function upsertIconLink(rel, href, type) {
  if (typeof document === "undefined") {
    return;
  }

  let link = document.head.querySelector(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  if (type) {
    link.type = type;
  }
  link.href = href;
}

function applyDocumentLogo(option) {
  if (typeof document === "undefined") {
    return;
  }

  upsertIconLink("icon", option.src, "image/png");
  upsertIconLink("apple-touch-icon", option.src);
  document.documentElement.style.setProperty("--app-logo-url", `url("${option.src}")`);
}

function notifyElectronLogoChange(option) {
  if (typeof window === "undefined" || !window.electronAppLogo?.set) {
    return;
  }

  window.electronAppLogo.set(option.electronAsset).catch(() => {});
}

export function applyAppLogoPreference(id) {
  const option = getAppLogoOption(id);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(APP_LOGO_STORAGE_KEY, option.id);
    } catch {
      // Logo selection is a visual preference only.
    }

    applyDocumentLogo(option);
    notifyElectronLogoChange(option);
    window.dispatchEvent(new CustomEvent(APP_LOGO_CHANGE_EVENT, { detail: option }));
  }

  return option;
}

export function initializeAppLogoPreference() {
  const option = getCurrentAppLogoOption();
  applyDocumentLogo(option);
  notifyElectronLogoChange(option);
  return option;
}

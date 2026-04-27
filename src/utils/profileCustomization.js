const PROFILE_CUSTOMIZATION_STORAGE_PREFIX = "profile-customization";

export const PROFILE_CUSTOMIZATION_DEFAULT_ITEM_ID = "amethyst";

export const PROFILE_STORE_ITEMS = [
  {
    id: "amethyst",
    title: "Набор «Сумеречный аметист»",
    category: "Космос",
    type: "Набор",
    accent: "amethyst",
    price: "Бесплатно",
    discount: "-11%",
    colors: ["#ef4444", "#c4cbd6", "#a78bfa", "#38bdf8"],
    description: "Рамка аватарки, фон нижней карточки и мягкий космический блик в голосе.",
    applies: {
      profileCard: { theme: "amethyst", frame: "glow", controls: "glass", motion: "shine" },
      voiceCard: { theme: "amethyst", frame: "glow", wave: "pulse", motion: "shine" },
    },
  },
  {
    id: "constellation",
    title: "Набор «Созвездия»",
    category: "Космос",
    type: "Фон карточки",
    accent: "constellation",
    price: "Бесплатно",
    discount: "-8%",
    colors: ["#d7d9e3", "#93c5fd"],
    description: "Серебристый фон карточек с лёгкой звёздной сеткой.",
    applies: {
      profileCard: { theme: "constellation", motion: "stars" },
      voiceCard: { theme: "constellation", motion: "stars" },
    },
  },
  {
    id: "solar",
    title: "Солнечная вспышка",
    category: "Космос",
    type: "Рамка",
    accent: "solar",
    price: "Бесплатно",
    colors: ["#ff9b31", "#fb7185"],
    description: "Тёплая световая рамка вокруг аватарки и голосовой карточки.",
    applies: {
      profileCard: { frame: "solar", motion: "glow" },
      voiceCard: { frame: "solar", wave: "bars" },
    },
  },
  {
    id: "lunar",
    title: "Лунный лёд",
    category: "Космос",
    type: "Иконки",
    accent: "lunar",
    price: "Бесплатно",
    colors: ["#79a8ff", "#f8fafc"],
    description: "Холодные синие акценты для кнопок, статуса и волн.",
    applies: {
      profileCard: { controls: "lunar", frame: "ice" },
      voiceCard: { wave: "lunar", frame: "ice" },
    },
  },
  {
    id: "neon-grid",
    title: "Неоновая сетка",
    category: "Динамика",
    type: "Анимация",
    accent: "neon-grid",
    price: "Бесплатно",
    discount: "-10%",
    colors: ["#22d3ee", "#a78bfa", "#65e48f"],
    description: "Живая сетка на карточках и быстрый пульс голосового индикатора.",
    applies: {
      profileCard: { theme: "neon-grid", motion: "scan", controls: "neon" },
      voiceCard: { theme: "neon-grid", wave: "equalizer", motion: "scan" },
    },
  },
  {
    id: "aurora",
    title: "Полярное сияние",
    category: "Динамика",
    type: "Фон карточки",
    accent: "aurora",
    price: "Бесплатно",
    colors: ["#34d399", "#60a5fa", "#c084fc"],
    description: "Плавный перелив фона для профиля и голосовой карточки.",
    applies: {
      profileCard: { theme: "aurora", motion: "aurora" },
      voiceCard: { theme: "aurora", motion: "aurora", wave: "pulse" },
    },
  },
  {
    id: "candy",
    title: "Набор «Синнаморолл»",
    category: "Милые темы",
    type: "Набор",
    accent: "candy",
    price: "Бесплатно",
    discount: "-12%",
    colors: ["#93c5fd", "#f9a8d4"],
    description: "Мягкий голубо-розовый фон, рамка и спокойные кнопки.",
    applies: {
      profileCard: { theme: "candy", frame: "soft", controls: "soft", motion: "shine" },
      voiceCard: { theme: "candy", frame: "soft", wave: "soft" },
    },
  },
  {
    id: "kitty",
    title: "Набор Hello Kitty",
    category: "Милые темы",
    type: "Набор",
    accent: "kitty",
    price: "Бесплатно",
    discount: "-12%",
    colors: ["#fb7185", "#f9a8d4"],
    description: "Розовые акценты для карточки профиля, статуса и рамки.",
    applies: {
      profileCard: { theme: "kitty", frame: "rose", controls: "rose" },
      voiceCard: { theme: "kitty", frame: "rose", wave: "soft" },
    },
  },
  {
    id: "forest",
    title: "Набор «Помпомпурин»",
    category: "Милые темы",
    type: "Фон карточки",
    accent: "forest",
    price: "Бесплатно",
    discount: "-12%",
    colors: ["#65e48f", "#facc15"],
    description: "Зелёный фон карточки и спокойные иконки подключения.",
    applies: {
      profileCard: { theme: "forest", controls: "green" },
      voiceCard: { theme: "forest", wave: "green" },
    },
  },
  {
    id: "raven",
    title: "Ворон",
    category: "Тёмные темы",
    type: "Анимация",
    accent: "raven",
    price: "Бесплатно",
    colors: ["#111827", "#9ca3af"],
    description: "Тёмная карточка с тонкими бликами и почти без лишней суеты.",
    applies: {
      profileCard: { theme: "raven", frame: "smoke", controls: "dark", motion: "none" },
      voiceCard: { theme: "raven", frame: "smoke", wave: "off", motion: "none" },
    },
  },
  {
    id: "venom",
    title: "Веном",
    category: "Тёмные темы",
    type: "Рамка",
    accent: "venom",
    price: "Бесплатно",
    colors: ["#0f172a", "#e5e7eb"],
    description: "Контрастная рамка, тёмные кнопки и плотная анимация волн.",
    applies: {
      profileCard: { frame: "venom", controls: "dark" },
      voiceCard: { frame: "venom", wave: "equalizer" },
    },
  },
  {
    id: "spider",
    title: "Набор «Человек-паук»",
    category: "Аниме и игры",
    type: "Набор",
    accent: "spider",
    price: "Бесплатно",
    discount: "-11%",
    colors: ["#dc2626", "#e5e7eb"],
    description: "Красные акценты, сетка и динамичная рамка карточки.",
    applies: {
      profileCard: { theme: "spider", frame: "red", controls: "red", motion: "scan" },
      voiceCard: { theme: "spider", frame: "red", wave: "equalizer", motion: "scan" },
    },
  },
  {
    id: "itadori",
    title: "Юдзи Итадори",
    category: "Аниме и игры",
    type: "Фон карточки",
    accent: "itadori",
    price: "Бесплатно",
    colors: ["#991b1b", "#111827"],
    description: "Тёмная карточка с красным нижним баннером и сильной рамкой.",
    applies: {
      profileCard: { theme: "itadori", frame: "red" },
      voiceCard: { theme: "itadori", wave: "red" },
    },
  },
  {
    id: "mono",
    title: "Чистый графит",
    category: "Минимализм",
    type: "Фон карточки",
    accent: "mono",
    price: "Бесплатно",
    colors: ["#9ca3af", "#e5e7eb"],
    description: "Спокойный тёмный фон без ярких эффектов.",
    applies: {
      profileCard: { theme: "mono", frame: "thin", controls: "glass", motion: "none" },
      voiceCard: { theme: "mono", frame: "thin", wave: "off", motion: "none" },
    },
  },
  {
    id: "pulse-wave",
    title: "Живые волны",
    category: "Динамика",
    type: "Эффект голоса",
    accent: "pulse-wave",
    price: "Бесплатно",
    colors: ["#65e48f", "#a78bfa"],
    description: "Меняет только волну и динамику карточки голосового канала.",
    applies: {
      voiceCard: { wave: "equalizer", motion: "glow" },
    },
  },
];

export const PROFILE_STORE_CATEGORIES = Array.from(new Set(PROFILE_STORE_ITEMS.map((item) => item.category)));
export const PROFILE_STORE_TYPES = Array.from(new Set(PROFILE_STORE_ITEMS.map((item) => item.type)));
export const PROFILE_STORE_FEATURED_ITEMS = PROFILE_STORE_ITEMS.slice(0, 6);

export const getProfileStoreItemById = (itemId) => (
  PROFILE_STORE_ITEMS.find((item) => item.id === itemId) || PROFILE_STORE_ITEMS[0]
);

export const createDefaultProfileCustomization = () => {
  const defaultItem = getProfileStoreItemById(PROFILE_CUSTOMIZATION_DEFAULT_ITEM_ID);

  return {
    appliedItemId: defaultItem.id,
    profileCard: { ...(defaultItem.applies.profileCard || {}) },
    voiceCard: { ...(defaultItem.applies.voiceCard || {}) },
  };
};

export const normalizeProfileCustomization = (value) => {
  const defaults = createDefaultProfileCustomization();
  if (!value || typeof value !== "object") {
    return defaults;
  }

  return {
    appliedItemId: String(value.appliedItemId || defaults.appliedItemId),
    profileCard: {
      ...defaults.profileCard,
      ...(value.profileCard && typeof value.profileCard === "object" ? value.profileCard : {}),
    },
    voiceCard: {
      ...defaults.voiceCard,
      ...(value.voiceCard && typeof value.voiceCard === "object" ? value.voiceCard : {}),
    },
  };
};

export const getProfileCustomizationStorageKey = (user) => {
  const userId = String(user?.id || user?.userId || "").trim();
  return userId ? `${PROFILE_CUSTOMIZATION_STORAGE_PREFIX}:${userId}` : "";
};

export const readProfileCustomization = (user) => {
  const key = getProfileCustomizationStorageKey(user);
  if (!key || typeof window === "undefined") {
    return createDefaultProfileCustomization();
  }

  try {
    return normalizeProfileCustomization(JSON.parse(window.localStorage.getItem(key) || "null"));
  } catch {
    return createDefaultProfileCustomization();
  }
};

export const writeProfileCustomization = (user, customization) => {
  const key = getProfileCustomizationStorageKey(user);
  if (!key || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(normalizeProfileCustomization(customization)));
  } catch {
    // Visual customization is optional local state.
  }
};

export const applyProfileStoreItem = (customization, item) => {
  const normalizedCustomization = normalizeProfileCustomization(customization);
  const nextItem = item || getProfileStoreItemById(PROFILE_CUSTOMIZATION_DEFAULT_ITEM_ID);

  return normalizeProfileCustomization({
    ...normalizedCustomization,
    appliedItemId: nextItem.id,
    profileCard: {
      ...normalizedCustomization.profileCard,
      ...(nextItem.applies.profileCard || {}),
    },
    voiceCard: {
      ...normalizedCustomization.voiceCard,
      ...(nextItem.applies.voiceCard || {}),
    },
  });
};

export const getProfileCustomizationClassName = (customization, surface) => {
  const surfaceSettings = normalizeProfileCustomization(customization)[surface] || {};

  return [
    "profile-customization",
    surfaceSettings.theme ? `profile-customization--theme-${surfaceSettings.theme}` : "",
    surfaceSettings.frame ? `profile-customization--frame-${surfaceSettings.frame}` : "",
    surfaceSettings.controls ? `profile-customization--controls-${surfaceSettings.controls}` : "",
    surfaceSettings.wave ? `profile-customization--wave-${surfaceSettings.wave}` : "",
    surfaceSettings.motion ? `profile-customization--motion-${surfaceSettings.motion}` : "",
  ].filter(Boolean).join(" ");
};

export function normalizeBannedAccount(source) {
  const payload = source?.user && typeof source.user === "object" ? source.user : source;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const isBanned = payload.code === "account_banned" || Boolean(payload.is_banned ?? payload.isBanned);
  if (!isBanned) {
    return null;
  }

  const firstName = String(payload.first_name ?? payload.firstName ?? "").trim();
  const lastName = String(payload.last_name ?? payload.lastName ?? "").trim();
  const nickname = String(payload.nickname ?? payload.name ?? "").trim();
  const email = String(payload.email ?? "").trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || nickname || email || "Пользователь";

  return {
    id: payload.id ?? "",
    firstName,
    lastName,
    nickname,
    email,
    displayName,
    isBanned: true,
    is_banned: true,
    bannedAt: payload.banned_at ?? payload.bannedAt ?? "",
    banned_at: payload.banned_at ?? payload.bannedAt ?? "",
    banReason: payload.ban_reason ?? payload.banReason ?? "",
    ban_reason: payload.ban_reason ?? payload.banReason ?? "",
    avatarUrl: payload.avatar_url ?? payload.avatarUrl ?? payload.avatar ?? "",
    avatar: payload.avatar_url ?? payload.avatarUrl ?? payload.avatar ?? "",
    avatarFrame: payload.avatar_frame ?? payload.avatarFrame ?? null,
    avatar_frame: payload.avatar_frame ?? payload.avatarFrame ?? null,
    profileBackgroundUrl: payload.profile_background_url ?? payload.profileBackgroundUrl ?? "",
    profile_background_url: payload.profile_background_url ?? payload.profileBackgroundUrl ?? "",
  };
}

export function formatBannedAt(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

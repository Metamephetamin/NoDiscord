import { API_URL } from "../../config/runtime";
import { normalizeScriptAwareNicknameInput } from "../../utils/nameScripts";
import { getCanonicalSharedServerId } from "../../utils/menuMainModel";

export const MAX_PROFILE_NICKNAME_LENGTH = 50;
export const DEVICE_SESSION_REFRESH_TOKEN_HEADER = "X-Refresh-Token";
export const EMPTY_ARRAY = Object.freeze([]);
const MAX_DEVICE_VOLUME_PERCENT = 200;

export const normalizeProfileNicknameInput = (value) =>
  normalizeScriptAwareNicknameInput(value, MAX_PROFILE_NICKNAME_LENGTH);

export const getServerSyncFingerprint = (server) => {
  if (!server?.id) {
    return "";
  }

  return JSON.stringify({
    id: server.id,
    name: server.name,
    description: server.description,
    icon: server.icon,
    iconFrame: server.iconFrame,
    isShared: Boolean(server.isShared),
    ownerId: server.ownerId,
    roles: server.roles || [],
    members: server.members || [],
    channelCategories: server.channelCategories || [],
    textChannels: server.textChannels || [],
    voiceChannels: server.voiceChannels || [],
  });
};

export const getServerSnapshotKey = (serverOrId, ownerId = "") => {
  if (serverOrId && typeof serverOrId === "object") {
    return getCanonicalSharedServerId(serverOrId.id || "", serverOrId.ownerId || ownerId);
  }

  return getCanonicalSharedServerId(String(serverOrId || ""), ownerId);
};

export const getProfileFullName = (profile) => {
  const firstName = String(profile?.firstName || profile?.first_name || "").trim();
  const lastName = String(profile?.lastName || profile?.last_name || "").trim();
  return `${firstName} ${lastName}`.trim();
};

export const clampDeviceVolumePercent = (value, fallback = 100) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(MAX_DEVICE_VOLUME_PERCENT, Math.round(numericValue)));
};

const withListOrder = (items = []) => items.map((item, index) => ({ ...item, order: index }));

export const reorderById = (items = [], sourceId, targetId) => {
  const sourceIndex = items.findIndex((item) => String(item?.id || "") === String(sourceId || ""));
  const targetIndex = items.findIndex((item) => String(item?.id || "") === String(targetId || ""));
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, movedItem);
  return withListOrder(nextItems);
};

const normalizeChannelCategoryId = (categoryId) => String(categoryId || "");

export const moveChannelInList = (channels = [], { channelId, targetChannelId = "", targetCategoryId = "", placement = "before" } = {}) => {
  const normalizedChannelId = String(channelId || "");
  const normalizedTargetChannelId = String(targetChannelId || "");
  const normalizedTargetCategoryId = normalizeChannelCategoryId(targetCategoryId);
  const shouldInsertAfterTarget = String(placement || "before") === "after";
  const sourceIndex = channels.findIndex((channel) => String(channel?.id || "") === normalizedChannelId);
  if (sourceIndex === -1) {
    return channels;
  }

  const nextChannels = [...channels];
  const [sourceChannel] = nextChannels.splice(sourceIndex, 1);
  const movedChannel = { ...sourceChannel, categoryId: normalizedTargetCategoryId };
  let insertIndex = -1;

  if (normalizedTargetChannelId) {
    insertIndex = nextChannels.findIndex((channel) => String(channel?.id || "") === normalizedTargetChannelId);
    if (insertIndex !== -1 && shouldInsertAfterTarget) {
      insertIndex += 1;
    }
  }

  if (insertIndex === -1) {
    insertIndex = nextChannels.length;
    for (let index = nextChannels.length - 1; index >= 0; index -= 1) {
      if (normalizeChannelCategoryId(nextChannels[index]?.categoryId) === normalizedTargetCategoryId) {
        insertIndex = index + 1;
        break;
      }
    }
  }

  nextChannels.splice(insertIndex, 0, movedChannel);

  const categoryOrder = new Map();
  return nextChannels.map((channel) => {
    const categoryKey = normalizeChannelCategoryId(channel.categoryId);
    const order = categoryOrder.get(categoryKey) || 0;
    categoryOrder.set(categoryKey, order + 1);
    return { ...channel, order };
  });
};

export const parseQrLoginPayload = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(rawValue, typeof window !== "undefined" ? window.location.origin : API_URL);
    const sessionId = String(url.searchParams.get("sid") || "").trim();
    const scannerToken = String(url.searchParams.get("token") || "").trim();
    return sessionId && scannerToken ? { sessionId, scannerToken } : null;
  } catch {
    return null;
  }
};

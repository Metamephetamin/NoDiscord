import { API_URL } from "../../config/runtime";
import {
  getActiveServerStorageKey,
  getActiveTextChannelStorageKey,
  getAudioInputDeviceStorageKey,
  getAudioOutputDeviceStorageKey,
  getConversationNotificationsStorageKey,
  getCurrentUserId,
  getDirectNotificationsStorageKey,
  getEchoCancellationStorageKey,
  getNoiseSuppressionStorageKey,
  getNotificationSoundCustomDataStorageKey,
  getNotificationSoundCustomNameStorageKey,
  getNotificationSoundEnabledStorageKey,
  getNotificationSoundStorageKey,
  getServerNotificationsStorageKey,
  getServersStorageKey,
  getVideoInputDeviceStorageKey,
  readStoredServers,
} from "../../utils/menuMainModel";
import {
  getDirectMessageReceiveSoundStorageKey,
  getDirectMessageSendSoundStorageKey,
  getDirectMessageSoundEnabledStorageKey,
} from "../../utils/directMessageSounds";

const getLocalApiStorageScope = () => {
  try {
    const parsed = new URL(String(API_URL || "").trim());
    return String(parsed.origin || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  } catch {
    return String(API_URL || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  }
};

const getUiDensityStorageKey = (user) => `nd:ui-density:${getCurrentUserId(user) || "guest"}`;
const getUiFontScaleStorageKey = (user) => `nd:ui-font-scale:${getCurrentUserId(user) || "guest"}`;
const getUiReduceMotionStorageKey = (user) => `nd:ui-reduce-motion:${getCurrentUserId(user) || "guest"}`;
const getUiTouchTargetStorageKey = (user) => `nd:ui-touch-target:${getCurrentUserId(user) || "guest"}`;

const getDirectCallHistoryStorageKey = (user) => {
  const userId = String(user?.id || user?.email || "").trim();
  return userId ? `nd:direct-call-history:${getLocalApiStorageScope()}:${userId}` : "";
};

const getWorkspaceStateStorageKey = (user) => {
  const userId = String(user?.id || user?.email || "").trim();
  return userId ? `nd:workspace-state:${getLocalApiStorageScope()}:${userId}` : "";
};

export const readWorkspaceStateFromStorageKey = (storageKey) => {
  if (!storageKey || typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {};
    }

    return {
      workspaceMode: parsedValue.workspaceMode === "friends" ? "friends" : parsedValue.workspaceMode === "servers" ? "servers" : "",
      activeDirectFriendId: String(parsedValue.activeDirectFriendId || ""),
      activeConversationId: String(parsedValue.activeConversationId || ""),
      friendsPageSection: parsedValue.friendsPageSection === "conversations" ? "conversations" : "friends",
      activeServerId: String(parsedValue.activeServerId || ""),
      currentTextChannelId: String(parsedValue.currentTextChannelId || ""),
      desktopServerPane: parsedValue.desktopServerPane === "voice" ? "voice" : "text",
      mobileSection: ["servers", "friends", "profile"].includes(parsedValue.mobileSection) ? parsedValue.mobileSection : "",
      mobileServersPane: ["channels", "chat", "voice"].includes(parsedValue.mobileServersPane) ? parsedValue.mobileServersPane : "",
    };
  } catch {
    return {};
  }
};

export const readWorkspaceState = (user) => readWorkspaceStateFromStorageKey(getWorkspaceStateStorageKey(user));

export const writeWorkspaceStateToStorageKey = (storageKey, state) => {
  if (!storageKey || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      workspaceMode: state?.workspaceMode === "friends" ? "friends" : "servers",
      activeDirectFriendId: String(state?.activeDirectFriendId || ""),
      activeConversationId: String(state?.activeConversationId || ""),
      friendsPageSection: state?.friendsPageSection === "conversations" ? "conversations" : "friends",
      activeServerId: String(state?.activeServerId || ""),
      currentTextChannelId: String(state?.currentTextChannelId || ""),
      desktopServerPane: state?.desktopServerPane === "voice" ? "voice" : "text",
      mobileSection: ["servers", "friends", "profile"].includes(state?.mobileSection) ? state.mobileSection : "servers",
      mobileServersPane: ["channels", "chat", "voice"].includes(state?.mobileServersPane) ? state.mobileServersPane : "channels",
      updatedAt: Date.now(),
    }));
  } catch {
    // Storage can be unavailable in privacy modes; the UI still works with in-memory state.
  }
};

export const readActiveTextChannelMap = (storageKey) => {
  if (!storageKey) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getStoredTextChannelId = (storageKey, server) => {
  if (!server?.id || !Array.isArray(server?.textChannels)) {
    return "";
  }

  const storedChannelId = String(readActiveTextChannelMap(storageKey)[server.id] || "");
  return server.textChannels.some((channel) => String(channel.id) === storedChannelId)
    ? storedChannelId
    : "";
};

export const writeStoredTextChannelId = (storageKey, serverId, channelId) => {
  if (!storageKey || !serverId || !channelId) {
    return;
  }

  try {
    const nextMap = {
      ...readActiveTextChannelMap(storageKey),
      [serverId]: String(channelId),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(nextMap));
  } catch {
    // Text channel restore is a convenience only.
  }
};

export const getInitialTextChannelId = (user) => {
  const storedServers = readStoredServers(user);
  const activeServerId = window.localStorage.getItem(getActiveServerStorageKey(user)) || storedServers[0]?.id || "";
  const activeServer = storedServers.find((server) => server.id === activeServerId) || storedServers[0] || null;
  return getStoredTextChannelId(getActiveTextChannelStorageKey(user), activeServer) || activeServer?.textChannels?.[0]?.id || "";
};

export function useMenuMainStorageKeys(user) {
  return {
    serversStorageKey: getServersStorageKey(user),
    activeServerStorageKey: getActiveServerStorageKey(user),
    activeTextChannelStorageKey: getActiveTextChannelStorageKey(user),
    noiseSuppressionStorageKey: getNoiseSuppressionStorageKey(user),
    echoCancellationStorageKey: getEchoCancellationStorageKey(user),
    directNotificationsStorageKey: getDirectNotificationsStorageKey(user),
    conversationNotificationsStorageKey: getConversationNotificationsStorageKey(user),
    serverNotificationsStorageKey: getServerNotificationsStorageKey(user),
    directMessageSoundEnabledStorageKey: getDirectMessageSoundEnabledStorageKey(user),
    directMessageSendSoundStorageKey: getDirectMessageSendSoundStorageKey(user),
    directMessageReceiveSoundStorageKey: getDirectMessageReceiveSoundStorageKey(user),
    notificationSoundEnabledStorageKey: getNotificationSoundEnabledStorageKey(user),
    notificationSoundStorageKey: getNotificationSoundStorageKey(user),
    notificationSoundCustomDataStorageKey: getNotificationSoundCustomDataStorageKey(user),
    notificationSoundCustomNameStorageKey: getNotificationSoundCustomNameStorageKey(user),
    audioInputDeviceStorageKey: getAudioInputDeviceStorageKey(user),
    audioOutputDeviceStorageKey: getAudioOutputDeviceStorageKey(user),
    videoInputDeviceStorageKey: getVideoInputDeviceStorageKey(user),
    currentUserId: getCurrentUserId(user),
    directCallHistoryStorageKey: getDirectCallHistoryStorageKey(user),
    workspaceStateStorageKey: getWorkspaceStateStorageKey(user),
    uiDensityStorageKey: getUiDensityStorageKey(user),
    uiFontScaleStorageKey: getUiFontScaleStorageKey(user),
    uiReduceMotionStorageKey: getUiReduceMotionStorageKey(user),
    uiTouchTargetStorageKey: getUiTouchTargetStorageKey(user),
  };
}

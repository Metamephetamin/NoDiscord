import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import VoiceChannelList from "../../components/VoiceChannelList";
import TextChat from "../../components/TextChat";
import TextChatProfileModal from "../../components/TextChatProfileModal";
import TextChatUserContextMenu from "../../components/TextChatUserContextMenu";
import ServerRailContextLayer from "../../components/ServerRailContextLayer";
import {
  DesktopServerRail,
  MobileDirectChat,
  MobileServerStrip,
  ServerMain,
  ServersSidebar,
} from "../../components/ServerWorkspace";
import chatConnection, { startChatConnection } from "../../SignalR/ChatConnect";
import "../../css/MenuMain.css";
import "../../css/MenuProfile.css";
import "../../css/ListChannels.css";
import { API_BASE_URL, API_URL } from "../../config/runtime";
import {
  authFetch,
  getApiErrorMessage,
  getStoredAccessTokenExpiresAt,
  getStoredRefreshToken,
  getStoredToken,
  isUnauthorizedError,
  parseApiResponse,
  storeSession,
} from "../../utils/auth";
import { copyTextToClipboard } from "../../utils/clipboard";
import { getChatDraftUpdatedEventName, hasChatDraft } from "../../utils/chatDrafts";
import { buildDirectMessageChannelId } from "../../utils/directMessageChannels";
import { isDirectCallChannelId } from "../../utils/directCallModel";
import { isUserMentioned } from "../../utils/messageMentions";
import { sendMessagesCompat as sendMessagesCompatCore } from "../../utils/textChatSendCompat";
import {
  areNamesUsingSameScript,
  detectNameScript,
  isNicknameUsingSingleScript,
  normalizeSingleWordNameInput,
} from "../../utils/nameScripts";
import {
  clearCachedTextChatMessages,
  readCachedTextChatMessages,
  writeTextChatChannelClearedAt,
} from "../../utils/textChatMessageCache";
import {
  createDefaultProfileCustomization,
  getUserProfileCustomization,
  normalizeProfileCustomization,
  readProfileCustomization,
  writeProfileCustomization,
} from "../../utils/profileCustomization";
import { SCREEN_SHARE_ALLOWED_FPS } from "../../webrtc/voiceClientUtils";
import { buildStreamDiagnostics } from "../../webrtc/streamDiagnostics.mjs";
import useFriendsWorkspaceState from "../../hooks/useFriendsWorkspaceState";
import useServerInviteActions from "../../hooks/useServerInviteActions";
import useTransientScrollbars from "../../hooks/useTransientScrollbars";
import useVoiceRoomWarmup from "../../hooks/useVoiceRoomWarmup";
import useMenuMainAudioDevices from "./useMenuMainAudioDevices";
import useMenuMainCameraPreview from "./useMenuMainCameraPreview";
import useMenuMainChannelActions from "./useMenuMainChannelActions";
import useMenuMainDirectCalls from "./useMenuMainDirectCalls";
import useMenuMainDirectCallHistory from "./useMenuMainDirectCallHistory";
import useMenuMainDirectCallLifecycle from "./useMenuMainDirectCallLifecycle";
import useMenuMainIntegrations from "./useMenuMainIntegrations";
import useMenuMainKeyboardShortcuts from "./useMenuMainKeyboardShortcuts";
import useMenuMainLocalShareActions from "./useMenuMainLocalShareActions";
import useMenuMainMediaFrameActions from "./useMenuMainMediaFrameActions";
import useMenuMainNavigation from "./useMenuMainNavigation";
import useMenuMainNotificationSound from "./useMenuMainNotificationSound";
import useMenuMainQrScanner from "./useMenuMainQrScanner";
import useMenuMainSelfVoiceStateSync from "./useMenuMainSelfVoiceStateSync";
import useMenuMainServerInviteFlow, { useMenuMainServerInvitePermissions } from "./useMenuMainServerInviteFlow";
import useMenuMainTotpSettings from "./useMenuMainTotpSettings";
import useMenuMainVoiceProcessing from "./useMenuMainVoiceProcessing";
import useStableEvent from "./useStableEvent";
import MenuMainProfilePanelSlot from "./MenuMainProfilePanelSlot";
import MenuMainOverlayLayer from "./MenuMainOverlayLayer";
import MenuMainMobileLayout from "./MenuMainMobileLayout";
import {
  getInitialTextChannelId,
  getStoredTextChannelId,
  readWorkspaceState,
  useMenuMainStorageKeys,
  writeStoredTextChannelId,
} from "./menuMainWorkspaceStorage";
import {
  buildDirectCallState,
  createDirectCallState,
  getDirectCallConnectionQuality,
  normalizeMeasuredPingMs,
} from "./menuMainDirectCallState";
import {
  areObjectArraysEqual,
  areParticipantMapsEqual,
  areRemoteScreenSharesEqual,
  areStringArraysEqual,
  normalizeMicLevel,
} from "./menuMainRealtimeComparators";
import { buildMenuMainQuickSwitcherItems } from "./menuMainQuickSwitcher";
import { buildActiveContacts } from "./menuMainActiveContacts";
import {
  EMPTY_ARRAY,
  MAX_PROFILE_NICKNAME_LENGTH,
  clampDeviceVolumePercent,
  getProfileFullName,
  getServerSnapshotKey,
  getServerSyncFingerprint,
  normalizeProfileNicknameInput,
} from "./menuMainControllerUtils";
import {
  DEFAULT_SERVER_ICON,
  resolveMediaUrl,
} from "../../utils/media";
import { getDisplayCaptureSupportInfo } from "../../utils/browserMediaSupport";
import {
  getDefaultMediaFrame,
  parseMediaFrame,
  serializeMediaFrame,
} from "../../utils/mediaFrames";

import {
  CAMERA_ICON_URL,
  canAssignRoleToMember,
  canManageTargetMember,
  createDirectToastId,
  createId,
  createServer,
  createServerToastId,
  FRIENDS_SIDEBAR_ITEMS,
  getActiveServerStorageKey,
  getCanonicalSharedServerId,
  getChannelDisplayName,
  getDisplayName,
  getFriendSearchModeForQuery,
  getMeterActiveBars,
  getPingTone,
  getScopedChatChannelId,
  getScopedVoiceChannelId,
  getServerIconFrame,
  getUserAvatar,
  getUserAvatarFrame,
  getUserProfileBackground,
  getUserProfileBackgroundFrame,
  hasServerPermission,
  HEADPHONES_ICON_URL,
  isPersonalDefaultServer,
  isServerOwnedByUser,
  isValidProfileName,
  MAX_PROFILE_NAME_LENGTH,
  DEFAULT_VOICE_INPUT_MODE,
  mergePersistedServers,
  MICROPHONE_ICON_URL,
  MOBILE_VIEWPORT_QUERY,
  MONITOR_ICON_URL,
  normalizeFriend,
  normalizeServers,
  normalizeTextChannelName,
  parseServerChatChannelId,
  PENCIL_ICON_URL,
  PHONE_ICON_URL,
  readStoredServers,
  resolveIncomingMessagePreview,
  SEARCH_ICON_URL,
  SETTINGS_ICON_URL,
  SETTINGS_NAV_ITEMS,
  SMS_ICON_URL,
  STREAM_FPS_OPTIONS,
  STREAM_RESOLUTION_OPTIONS,
  UI_SOUND_PATHS,
  uiSoundCache,
  VOICE_INPUT_MODES,
} from "../../utils/menuMainModel";
import { finishPerfTrace, finishPerfTraceOnNextFrame, startPerfTrace } from "../../utils/perf";
import { recoverChunkImport } from "../../utils/chunkLoadRecovery";

const SHOW_DIRECT_CALL_IN_TITLEBAR = false;
const SETTINGS_NAV_SECTIONS = SETTINGS_NAV_ITEMS.reduce((sections, item) => {
  if (!sections[item.section]) {
    sections[item.section] = [];
  }

  sections[item.section].push(item);
  return sections;
}, {});

const getAllowedStreamFps = (resolution) => SCREEN_SHARE_ALLOWED_FPS[resolution] || SCREEN_SHARE_ALLOWED_FPS["1080p"] || [30];
const normalizeStreamFpsForResolution = (value, resolution) => {
  const allowedFps = getAllowedStreamFps(resolution);
  const requestedFps = Math.round(Number(value) || allowedFps[0] || 30);
  return allowedFps.includes(requestedFps) ? requestedFps : allowedFps[0] || 30;
};
const getValidDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const pluralRu = (value, one, few, many) => {
  const number = Math.abs(Number(value) || 0);
  const mod10 = number % 10;
  const mod100 = number % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
};
const formatCountLabel = (value, zeroLabel, one, few, many) => {
  const count = Math.max(0, Number(value) || 0);
  if (count === 0) {
    return zeroLabel;
  }

  return `${count} ${pluralRu(count, one, few, many)}`;
};
const formatKnownSinceLabel = (value) => {
  const date = getValidDate(value);
  if (!date) {
    return "Неизвестно";
  }

  const now = new Date();
  const options = date.getFullYear() === now.getFullYear()
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };

  return `с ${date.toLocaleDateString("ru-RU", options)}`;
};
const formatLastDialogLabel = (value) => {
  const date = getValidDate(value);
  if (!date) {
    return "Сообщений нет";
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "только что";
  }

  if (diffMs < hour) {
    const minutes = Math.floor(diffMs / minute);
    return `${minutes} ${pluralRu(minutes, "минуту", "минуты", "минут")} назад`;
  }

  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `${hours} ${pluralRu(hours, "час", "часа", "часов")} назад`;
  }

  const days = Math.floor(diffMs / day);
  if (days === 1) {
    return "вчера";
  }

  if (days < 31) {
    return `${days} ${pluralRu(days, "день", "дня", "дней")} назад`;
  }

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
};
const getLatestCachedMessageAt = (currentUserId, channelId) => {
  if (!currentUserId || !channelId) {
    return "";
  }

  let latestTimestamp = 0;
  readCachedTextChatMessages(currentUserId, channelId).forEach((messageItem) => {
    const date = getValidDate(messageItem?.timestamp || messageItem?.Timestamp || messageItem?.createdAt || messageItem?.CreatedAt);
    if (date && date.getTime() > latestTimestamp) {
      latestTimestamp = date.getTime();
    }
  });

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : "";
};
const getLatestProfileDialogAt = (currentUserId, friend, directChannelId) => {
  const backendDate = getValidDate(friend?.lastDirectMessageAt || friend?.last_direct_message_at);
  const cachedDate = getValidDate(getLatestCachedMessageAt(currentUserId, directChannelId));

  if (backendDate && cachedDate) {
    return backendDate.getTime() >= cachedDate.getTime() ? backendDate.toISOString() : cachedDate.toISOString();
  }

  return backendDate?.toISOString() || cachedDate?.toISOString() || "";
};
let voiceRoomClientFactoryPromise = null;
const MenuMainSettingsContent = lazy(() =>
  recoverChunkImport(() => import("./MenuMainSettingsRenderer").then((module) => ({ default: module.MenuMainSettingsContent })))
);
const MenuMainMobileSettingsShell = lazy(() =>
  recoverChunkImport(() => import("./MenuMainSettingsRenderer").then((module) => ({ default: module.MenuMainMobileSettingsShell })))
);
const FriendsSidebar = lazy(() =>
  recoverChunkImport(() => import("../../components/FriendsWorkspace").then((module) => ({ default: module.FriendsSidebar })))
);
const FriendsMain = lazy(() =>
  recoverChunkImport(() => import("../../components/FriendsWorkspace").then((module) => ({ default: module.FriendsMain })))
);
const MobileProfileScreen = lazy(() => recoverChunkImport(() => import("../../components/MobileProfileScreen")));
const MobileVoiceRoom = lazy(() => recoverChunkImport(() => import("../../components/MobileVoiceRoom")));

const settingsContentFallback = (
  <div className="settings-panel settings-panel--loading" aria-busy="true">
    Загрузка...
  </div>
);
const friendsWorkspaceFallback = (
  <div className="friends-workspace__loading" aria-busy="true">
    Загрузка...
  </div>
);
const coldPanelFallback = (
  <div className="menu-main__lazy-loading" aria-busy="true">
    Загрузка...
  </div>
);

const getFriendRelationsStorageKey = (userId) => `tend:friend-relations:${String(userId || "guest").trim() || "guest"}`;

function normalizeRelationIds(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function readFriendRelations(userId) {
  if (typeof window === "undefined") {
    return { ignoredIds: [], blockedIds: [] };
  }

  try {
    const parsedValue = JSON.parse(window.localStorage.getItem(getFriendRelationsStorageKey(userId)) || "{}");
    return {
      ignoredIds: normalizeRelationIds(parsedValue?.ignoredIds),
      blockedIds: normalizeRelationIds(parsedValue?.blockedIds),
    };
  } catch {
    return { ignoredIds: [], blockedIds: [] };
  }
}

function writeFriendRelations(userId, nextRelations) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getFriendRelationsStorageKey(userId), JSON.stringify({
      ignoredIds: normalizeRelationIds(nextRelations?.ignoredIds),
      blockedIds: normalizeRelationIds(nextRelations?.blockedIds),
    }));
  } catch {
    // Local relationship flags are optional UI state.
  }
}

async function requestFriendBlockState(targetUserId, shouldBlock) {
  const response = await authFetch(`${API_BASE_URL}/friends/${encodeURIComponent(String(targetUserId))}/block`, {
    method: shouldBlock ? "POST" : "DELETE",
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, shouldBlock ? "Не удалось заблокировать пользователя." : "Не удалось разблокировать пользователя."));
  }

  return {
    isBlocked: Boolean(data?.isBlocked ?? data?.is_blocked),
    blockedYou: Boolean(data?.blockedYou ?? data?.blocked_you),
  };
}

function loadVoiceRoomClientFactory() {
  if (!voiceRoomClientFactoryPromise) {
    voiceRoomClientFactoryPromise = recoverChunkImport(() => import("../../webrtc/voiceRoomClient"))
      .then((module) => module.createVoiceRoomClient);
  }

  return voiceRoomClientFactoryPromise;
}

export default function MenuMain({
  user,
  setUser,
  onLogout,
  pendingImportedServer = null,
  onPendingImportedServerHandled,
}) {
  const [servers, setServers] = useState(() => readStoredServers(user));
  const latestServersRef = useRef(servers);
  const pendingServerSyncFingerprintsRef = useRef(new Map());
  const [activeServerId, setActiveServerId] = useState(
    () => readWorkspaceState(user).activeServerId || localStorage.getItem(getActiveServerStorageKey(user)) || readStoredServers(user)[0]?.id || ""
  );
  const [currentTextChannelId, setCurrentTextChannelId] = useState(() => readWorkspaceState(user).currentTextChannelId || getInitialTextChannelId(user));
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState(null);
  const [selectedVoiceChannelId, setSelectedVoiceChannelId] = useState("");
  const [joiningVoiceChannelId, setJoiningVoiceChannelId] = useState("");
  const [directCallState, setDirectCallState] = useState(() => createDirectCallState());
  const [desktopServerPane, setDesktopServerPane] = useState(() => readWorkspaceState(user).desktopServerPane || "text");
  const [participantsMap, setParticipantsMap] = useState({});
  const [roomVoiceParticipants, setRoomVoiceParticipants] = useState({ channel: "", participants: [] });
  const [openSettings, setOpenSettings] = useState(false);
  const [profileCustomization, setProfileCustomization] = useState(() => readProfileCustomization(user));
  const [micVolume, setMicVolume] = useState(70);
  const [audioVolume, setAudioVolume] = useState(100);
  const [micLevel, setMicLevel] = useState(0);
  const [showNoiseMenu, setShowNoiseMenu] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [screenShareError, setScreenShareError] = useState("");
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [createServerName, setCreateServerName] = useState("");
  const [createServerIcon, setCreateServerIcon] = useState("");
  const [createServerIconFrame, setCreateServerIconFrame] = useState(() => getDefaultMediaFrame());
  const [createServerError, setCreateServerError] = useState("");
  const [resolution, setResolution] = useState("1080p");
  const [fps, setFps] = useState(60);
  const [shareStreamAudio, setShareStreamAudio] = useState(false);
  const [remoteScreenShares, setRemoteScreenShares] = useState([]);
  const [announcedLiveUserIds, setAnnouncedLiveUserIds] = useState([]);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [localLiveShareMode, setLocalLiveShareMode] = useState("");
  const [localSharePreview, setLocalSharePreview] = useState({ stream: null, mode: "" });
  const [isLocalSharePreviewVisible, setIsLocalSharePreviewVisible] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [isMicForced, setIsMicForced] = useState(false);
  const [isSoundForced, setIsSoundForced] = useState(false);
  const [pingMs, setPingMs] = useState(null);
  const [voicePingMs, setVoicePingMs] = useState(null);
  const [voiceRouteSnapshot, setVoiceRouteSnapshot] = useState(null);
  const [selectedStreamUserId, setSelectedStreamUserId] = useState(null);
  const [speakingUserIds, setSpeakingUserIds] = useState([]);
  const [showServerMembersPanel, setShowServerMembersPanel] = useState(false);
  const [memberRoleMenu, setMemberRoleMenu] = useState(null);
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [friendListUserContextMenu, setFriendListUserContextMenu] = useState(null);
  const [friendListProfileModal, setFriendListProfileModal] = useState(null);
  const [rolesExpanded, setRolesExpanded] = useState(false);
  const [channelRenameState, setChannelRenameState] = useState(null);
  const [activeDirectFriendId, setActiveDirectFriendId] = useState(() => readWorkspaceState(user).activeDirectFriendId || "");
  const [directNotificationsEnabled, setDirectNotificationsEnabled] = useState(true);
  const [conversationNotificationsEnabled, setConversationNotificationsEnabled] = useState(true);
  const [directMessageToasts, setDirectMessageToasts] = useState([]);
  const [serverNotificationsEnabled, setServerNotificationsEnabled] = useState(true);
  const [serverMessageToasts, setServerMessageToasts] = useState([]);
  const [workspaceStatusToasts, setWorkspaceStatusToasts] = useState([]);
  const [directUnreadCounts, setDirectUnreadCounts] = useState({});
  const [serverUnreadCounts, setServerUnreadCounts] = useState({});
  const [chatDraftPresence, setChatDraftPresence] = useState({});
  const [textChatLocalStateVersion, setTextChatLocalStateVersion] = useState(0);
  const [workspaceMode, setWorkspaceMode] = useState(() => readWorkspaceState(user).workspaceMode || "servers");
  const [friendsPageSection, setFriendsPageSection] = useState(() => readWorkspaceState(user).friendsPageSection || "friends");
  const [activeConversationId, setActiveConversationId] = useState(() => readWorkspaceState(user).activeConversationId || "");
  const [friendsSidebarQuery, setFriendsSidebarQuery] = useState("");
  const {
    friends,
    friendEmail,
    friendLookupResults,
    friendLookupLoading,
    friendLookupPerformed,
    friendsError,
    friendActionStatus,
    isAddingFriend,
    incomingFriendRequests,
    friendRequestsLoading,
    friendRequestsError,
    friendRequestActionId,
    conversations,
    conversationsLoading,
    conversationsError,
    conversationActionLoading,
    conversationActionStatus,
    setFriends,
    setFriendEmail,
    setFriendsError,
    setFriendActionStatus,
    setConversationActionStatus,
    refreshFriends,
    refreshFriendRequests,
    refreshConversations,
    rerunFriendSearch,
    updateFriendProfile,
    resetFriendsState,
    handleFriendSearchSubmit,
    handleAddFriend,
    handleFriendRequestAction,
    handleCreateConversation,
    handleUploadConversationAvatar,
    handleAddConversationMember,
    handleUpdateConversation,
    handleUpdateConversationMemberRole,
    handleRemoveConversationMember,
    handleLeaveConversation,
    handleDeleteConversation,
  } = useFriendsWorkspaceState({
    user,
    apiBaseUrl: API_BASE_URL,
    activeDirectFriendId,
    friendsPageSection,
  });
  const [settingsTab, setSettingsTab] = useState("account");
  const [channelSettingsState, setChannelSettingsState] = useState(null);
  const [autoInputSensitivity, setAutoInputSensitivity] = useState(true);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [isMicTestActive, setIsMicTestActive] = useState(false);
  const [showSoundMenu, setShowSoundMenu] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState("");
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState("");
  const [quickSwitcherSelectedIndex, setQuickSwitcherSelectedIndex] = useState(0);
  const [textChatNavigationIndex, setTextChatNavigationIndex] = useState(null);
  const [textChatNavigationRequest, setTextChatNavigationRequest] = useState(null);
  const [chatSyncTick, setChatSyncTick] = useState(0);
  const [profileDraft, setProfileDraft] = useState({
    firstName: user?.first_name || user?.firstName || "",
    lastName: user?.last_name || user?.lastName || "",
    nickname: user?.nickname || "",
    email: user?.email || "",
    profileBackgroundUrl: getUserProfileBackground(user),
    profileBackgroundFrame: getUserProfileBackgroundFrame(user),
  });
  const [profileStatus, setProfileStatus] = useState("");
  const [emailChangeState, setEmailChangeState] = useState({
    email: user?.email || "",
    verificationToken: "",
    code: "",
    totpCode: "",
    status: "",
    isBusy: false,
    awaitingCode: false,
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  });
  const [mobileSection, setMobileSection] = useState(() => readWorkspaceState(user).mobileSection || "servers");
  const [mobileServersPane, setMobileServersPane] = useState(() => readWorkspaceState(user).mobileServersPane || "channels");
  const [uiDensity, setUiDensity] = useState("standard");
  const [uiFontScale, setUiFontScale] = useState("md");
  const [uiReduceMotion, setUiReduceMotion] = useState(false);
  const [uiTouchTargetSize, setUiTouchTargetSize] = useState("standard");

  const popupRef = useRef(null);
  const serverMembersRef = useRef(null);
  const memberRoleMenuRef = useRef(null);
  const serverContextMenuRef = useRef(null);
  const friendListUserContextMenuRef = useRef(null);
  const noiseMenuRef = useRef(null);
  const micMenuRef = useRef(null);
  const soundMenuRef = useRef(null);
  const mobileVoiceStageShellRef = useRef(null);
  const mobileVoiceStageVideoRef = useRef(null);
  const mobileVoiceStageImageRef = useRef(null);
  const voiceJoinAttemptRef = useRef(0);
  const voiceJoinInFlightRef = useRef(false);
  const pendingVoiceChannelTargetRef = useRef("");
  const suppressedVoiceChannelRef = useRef("");
  const directCallStateRef = useRef(createDirectCallState());
  const currentVoiceChannelRef = useRef(null);
  const voiceClientRef = useRef(null);
  const initializeVoiceClientRef = useRef(null);
  const voiceClientInitPromiseRef = useRef(null);
  const previousVoiceChannelRef = useRef(null);
  const voiceTransitionSoundTimeoutRef = useRef(null);
  const screenShareStartToneTimeoutRef = useRef(null);
  const previousMicMutedRef = useRef(null);
  const previousSoundMutedRef = useRef(null);
  const pendingLocalVoiceTransitionRef = useRef(null);
  const pendingLocalMicToneRef = useRef("");
  const pendingLocalSoundToneRef = useRef("");
  const pendingLocalScreenShareToneRef = useRef("");
  const previousVoiceParticipantIdsRef = useRef({ channelId: "", participantIds: [] });
  const previousLiveVoiceUserIdsRef = useRef({ channelId: "", userIds: [] });
  const joinedDirectChannelsRef = useRef(new Set());
  const joinedServerNotificationChannelsRef = useRef(new Set());
  const hasBoundChatReconnectHandlerRef = useRef(false);
  const userSessionActiveRef = useRef(false);
  const directToastTimeoutsRef = useRef(new Map());
  const serverToastTimeoutsRef = useRef(new Map());
  const workspaceStatusToastTimeoutsRef = useRef(new Map());
  const serverLongPressTimeoutRef = useRef(null);
  const serverLongPressTriggeredRef = useRef(false);
  const suppressedServerClickRef = useRef("");
  const micLevelUiActiveRef = useRef(false);
  const lastServerSyncFingerprintRef = useRef("");
  const leaveVoiceChannelRef = useRef(null);

  useTransientScrollbars();

  const requestLeaveVoiceChannel = useCallback(() => {
    if (!leaveVoiceChannelRef.current) {
      return Promise.resolve();
    }

    return leaveVoiceChannelRef.current();
  }, []);

  const {
    serversStorageKey,
    activeServerStorageKey,
    activeTextChannelStorageKey,
    noiseSuppressionStorageKey,
    echoCancellationStorageKey,
    directNotificationsStorageKey,
    conversationNotificationsStorageKey,
    serverNotificationsStorageKey,
    directMessageSoundEnabledStorageKey,
    directMessageSendSoundStorageKey,
    directMessageReceiveSoundStorageKey,
    notificationSoundEnabledStorageKey,
    notificationSoundStorageKey,
    notificationSoundCustomDataStorageKey,
    notificationSoundCustomNameStorageKey,
    audioInputDeviceStorageKey,
    audioOutputDeviceStorageKey,
    videoInputDeviceStorageKey,
    currentUserId,
    directCallHistoryStorageKey,
    workspaceStateStorageKey,
    uiDensityStorageKey,
    uiFontScaleStorageKey,
    uiReduceMotionStorageKey,
    uiTouchTargetStorageKey,
  } = useMenuMainStorageKeys(user);
  const [friendRelations, setFriendRelations] = useState(() => readFriendRelations(currentUserId));
  const {
    notificationSoundEnabled,
    setNotificationSoundEnabled,
    notificationSoundId,
    setNotificationSoundId,
    notificationSoundOptions,
    customNotificationSoundData,
    setCustomNotificationSoundData,
    customNotificationSoundName,
    setCustomNotificationSoundName,
    notificationSoundError,
    setNotificationSoundError,
    notificationSoundInputRef,
    directMessageSoundEnabled,
    setDirectMessageSoundEnabled,
    directMessageSendSoundId,
    setDirectMessageSendSoundId,
    directMessageReceiveSoundId,
    setDirectMessageReceiveSoundId,
    handleCustomNotificationSoundChange,
    playNotificationSound,
    playDirectMessageReceiveSound,
  } = useMenuMainNotificationSound({
    user,
    directMessageSoundEnabledStorageKey,
    directMessageSendSoundStorageKey,
    directMessageReceiveSoundStorageKey,
    notificationSoundEnabledStorageKey,
    notificationSoundStorageKey,
    notificationSoundCustomDataStorageKey,
    notificationSoundCustomNameStorageKey,
  });
  const {
    deviceSessions,
    deviceSessionsLoading,
    deviceSessionsError,
    refreshDeviceSessions,
    integrations,
    integrationsLoading,
    integrationsStatus,
    integrationActionBusy,
    handleConnectIntegration,
    handleDisconnectIntegration,
    handleToggleIntegrationSetting,
  } = useMenuMainIntegrations({
    user,
    setUser,
    openSettings,
    settingsTab,
    currentUserId,
    updateFriendProfile,
  });
  const {
    cameraDevices,
    selectedVideoDeviceId,
    setSelectedVideoDeviceId,
    cameraError,
    setCameraError,
    hasCameraPreview,
    cameraPreviewRef,
    loadCameraDevices,
    startCameraPreview,
    stopCameraPreview,
    resetCameraPreviewState,
  } = useMenuMainCameraPreview();
  const {
    audioInputDevices,
    audioOutputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    outputSelectionSupported,
    outputSelectionAvailable,
    deviceInputLabel,
    deviceOutputLabel,
    handleAudioDevicesChanged,
    applySelectedAudioDevicesToClient,
  } = useMenuMainAudioDevices({
    user,
    voiceClientRef,
    audioInputDeviceStorageKey,
    audioOutputDeviceStorageKey,
    openSettings,
    settingsTab,
    showMicMenu,
    showSoundMenu,
    isMicTestActive,
  });
  const {
    noiseProfileOptions,
    activeNoiseProfile,
    noiseSuppressionMode,
    setNoiseSuppressionMode,
    echoCancellationEnabled,
    setEchoCancellationEnabled,
    applyVoiceProcessingToClient,
  } = useMenuMainVoiceProcessing({
    user,
    voiceClientRef,
    noiseSuppressionStorageKey,
    echoCancellationStorageKey,
  });
  const {
    directCallHistory,
    appendDirectCallHistoryEntry,
  } = useMenuMainDirectCallHistory(directCallHistoryStorageKey);
  useMenuMainDirectCallLifecycle({
    directCallState,
    directCallStateRef,
    setDirectCallState,
    voiceClientRef,
    user,
  });
  const {
    flushQueuedSelfVoiceState,
    queueSelfVoiceStateSync,
  } = useMenuMainSelfVoiceStateSync({ voiceClientRef });
  const {
    isTotpEnabled,
    totpSetup,
    updateTotpCode,
    startTotpSetup,
    verifyTotpSetup,
    disableTotp,
  } = useMenuMainTotpSettings({ user, setUser });

  useEffect(() => {
    latestServersRef.current = servers;
  }, [servers]);

  const activeServer = useMemo(() => servers.find((server) => server.id === activeServerId) || servers[0] || null, [servers, activeServerId]);
  const activeServerSyncFingerprint = useMemo(() => getServerSyncFingerprint(activeServer), [activeServer]);
  const currentTextChannel = useMemo(() => activeServer?.textChannels.find((channel) => channel.id === currentTextChannelId) || activeServer?.textChannels[0] || null, [activeServer, currentTextChannelId]);
  const selectedVoiceChannel = useMemo(
    () => activeServer?.voiceChannels.find((channel) => String(channel.id) === String(selectedVoiceChannelId)) || null,
    [activeServer, selectedVoiceChannelId]
  );
  const ensureVoiceClientReady = useCallback(async () => {
    if (voiceClientRef.current) {
      return voiceClientRef.current;
    }

    if (!initializeVoiceClientRef.current) {
      return null;
    }

    if (!voiceClientInitPromiseRef.current) {
      voiceClientInitPromiseRef.current = Promise.resolve(initializeVoiceClientRef.current())
        .catch((error) => {
          logVoiceHubError("Ошибка ранней инициализации голосового клиента:", error);
          throw error;
        })
        .finally(() => {
          voiceClientInitPromiseRef.current = null;
        });
    }

    return voiceClientInitPromiseRef.current;
  }, []);
  const { prewarmVoiceChannel } = useVoiceRoomWarmup({
    voiceClientRef,
    user,
    activeServerId: activeServer?.id || "",
    voiceChannels: activeServer?.voiceChannels || EMPTY_ARRAY,
    getScopedVoiceChannelId,
    ensureVoiceClientReady,
  });
  const activeVoiceParticipantsMap = useMemo(() => {
    if (!activeServer?.id) {
      return {};
    }

    const nextMap = {};
    const shortChannelBuckets = new Map();

    Object.entries(participantsMap || {}).forEach(([channelId, participants]) => {
      if (!channelId.includes("::")) {
        nextMap[channelId] = participants;
        return;
      }

      const prefix = `${activeServer.id}::`;
      if (!channelId.startsWith(prefix)) {
        return;
      }

      const shortChannelId = channelId.slice(prefix.length);
      nextMap[channelId] = participants;
      nextMap[shortChannelId] = participants;

      const fallbackShortChannelId = channelId.split("::").slice(1).join("::");
      if (fallbackShortChannelId) {
        const bucket = shortChannelBuckets.get(fallbackShortChannelId) || [];
        bucket.push(participants);
        shortChannelBuckets.set(fallbackShortChannelId, bucket);
      }
    });

    shortChannelBuckets.forEach((participantsBuckets, shortChannelId) => {
      if (!nextMap[shortChannelId] && participantsBuckets.length === 1) {
        nextMap[shortChannelId] = participantsBuckets[0];
      }
    });

    return nextMap;
  }, [activeServer?.id, participantsMap]);
  const currentVoiceChannelName = useMemo(() => {
    if (isDirectCallChannelId(currentVoiceChannel)) {
      return "Личный звонок";
    }

    const scopedVoiceChannels = servers.flatMap((server) =>
      (server.voiceChannels || []).map((channel) => ({
        runtimeId: getScopedVoiceChannelId(server.id, channel.id),
        name: channel.name,
      }))
    );

    return scopedVoiceChannels.find((channel) => channel.runtimeId === currentVoiceChannel)?.name || currentVoiceChannel;
  }, [currentVoiceChannel, servers]);
  const memberNameByUserId = useMemo(
    () => new Map((activeServer?.members || []).map((member) => [String(member.userId), String(member.name || "").trim()])),
    [activeServer?.members]
  );
  const roleColorById = useMemo(
    () => new Map((activeServer?.roles || []).map((role) => [String(role.id), role.color || "#7b89a8"])),
    [activeServer?.roles]
  );
  const memberRoleColorByUserId = useMemo(
    () =>
      new Map(
        (activeServer?.members || []).map((member) => [
          String(member.userId),
          roleColorById.get(String(member.roleId)) || "#7b89a8",
        ])
      ),
    [activeServer?.members, roleColorById]
  );
  const currentServerMember = useMemo(() => activeServer?.members?.find((member) => String(member.userId) === String(currentUserId)) || null, [activeServer, currentUserId]);
  const currentServerRole = useMemo(() => activeServer?.roles?.find((role) => role.id === currentServerMember?.roleId) || null, [activeServer, currentServerMember?.roleId]);
  useEffect(() => {
    setFriendRelations(readFriendRelations(currentUserId));
  }, [currentUserId]);
  const ignoredFriendIds = useMemo(() => new Set(normalizeRelationIds(friendRelations.ignoredIds)), [friendRelations.ignoredIds]);
  const blockedFriendIds = useMemo(() => new Set(normalizeRelationIds(friendRelations.blockedIds)), [friendRelations.blockedIds]);
  const friendsWithRelationState = useMemo(
    () =>
      friends.map((friend) => {
        const friendId = String(friend?.id || "");
        if (!friendId) {
          return friend;
        }

        return {
          ...friend,
          isIgnored: ignoredFriendIds.has(friendId),
          isBlocked: Boolean(friend?.isBlocked || blockedFriendIds.has(friendId)),
          blockedYou: Boolean(friend?.blockedYou),
        };
      }),
    [blockedFriendIds, friends, ignoredFriendIds]
  );
  const blockedByFriendIds = useMemo(
    () => new Set(friendsWithRelationState.filter((friend) => friend?.blockedYou).map((friend) => String(friend.id || "")).filter(Boolean)),
    [friendsWithRelationState]
  );
  const updateFriendRelation = useCallback((targetUserId, updater) => {
    const normalizedUserId = String(targetUserId || "").trim();
    if (!currentUserId || !normalizedUserId || normalizedUserId === String(currentUserId)) {
      return null;
    }

    const ignoredIds = new Set(normalizeRelationIds(friendRelations.ignoredIds));
    const blockedIds = new Set(normalizeRelationIds(friendRelations.blockedIds));
    updater({ ignoredIds, blockedIds });
    const nextRelations = {
      ignoredIds: Array.from(ignoredIds),
      blockedIds: Array.from(blockedIds),
    };

    setFriendRelations(nextRelations);
    writeFriendRelations(currentUserId, nextRelations);

    return nextRelations;
  }, [currentUserId, friendRelations.blockedIds, friendRelations.ignoredIds]);
  const applyFriendBlockState = useCallback((targetUserId, blockState) => {
    const normalizedUserId = String(targetUserId || "").trim();
    if (!normalizedUserId) {
      return;
    }

    setFriends((previousFriends) =>
      previousFriends.map((friend) =>
        String(friend?.id || "") === normalizedUserId
          ? {
            ...friend,
            isBlocked: Boolean(blockState?.isBlocked),
            blockedYou: Boolean(blockState?.blockedYou ?? friend?.blockedYou),
          }
          : friend
      )
    );
  }, [setFriends]);
  const selfDirectEntry = useMemo(() => {
    if (!user || !currentUserId) {
      return null;
    }

    return normalizeFriend({
      id: currentUserId,
      first_name: user?.first_name || user?.firstName || "",
      last_name: user?.last_name || user?.lastName || "",
      nickname: user?.nickname || "",
      email: user?.email || "",
      avatar_url: user?.avatarUrl || user?.avatar || "",
      profile_customization: getUserProfileCustomization(user),
      directChannelId: buildDirectMessageChannelId(currentUserId, currentUserId),
      isSelf: true,
    });
  }, [currentUserId, user]);
  const directConversationTargets = useMemo(
    () => [
      selfDirectEntry,
      ...friendsWithRelationState.filter((friend) => !friend?.isIgnored),
    ].filter(Boolean),
    [friendsWithRelationState, selfDirectEntry]
  );
  const textChatServerMembers = useMemo(
    () => (activeServer?.members || EMPTY_ARRAY).filter((member) => {
      const memberUserId = String(member?.userId || member?.id || "").trim();
      return !memberUserId || (!blockedFriendIds.has(memberUserId) && !blockedByFriendIds.has(memberUserId));
    }),
    [activeServer?.members, blockedByFriendIds, blockedFriendIds]
  );
  useEffect(() => {
    setProfileCustomization(readProfileCustomization(user));
  }, [user?.id, user?.profileCustomization, user?.profile_customization]);
  const handleProfileCustomizationChange = useCallback((nextCustomization) => {
    const normalizedCustomization = normalizeProfileCustomization(nextCustomization);
    setProfileCustomization(normalizedCustomization);
    writeProfileCustomization(user, normalizedCustomization);
    const nextUser = user
      ? {
        ...user,
        profileCustomization: normalizedCustomization,
        profile_customization: normalizedCustomization,
      }
      : user;

    if (nextUser) {
      setUser?.(nextUser);
      void storeSession(nextUser, {
        accessToken: getStoredToken(),
        refreshToken: getStoredRefreshToken(),
        accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
      });
    }

    if (user?.id) {
      authFetch(`${API_BASE_URL}/user/profile-customization`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customization: normalizedCustomization }),
      }).catch((error) => {
        console.error("Ошибка сохранения темы профиля:", error);
        setProfileStatus(error?.message || "Не удалось сохранить тему профиля.");
      });
    }
  }, [setUser, user]);
  const handleResetProfileCustomization = useCallback(() => {
    handleProfileCustomizationChange(createDefaultProfileCustomization());
  }, [handleProfileCustomizationChange]);
  const conversationTargets = useMemo(
    () => conversations.filter(Boolean),
    [conversations]
  );
  const serverSidebarIcons = useMemo(() => ({
    pencil: PENCIL_ICON_URL,
    microphone: MICROPHONE_ICON_URL,
    headphones: HEADPHONES_ICON_URL,
    settings: SETTINGS_ICON_URL,
  }), []);
  const mobileVoiceStageIcons = useMemo(() => ({
    microphone: MICROPHONE_ICON_URL,
    headphones: HEADPHONES_ICON_URL,
    chat: SMS_ICON_URL,
    monitor: MONITOR_ICON_URL,
    camera: CAMERA_ICON_URL,
    phone: PHONE_ICON_URL,
  }), []);
  const currentDirectFriend = useMemo(
    () => directConversationTargets.find((friend) => String(friend.id) === String(activeDirectFriendId)) || null,
    [directConversationTargets, activeDirectFriendId]
  );
  const currentConversationTarget = useMemo(
    () => conversationTargets.find((conversation) => String(conversation.conversationId || conversation.id) === String(activeConversationId)) || null,
    [conversationTargets, activeConversationId]
  );
  const currentDirectChannelId = useMemo(
    () => currentDirectFriend?.directChannelId || buildDirectMessageChannelId(currentUserId, currentDirectFriend?.id),
    [currentDirectFriend?.directChannelId, currentDirectFriend?.id, currentUserId]
  );
  const currentConversationChannelId = useMemo(
    () => String(currentConversationTarget?.directChannelId || ""),
    [currentConversationTarget?.directChannelId]
  );
  const resetActiveDirectFriend = useCallback(() => {
    setActiveDirectFriendId("");
  }, []);
  const resetActiveConversation = useCallback(() => {
    setActiveConversationId("");
  }, []);
  const resetActiveFriendWorkspaceSelection = useCallback(() => {
    setActiveDirectFriendId("");
    setActiveConversationId("");
  }, []);
  const closeSelectedStream = useCallback(() => {
    setSelectedStreamUserId(null);
  }, []);
  const openDesktopTextChatPane = useCallback(() => {
    setDesktopServerPane("text");
  }, []);
  const openMobileServersChatPane = useCallback(() => {
    setMobileServersPane("chat");
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextDensity = localStorage.getItem(uiDensityStorageKey) || "standard";
    const nextFontScale = localStorage.getItem(uiFontScaleStorageKey) || "md";
    const nextReduceMotion = localStorage.getItem(uiReduceMotionStorageKey) === "true";
    const nextTouchTargetSize = localStorage.getItem(uiTouchTargetStorageKey) || "standard";

    setUiDensity(nextDensity === "compact" ? "compact" : "standard");
    setUiFontScale(["sm", "md", "lg"].includes(nextFontScale) ? nextFontScale : "md");
    setUiReduceMotion(nextReduceMotion);
    setUiTouchTargetSize(nextTouchTargetSize === "large" ? "large" : "standard");
  }, [uiDensityStorageKey, uiFontScaleStorageKey, uiReduceMotionStorageKey, uiTouchTargetStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(uiDensityStorageKey, uiDensity);
    localStorage.setItem(uiFontScaleStorageKey, uiFontScale);
    localStorage.setItem(uiReduceMotionStorageKey, String(uiReduceMotion));
    localStorage.setItem(uiTouchTargetStorageKey, uiTouchTargetSize);

    const root = document.documentElement;
    const body = document.body;
    root.dataset.uiDensity = uiDensity;
    root.dataset.uiFontScale = uiFontScale;
    root.dataset.uiReduceMotion = uiReduceMotion ? "true" : "false";
    root.dataset.uiTouchTargets = uiTouchTargetSize;
    body.dataset.uiDensity = uiDensity;
    body.dataset.uiFontScale = uiFontScale;
    body.dataset.uiReduceMotion = uiReduceMotion ? "true" : "false";
    body.dataset.uiTouchTargets = uiTouchTargetSize;
  }, [
    uiDensity,
    uiDensityStorageKey,
    uiFontScale,
    uiFontScaleStorageKey,
    uiReduceMotion,
    uiReduceMotionStorageKey,
    uiTouchTargetSize,
    uiTouchTargetStorageKey,
  ]);
  useEffect(() => {
    currentVoiceChannelRef.current = currentVoiceChannel;
  }, [currentVoiceChannel]);
  const resolvedVoicePingMs = normalizeMeasuredPingMs(voicePingMs);
  const resolvedApiPingMs = normalizeMeasuredPingMs(pingMs);
  const activeLatencyMs = resolvedVoicePingMs ?? resolvedApiPingMs;
  const streamDiagnostics = useMemo(() => buildStreamDiagnostics({
    currentVoiceChannel,
    targetFps: fps,
    voicePingMs,
    voiceRouteSnapshot,
  }), [currentVoiceChannel, fps, voicePingMs, voiceRouteSnapshot]);
  useEffect(() => {
    setDirectCallState((previous) => {
      if (previous.phase === "idle") {
        return previous;
      }

      const nextQuality = getDirectCallConnectionQuality(activeLatencyMs, previous.phase);
      return previous.connectionQuality === nextQuality
        ? previous
        : { ...previous, connectionQuality: nextQuality };
    });
  }, [activeLatencyMs]);
  const {
    canNavigateBack,
    canNavigateForward,
    pushNavigationHistory,
    navigateHistoryBack,
    navigateHistoryForward,
  } = useMenuMainNavigation({
    workspaceMode,
    setWorkspaceMode,
    activeServerId,
    setActiveServerId,
    currentTextChannelId,
    setCurrentTextChannelId,
    activeDirectFriendId,
    setActiveDirectFriendId,
    activeConversationId,
    setActiveConversationId,
    friendsPageSection,
    setFriendsPageSection,
    desktopServerPane,
    setDesktopServerPane,
    selectedStreamUserId,
    setSelectedStreamUserId,
    mobileSection,
    setMobileSection,
    mobileServersPane,
    setMobileServersPane,
    isMobileViewport,
    currentVoiceChannel,
    workspaceStateStorageKey,
  });
  useEffect(() => {
    const allowedFps = getAllowedStreamFps(resolution);
    if (!allowedFps.includes(fps)) {
      setFps(allowedFps[0] || 30);
    }
  }, [fps, resolution]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const handleViewportChange = (event) => setIsMobileViewport(event.matches);

    setIsMobileViewport(mediaQueryList.matches);

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleViewportChange);
      return () => mediaQueryList.removeEventListener("change", handleViewportChange);
    }

    mediaQueryList.addListener(handleViewportChange);
    return () => mediaQueryList.removeListener(handleViewportChange);
  }, []);
  useEffect(() => {
    if (!activeServer && (settingsTab === "server" || settingsTab === "roles")) {
      setSettingsTab("voice_video");
    }
  }, [activeServer, settingsTab]);
  useEffect(() => {
    if (openSettings) {
      return;
    }

    setIsMicTestActive(false);
  }, [openSettings]);
  useEffect(() => () => {
    if (serverLongPressTimeoutRef.current) {
      window.clearTimeout(serverLongPressTimeoutRef.current);
    }
  }, []);
  const serverChannelLookup = useMemo(() => {
    const nextMap = new Map();
    (servers || []).forEach((server) => {
      (server.textChannels || []).forEach((channel) => {
        nextMap.set(getScopedChatChannelId(server.id, channel.id), {
          serverId: server.id,
          serverName: server.name || "Сервер",
          channelId: channel.id,
          channelName: normalizeTextChannelName(channel.name, "channel"),
        });
      });
    });

    return nextMap;
  }, [servers]);
  const directChannelFriendMap = useMemo(
    () =>
      new Map(
        directConversationTargets
          .map((friend) => {
            const channelId = friend.directChannelId || buildDirectMessageChannelId(currentUserId, friend.id);
            return channelId ? [channelId, friend] : null;
          })
          .filter(Boolean)
      ),
    [currentUserId, directConversationTargets]
  );
  const conversationChannelMap = useMemo(
    () =>
      new Map(
        conversationTargets
          .map((conversation) => {
            const channelId = String(conversation?.directChannelId || "");
            return channelId ? [channelId, conversation] : null;
          })
          .filter(Boolean)
      ),
    [conversationTargets]
  );
  const isDefaultServer = useMemo(() => isPersonalDefaultServer(activeServer, user), [activeServer, user]);
  const isServerOwner = useMemo(() => String(activeServer?.ownerId || "") === String(currentUserId), [activeServer?.ownerId, currentUserId]);
  const canManageServer = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_server"), [activeServer, currentUserId]);
  const canManageChannels = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_channels"), [activeServer, currentUserId]);
  const canManageRoles = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_roles"), [activeServer, currentUserId]);
  const canInviteMembers = useMemo(() => hasServerPermission(activeServer, currentUserId, "invite_members"), [activeServer, currentUserId]);
  const { canInviteToServer } = useMenuMainServerInvitePermissions({ currentUserId, user });
  const isCurrentUserSpeaking = useMemo(() => speakingUserIds.some((id) => String(id) === String(currentUserId)), [currentUserId, speakingUserIds]);
  const liveUserIds = useMemo(() => Array.from(new Set([...remoteScreenShares.map((item) => item.userId).filter(Boolean), ...announcedLiveUserIds, ...(isSharingScreen && user?.id ? [String(user.id)] : [])])), [remoteScreenShares, announcedLiveUserIds, isSharingScreen, user?.id]);
  const selectedStream = useMemo(() => remoteScreenShares.find((item) => String(item.userId) === String(selectedStreamUserId)) || null, [remoteScreenShares, selectedStreamUserId]);
  const isScreenShareActive = isSharingScreen && (localLiveShareMode === "screen" || localLiveShareMode === "both");
  const isCameraShareActive = isSharingScreen && (localLiveShareMode === "camera" || localLiveShareMode === "both");
  const isLocalStreamActive = isScreenShareActive || isCameraShareActive;
  useEffect(() => {
    if (typeof window === "undefined" || !window.electronMediaPerformance?.setStreamActive) {
      return undefined;
    }

    void window.electronMediaPerformance.setStreamActive(isLocalStreamActive).catch(() => {});
    return () => {
      if (isLocalStreamActive) {
        void window.electronMediaPerformance.setStreamActive(false).catch(() => {});
      }
    };
  }, [isLocalStreamActive]);
  const hasLocalSharePreview = Boolean(localSharePreview?.stream);
  const streamFpsOptions = useMemo(
    () => STREAM_FPS_OPTIONS.filter((option) => getAllowedStreamFps(resolution).includes(option.value)),
    [resolution]
  );
  const displayCaptureSupportInfo = useMemo(() => getDisplayCaptureSupportInfo(), []);
  const isScreenShareSupported = displayCaptureSupportInfo.supported;
  const selectedStreamParticipant = useMemo(() => {
    const participantFromVoiceRoom = (roomVoiceParticipants?.participants || [])
      .find((item) => String(item.userId || item.UserId || "") === String(selectedStreamUserId));
    if (participantFromVoiceRoom) {
      return participantFromVoiceRoom;
    }

    return Object.values(participantsMap).flat().find((item) => String(item.userId) === String(selectedStreamUserId)) || null;
  }, [participantsMap, roomVoiceParticipants, selectedStreamUserId]);
  const selectedStreamDebugInfo = useMemo(() => ({
    userId: selectedStreamUserId ? String(selectedStreamUserId) : "",
    liveSelected: selectedStreamUserId ? liveUserIds.some((id) => String(id) === String(selectedStreamUserId)) : false,
    remoteSharesCount: remoteScreenShares.length,
    videoTracks: selectedStream?.stream?.getVideoTracks?.().length || 0,
    audioTracks: selectedStream?.stream?.getAudioTracks?.().length || 0,
    readyState: selectedStream?.stream?.getVideoTracks?.()[0]?.readyState || "none",
    updatedAt: selectedStream?.updatedAt ? new Date(selectedStream.updatedAt).toLocaleTimeString() : "",
    mode: selectedStream?.mode || (selectedStream?.videoSrc ? "mse" : selectedStream?.imageSrc ? "frame" : "none"),
    hasAudio: Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length),
  }), [liveUserIds, remoteScreenShares.length, selectedStream, selectedStreamUserId]);
  const localSharePreviewDebugInfo = useMemo(() => ({
    userId: currentUserId ? String(currentUserId) : "",
    liveSelected: Boolean(hasLocalSharePreview),
    remoteSharesCount: remoteScreenShares.length,
    videoTracks: localSharePreview?.stream?.getVideoTracks?.().length || 0,
    audioTracks: localSharePreview?.stream?.getAudioTracks?.().length || 0,
    readyState: localSharePreview?.stream?.getVideoTracks?.()[0]?.readyState || "none",
    updatedAt: hasLocalSharePreview ? new Date().toLocaleTimeString() : "",
    mode: localSharePreview?.mode || "none",
    hasAudio: Boolean(localSharePreview?.stream?.getAudioTracks?.().length),
  }), [currentUserId, hasLocalSharePreview, localSharePreview, remoteScreenShares.length]);
  const localSharePreviewMeta = useMemo(() => {
    if (localSharePreview?.mode === "camera") {
      return {
        title: "Ваше видео",
        subtitle: "Так камера выглядит для участников голосового канала.",
      };
    }

    return {
      title: "Ваш стрим",
      subtitle: "Так участники видят ваш экран в эфире.",
    };
  }, [localSharePreview?.mode]);
  const mobileVoiceStageMode = useMemo(() => {
    if (selectedStreamUserId && selectedStream) {
      return "remote";
    }

    if (isLocalSharePreviewVisible && hasLocalSharePreview) {
      return "local";
    }

    return "spotlight";
  }, [hasLocalSharePreview, isLocalSharePreviewVisible, selectedStream, selectedStreamUserId]);
  const voiceParticipantByUserId = useMemo(() => {
    const nextMap = new Map();
    Object.values(activeVoiceParticipantsMap || {}).forEach((participants) => {
      (participants || []).forEach((participant) => {
        const userId = String(participant?.userId || participant?.UserId || "");
        if (!userId) {
          return;
        }

        nextMap.set(userId, participant);
      });
    });
    return nextMap;
  }, [activeVoiceParticipantsMap]);
  const activeContacts = useMemo(
    () => buildActiveContacts({
      friends: friendsWithRelationState.filter((friend) => !friend?.isBlocked && !friend?.blockedYou && !friend?.isIgnored),
      participantsMap,
      servers,
      currentUserId,
      getScopedVoiceChannelId,
    }),
    [currentUserId, friendsWithRelationState, participantsMap, servers]
  );
  const totalDirectUnreadCount = useMemo(
    () => Object.values(directUnreadCounts || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0),
    [directUnreadCounts]
  );
  const incomingFriendRequestCount = useMemo(() => incomingFriendRequests.length, [incomingFriendRequests]);
  const conversationUnreadThreadCount = useMemo(
    () => conversationTargets.reduce((sum, conversation) => {
      const channelId = String(conversation?.directChannelId || "").trim();
      if (!channelId || channelId === currentConversationChannelId) {
        return sum;
      }

      const hasLocalCount = Object.prototype.hasOwnProperty.call(directUnreadCounts || {}, channelId);
      const unreadCount = hasLocalCount
        ? Number(directUnreadCounts[channelId] || 0)
        : Number(conversation?.unreadCount || 0);
      return unreadCount > 0 ? sum + 1 : sum;
    }, 0),
    [conversationTargets, currentConversationChannelId, directUnreadCounts]
  );
  const totalFriendsAttentionCount = useMemo(
    () => totalDirectUnreadCount + incomingFriendRequestCount,
    [incomingFriendRequestCount, totalDirectUnreadCount]
  );
  const totalServerUnreadCount = useMemo(
    () => Object.values(serverUnreadCounts || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0),
    [serverUnreadCounts]
  );
  const activeServerUnreadCount = useMemo(() => {
    if (!activeServer?.id) {
      return 0;
    }

    return (activeServer.textChannels || []).reduce((sum, channel) => {
      const scopedChannelId = getScopedChatChannelId(activeServer.id, channel.id);
      return sum + Math.max(0, Number(serverUnreadCounts?.[scopedChannelId]) || 0);
    }, 0);
  }, [activeServer, serverUnreadCounts]);
  const currentVoiceParticipants = useMemo(() => {
    if (!currentVoiceChannel) {
      return [];
    }

    const rawParticipants = activeVoiceParticipantsMap?.[currentVoiceChannel] || [];
    const liveKitParticipants =
      String(roomVoiceParticipants?.channel || "") === String(currentVoiceChannel)
        ? roomVoiceParticipants.participants || []
        : [];
    const participantsById = new Map();

    [...rawParticipants, ...liveKitParticipants].forEach((participant) => {
      const userId = String(participant?.userId || participant?.UserId || "");
      if (!userId || participantsById.has(userId)) {
        return;
      }

      participantsById.set(userId, participant);
    });

    return Array.from(participantsById.values())
      .map((participant) => {
        const userId = String(participant?.userId || participant?.UserId || "");
        const fallbackName = String(participant?.name || participant?.Name || "").trim();

        return {
          userId,
          name: memberNameByUserId.get(userId) || fallbackName || "Участник",
          avatar: participant?.avatar || participant?.Avatar || "",
          isSelf: userId === String(currentUserId),
          isSpeaking: speakingUserIds.some((id) => String(id) === userId),
          isMicMuted: Boolean(participant?.isMicMuted || participant?.IsMicMuted),
          isDeafened: Boolean(participant?.isDeafened || participant?.IsDeafened),
          isLive: liveUserIds.some((id) => String(id) === userId) || Boolean(participant?.isScreenSharing || participant?.IsScreenSharing),
          roleColor: memberRoleColorByUserId.get(userId) || "#7b89a8",
        };
      })
      .sort((left, right) => {
        const leftWeight = (left.isLive ? 2 : 0) + (left.isSelf ? 1 : 0);
        const rightWeight = (right.isLive ? 2 : 0) + (right.isSelf ? 1 : 0);
        return rightWeight - leftWeight;
      });
  }, [activeVoiceParticipantsMap, currentUserId, currentVoiceChannel, liveUserIds, memberNameByUserId, memberRoleColorByUserId, roomVoiceParticipants, speakingUserIds]);
  const directCallPeerIsSpeaking = useMemo(
    () => currentVoiceParticipants.some((participant) => (
      String(participant?.userId || "") === String(directCallState.peerUserId || "")
      && Boolean(participant?.isSpeaking)
    )),
    [currentVoiceParticipants, directCallState.peerUserId]
  );
  const directCallPeerStreamShare = useMemo(() => {
    const peerUserId = String(directCallState.peerUserId || "");
    if (!peerUserId) {
      return null;
    }

    return remoteScreenShares.find((item) => String(item?.userId || "") === peerUserId) || null;
  }, [directCallState.peerUserId, remoteScreenShares]);
  const isDirectCallPeerStreamLive = useMemo(() => {
    const peerUserId = String(directCallState.peerUserId || "");
    return Boolean(
      peerUserId &&
      (directCallPeerStreamShare || liveUserIds.some((id) => String(id) === peerUserId))
    );
  }, [directCallPeerStreamShare, directCallState.peerUserId, liveUserIds]);
  const isWatchingDirectCallPeerStream =
    Boolean(selectedStreamUserId) &&
    String(selectedStreamUserId) === String(directCallState.peerUserId || "");
  const spotlightVoiceParticipant = useMemo(
    () =>
      currentVoiceParticipants.find((participant) => participant.isSpeaking)
      || currentVoiceParticipants.find((participant) => participant.isLive)
      || currentVoiceParticipants.find((participant) => participant.isSelf)
      || currentVoiceParticipants[0]
      || null,
    [currentVoiceParticipants]
  );
  const mobileVoiceStageCopy = useMemo(() => {
    if (mobileVoiceStageMode === "remote") {
      return {
        title: selectedStreamParticipant?.name || "Трансляция участника",
        subtitle: selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length
          ? "Идёт эфир со звуком"
          : "Идёт эфир без звука",
        badge: "LIVE",
      };
    }

    if (mobileVoiceStageMode === "local") {
      return {
        title: localSharePreviewMeta.title,
        subtitle: localSharePreviewMeta.subtitle,
        badge: localSharePreview?.mode === "camera" ? "CAM" : "LIVE",
      };
    }

    return {
      title: spotlightVoiceParticipant?.name || "Голосовой канал",
      subtitle:
        spotlightVoiceParticipant?.isSpeaking
          ? "Сейчас говорит"
          : spotlightVoiceParticipant?.isLive
            ? "Идёт эфир"
            : `${currentVoiceParticipants.length} участников в комнате`,
      badge: spotlightVoiceParticipant?.isLive ? "LIVE" : spotlightVoiceParticipant?.isSelf ? "Вы" : "",
    };
  }, [
    currentVoiceParticipants.length,
    localSharePreview?.mode,
    localSharePreviewMeta,
    mobileVoiceStageMode,
    selectedStream,
    selectedStreamParticipant?.name,
    spotlightVoiceParticipant?.isLive,
    spotlightVoiceParticipant?.isSpeaking,
    spotlightVoiceParticipant?.isSelf,
    spotlightVoiceParticipant?.name,
  ]);
  const activeTextNavigationChannelId = useMemo(() => {
    if (workspaceMode === "friends") {
      return currentDirectChannelId;
    }

    return activeServer?.id && currentTextChannel?.id
      ? getScopedChatChannelId(activeServer.id, currentTextChannel.id)
      : "";
  }, [activeServer?.id, currentDirectChannelId, currentTextChannel?.id, workspaceMode]);
  const quickSwitcherItems = useMemo(
    () => buildMenuMainQuickSwitcherItems({
      activeTextNavigationChannelId,
      currentUserId,
      currentVoiceParticipants,
      directConversationTargets,
      getChannelDisplayName,
      getDisplayName,
      query: quickSwitcherQuery,
      servers,
      textChatNavigationIndex,
    }),
    [
      activeTextNavigationChannelId,
      currentUserId,
      currentVoiceParticipants,
      directConversationTargets,
      getChannelDisplayName,
      getDisplayName,
      quickSwitcherQuery,
      servers,
      textChatNavigationIndex,
    ]
  );  useEffect(() => {
    setQuickSwitcherSelectedIndex((previous) => {
      if (!quickSwitcherItems.length) {
        return 0;
      }

      return Math.max(0, Math.min(previous, quickSwitcherItems.length - 1));
    });
  }, [quickSwitcherItems]);
  const friendQueryMode = getFriendSearchModeForQuery(friendEmail);
  const filteredFriends = useMemo(() => {
    const query = friendsSidebarQuery.trim().toLowerCase();
    if (!query) {
      return directConversationTargets;
    }

    return directConversationTargets.filter((friend) => {
      const displayName = getDisplayName(friend).toLowerCase();
      const email = String(friend.email || "").toLowerCase();
      return displayName.includes(query) || email.includes(query);
    });
  }, [directConversationTargets, friendsSidebarQuery]);
  const filteredConversations = useMemo(() => {
    const query = friendsSidebarQuery.trim().toLowerCase();
    if (!query) {
      return conversationTargets;
    }

    return conversationTargets.filter((conversation) => {
      const title = String(conversation?.title || "Новая беседа").toLowerCase();
      const memberNames = Array.isArray(conversation?.members)
        ? conversation.members.map((member) => getDisplayName(member)).join(" ").toLowerCase()
        : "";
      return title.includes(query) || memberNames.includes(query);
    });
  }, [conversationTargets, friendsSidebarQuery, getDisplayName]);

  const playUiTone = (type) => {
    try {
      const soundPath = UI_SOUND_PATHS[type];
      if (!soundPath) return;

      const previous = uiSoundCache.get(type);
      if (previous) {
        previous.pause();
        previous.currentTime = 0;
      }

      const audio = new Audio(soundPath);
      audio.volume = 0.45;
      audio.preload = "auto";
      uiSoundCache.set(type, audio);
      audio.play().catch(() => {});
    } catch {
      // ignore ui sound failures
    }
  };
  const clearScreenShareStartToneTimeout = () => {
    if (screenShareStartToneTimeoutRef.current) {
      window.clearTimeout(screenShareStartToneTimeoutRef.current);
      screenShareStartToneTimeoutRef.current = null;
    }
  };
  const scheduleScreenShareStartTone = (delayMs = 140) => {
    clearScreenShareStartToneTimeout();
    screenShareStartToneTimeoutRef.current = window.setTimeout(() => {
      screenShareStartToneTimeoutRef.current = null;
      playUiTone("shareStart");
    }, Math.max(0, Number(delayMs) || 0));
  };
  const playImmediateVoiceTransitionTone = (nextChannelId) => {
    const previousChannelId = String(currentVoiceChannelRef.current || "");
    const normalizedNextChannelId = String(nextChannelId || "");

    if (previousChannelId === normalizedNextChannelId) {
      return;
    }

    pendingLocalVoiceTransitionRef.current = {
      from: previousChannelId,
      to: normalizedNextChannelId,
    };

    if (voiceTransitionSoundTimeoutRef.current) {
      clearTimeout(voiceTransitionSoundTimeoutRef.current);
      voiceTransitionSoundTimeoutRef.current = null;
    }

    if (!previousChannelId && normalizedNextChannelId) {
      playUiTone("join");
      return;
    }

    if (previousChannelId && !normalizedNextChannelId) {
      playUiTone("leave");
      return;
    }

    if (previousChannelId && normalizedNextChannelId) {
      playUiTone("leave");
      voiceTransitionSoundTimeoutRef.current = window.setTimeout(() => {
        playUiTone("join");
        voiceTransitionSoundTimeoutRef.current = null;
      }, 90);
    }
  };
  const incrementDirectUnread = (channelId) => {
    if (!channelId) {
      return;
    }

    setDirectUnreadCounts((previous) => ({
      ...previous,
      [channelId]: Math.min(999, Number(previous[channelId] || 0) + 1),
    }));
  };
  const incrementServerUnread = (channelKey) => {
    if (!channelKey) {
      return;
    }

    setServerUnreadCounts((previous) => ({
      ...previous,
      [channelKey]: Math.min(999, Number(previous[channelKey] || 0) + 1),
    }));
  };
  const clearDirectUnread = (channelId) => {
    if (!channelId) {
      return;
    }

    setDirectUnreadCounts((previous) => {
      if (Object.prototype.hasOwnProperty.call(previous, channelId) && Number(previous[channelId] || 0) === 0) {
        return previous;
      }

      return {
        ...previous,
        [channelId]: 0,
      };
    });
  };
  const clearServerUnread = (channelKey) => {
    if (!channelKey) {
      return;
    }

    setServerUnreadCounts((previous) => {
      if (!previous[channelKey]) {
        return previous;
      }

      const next = { ...previous };
      delete next[channelKey];
      return next;
    });
  };
  const logVoiceHubError = (label, error) => {
    if (isUnauthorizedError(error)) {
      return;
    }

    console.error(label, error);
  };

  const openServersWorkspace = () => {
    const traceId = startPerfTrace("menu-main", "open-servers-workspace", {
      isMobileViewport,
    });
    pushNavigationHistory(() => {
      setWorkspaceMode("servers");
      setActiveDirectFriendId("");
      setSelectedStreamUserId(null);
      if (isMobileViewport) {
        setMobileSection("servers");
        setMobileServersPane(currentVoiceChannel ? "voice" : "channels");
      }
    });
    finishPerfTraceOnNextFrame(traceId, {
      isMobileViewport,
      workspaceMode: "servers",
    });
  };

  const openFriendsWorkspace = () => {
    const traceId = startPerfTrace("menu-main", "open-friends-workspace", {
      isMobileViewport,
    });
    pushNavigationHistory(() => {
      setWorkspaceMode("friends");
      setSelectedStreamUserId(null);
      if (isMobileViewport) {
        setMobileSection("friends");
      }
    });
    finishPerfTraceOnNextFrame(traceId, {
      isMobileViewport,
      workspaceMode: "friends",
    });
  };

  const selectServer = (server) => {
    if (!server) {
      return;
    }

    const traceId = startPerfTrace("menu-main", "select-server", {
      isMobileViewport,
      serverId: String(server.id || ""),
    });
    pushNavigationHistory(() => {
      setWorkspaceMode("servers");
      setActiveServerId(server.id);
      setCurrentTextChannelId(getStoredTextChannelId(activeTextChannelStorageKey, server) || server.textChannels[0]?.id || "");
      setDesktopServerPane("text");
      setActiveDirectFriendId("");
      setSelectedStreamUserId(null);
      if (isMobileViewport) {
        setMobileSection("servers");
        setMobileServersPane("channels");
      }
    });
    finishPerfTraceOnNextFrame(traceId, {
      isMobileViewport,
      serverId: String(server.id || ""),
    });
  };

  const selectServerTextChannel = (channelId) => {
    const traceId = startPerfTrace("menu-main", "select-text-channel", {
      channelId: String(channelId || ""),
      isMobileViewport,
    });
    pushNavigationHistory(() => {
      setWorkspaceMode("servers");
      setCurrentTextChannelId(channelId);
      setDesktopServerPane("text");
      setSelectedVoiceChannelId("");
      setActiveDirectFriendId("");
      if (isMobileViewport) {
        setMobileSection("servers");
        setMobileServersPane("chat");
      }
    });
    finishPerfTraceOnNextFrame(traceId, {
      channelId: String(channelId || ""),
      isMobileViewport,
    });
  };

  const openDirectChat = (friendId) => {
    const traceId = startPerfTrace("menu-main", "open-direct-chat", {
      friendId: String(friendId || ""),
      isMobileViewport,
    });
    pushNavigationHistory(() => {
      setActiveDirectFriendId(String(friendId || ""));
      setActiveConversationId("");
      setWorkspaceMode("friends");
      setFriendsPageSection("friends");
      setSelectedStreamUserId(null);
      if (isMobileViewport) {
        setMobileSection("friends");
      }
    });
    finishPerfTraceOnNextFrame(traceId, {
      friendId: String(friendId || ""),
      isMobileViewport,
    });
  };

  const openConversationChat = (conversationId) => {
    const traceId = startPerfTrace("menu-main", "open-conversation-chat", {
      conversationId: String(conversationId || ""),
      isMobileViewport,
    });
    pushNavigationHistory(() => {
      setActiveDirectFriendId("");
      setActiveConversationId(String(conversationId || ""));
      setWorkspaceMode("friends");
      setFriendsPageSection("conversations");
      setSelectedStreamUserId(null);
      if (isMobileViewport) {
        setMobileSection("friends");
      }
    });
    finishPerfTraceOnNextFrame(traceId, {
      conversationId: String(conversationId || ""),
      isMobileViewport,
    });
  };

  const disconnectFromActiveVoiceContext = async ({ preserveSuppressedChannel = true } = {}) => {
    if (!voiceClientRef.current) {
      return;
    }

    const activeChannelId = String(pendingVoiceChannelTargetRef.current || currentVoiceChannelRef.current || "").trim();
    if (activeChannelId && preserveSuppressedChannel) {
      suppressedVoiceChannelRef.current = activeChannelId;
    } else if (!activeChannelId) {
      suppressedVoiceChannelRef.current = "";
    }

    voiceJoinAttemptRef.current += 1;
    voiceJoinInFlightRef.current = false;
    pendingVoiceChannelTargetRef.current = "";
    setJoiningVoiceChannelId("");
    setCurrentVoiceChannel(null);
    setSelectedStreamUserId(null);
    setIsLocalSharePreviewVisible(false);

    await voiceClientRef.current.leaveChannel();
  };

  const openServerChannelFromToast = (toast) => {
    if (!toast?.serverId || !toast?.channelId) {
      return;
    }

    pushNavigationHistory(() => {
      setWorkspaceMode("servers");
      setActiveDirectFriendId("");
      setActiveServerId(String(toast.serverId));
      setCurrentTextChannelId(String(toast.channelId));
      setDesktopServerPane("text");
      if (isMobileViewport) {
        setMobileSection("servers");
        setMobileServersPane("chat");
      }
    });
    dismissServerToast(toast.id);
  };

  const closeQuickSwitcher = () => {
    setQuickSwitcherOpen(false);
    setQuickSwitcherQuery("");
    setQuickSwitcherSelectedIndex(0);
  };

  const sendTextChatNavigationRequest = (request) => {
    setTextChatNavigationRequest({
      ...request,
      nonce: Date.now(),
    });
  };

  const handleQuickSwitcherSelect = (item) => {
    if (!item) {
      return;
    }

    closeQuickSwitcher();

    if (item.kind === "server") {
      const server = servers.find((entry) => String(entry.id) === String(item.serverId));
      if (server) {
        selectServer(server);
      }
      return;
    }

    if (item.kind === "channel") {
      const targetServer = servers.find((entry) => String(entry.id) === String(item.serverId));
      if (!targetServer) {
        return;
      }

      pushNavigationHistory(() => {
        setWorkspaceMode("servers");
        setActiveDirectFriendId("");
        setActiveServerId(String(item.serverId));
        setCurrentTextChannelId(String(item.channelId));
        setDesktopServerPane("text");
        setSelectedStreamUserId(null);
        if (isMobileViewport) {
          setMobileSection("servers");
          setMobileServersPane("chat");
        }
      });
      return;
    }

    if (item.kind === "voice") {
      const targetServer = servers.find((entry) => String(entry.id) === String(item.serverId));
      const targetChannel = targetServer?.voiceChannels?.find((entry) => String(entry.id) === String(item.channelId));
      if (targetServer) {
        setActiveServerId(String(targetServer.id));
      }
      if (targetChannel) {
        void joinVoiceChannel(targetChannel);
      }
      return;
    }

    if (item.kind === "dm") {
      openDirectChat(item.friendId);
      return;
    }

    if (item.kind === "chatAction" && item.action && item.channelId) {
      sendTextChatNavigationRequest({
        type: item.action,
        channelId: item.channelId,
      });
      return;
    }

    if ((item.kind === "message" || item.kind === "pin" || item.kind === "mention" || item.kind === "reply") && item.channelId && item.messageId) {
      sendTextChatNavigationRequest({
        type: "message",
        channelId: item.channelId,
        messageId: item.messageId,
      });
      return;
    }

    if (item.kind === "focus" && item.userId) {
      handleWatchStream(item.userId);
    }
  };

  const dismissDirectToast = (toastId) => {
    const timeoutId = directToastTimeoutsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      directToastTimeoutsRef.current.delete(toastId);
    }

    setDirectMessageToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  };

  const clearDirectToastsByKind = useCallback((kind) => {
    const normalizedKind = String(kind || "").trim();
    if (!normalizedKind) {
      return;
    }

    setDirectMessageToasts((previous) => {
      const removedToasts = previous.filter((toast) => toast.kind === normalizedKind);
      if (!removedToasts.length) {
        return previous;
      }

      removedToasts.forEach((toast) => {
        const timeoutId = directToastTimeoutsRef.current.get(toast.id);
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          directToastTimeoutsRef.current.delete(toast.id);
        }
      });

      return previous.filter((toast) => toast.kind !== normalizedKind);
    });
  }, []);

  const dismissServerToast = (toastId) => {
    const timeoutId = serverToastTimeoutsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      serverToastTimeoutsRef.current.delete(toastId);
    }

    setServerMessageToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  };

  const dismissWorkspaceStatusToast = useCallback((toastId) => {
    const timeoutId = workspaceStatusToastTimeoutsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      workspaceStatusToastTimeoutsRef.current.delete(toastId);
    }

    setWorkspaceStatusToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  }, []);

  const pushWorkspaceStatusToast = useCallback((message, tone = "success") => {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
      return;
    }

    const toastId = createId("workspace-status-toast");
    setWorkspaceStatusToasts((previous) => [
      {
        id: toastId,
        message: normalizedMessage,
        tone,
      },
      ...previous,
    ].slice(0, 3));

    const timeoutId = window.setTimeout(() => {
      dismissWorkspaceStatusToast(toastId);
    }, 3200);

    workspaceStatusToastTimeoutsRef.current.set(toastId, timeoutId);
  }, [dismissWorkspaceStatusToast]);

  const pushDirectToast = (toast) => {
    playDirectMessageReceiveSound();
    setDirectMessageToasts((previous) => {
      const sameChannelToasts = previous.filter((item) => item.channelId === toast.channelId);
      const groupedCount = sameChannelToasts.reduce((sum, item) => sum + Number(item.count || 1), 0);

      if (groupedCount >= 3) {
        const groupedToast = {
          ...toast,
          grouped: true,
          count: groupedCount + 1,
          preview: toast.preview,
        };

        return [groupedToast, ...previous.filter((item) => item.channelId !== toast.channelId)].slice(0, 4);
      }

      const nextToasts = [{ ...toast, grouped: false, count: 1 }, ...previous];
      return nextToasts.slice(0, 4);
    });

    const timeoutId = window.setTimeout(() => {
      dismissDirectToast(toast.id);
    }, 6500);

    directToastTimeoutsRef.current.set(toast.id, timeoutId);
  };

  const pushServerToast = (toast) => {
    playNotificationSound();
    setServerMessageToasts((previous) => {
      const sameChannelToasts = previous.filter((item) => item.channelKey === toast.channelKey);
      const groupedCount = sameChannelToasts.reduce((sum, item) => sum + Number(item.count || 1), 0);

      if (groupedCount >= 3) {
        const groupedToast = {
          ...toast,
          grouped: true,
          count: groupedCount + 1,
          preview: toast.preview,
        };

        return [groupedToast, ...previous.filter((item) => item.channelKey !== toast.channelKey)].slice(0, 4);
      }

      const nextToasts = [{ ...toast, grouped: false, count: 1 }, ...previous];
      return nextToasts.slice(0, 4);
    });

    const timeoutId = window.setTimeout(() => {
      dismissServerToast(toast.id);
    }, 6500);

    serverToastTimeoutsRef.current.set(toast.id, timeoutId);
  };

  useEffect(() => {
    const statusMessage = String(conversationActionStatus || "").trim();
    if (!statusMessage) {
      return;
    }

    pushWorkspaceStatusToast(statusMessage);
    setConversationActionStatus("");
  }, [conversationActionStatus, pushWorkspaceStatusToast, setConversationActionStatus]);

  useEffect(() => {
    const statusMessage = String(friendActionStatus || "").trim();
    if (!statusMessage) {
      return;
    }

    pushWorkspaceStatusToast(statusMessage);
    setFriendActionStatus("");
  }, [friendActionStatus, pushWorkspaceStatusToast, setFriendActionStatus]);

  const showElectronDesktopNotification = ({ title, body }) => {
    if (!window?.electronDesktopNotifications?.show) {
      return;
    }

    if (document.visibilityState !== "hidden" && document.hasFocus()) {
      return;
    }

    window.electronDesktopNotifications.show({
      title: String(title || "Tend"),
      body: String(body || "").trim(),
      route: "/",
    }).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;

    let isDisposed = false;

    const loadPersistedServers = async () => {
      try {
        const existingScopedValue = localStorage.getItem(serversStorageKey);
        const localServers = existingScopedValue ? JSON.parse(existingScopedValue) : [];
        let nextServers = normalizeServers(localServers, user);

        try {
          const response = await authFetch(`${API_BASE_URL}/server-memberships`, {
            method: "GET",
            cache: "no-store",
          });
          const data = await parseApiResponse(response);
          if (response.ok && Array.isArray(data)) {
            nextServers = mergePersistedServers(localServers, data, user);
          } else if (response.status !== 404) {
            console.warn("Не удалось загрузить серверы из backend, используем локальный кэш:", data);
          }
        } catch (remoteError) {
          console.warn("Не удалось загрузить серверы из backend, используем локальный кэш:", remoteError);
        }

        if (isDisposed) {
          return;
        }

        const persistedActiveServerId = localStorage.getItem(activeServerStorageKey) || "";
        const nextActiveServerId = nextServers.some((server) => server.id === persistedActiveServerId)
          ? persistedActiveServerId
          : nextServers[0]?.id || "";
        const nextActiveServer = nextServers.find((server) => server.id === nextActiveServerId) || nextServers[0];
        const nextTextChannelId =
          getStoredTextChannelId(activeTextChannelStorageKey, nextActiveServer) ||
          nextActiveServer?.textChannels?.[0]?.id ||
          "";

        setServers(nextServers);
        setActiveServerId(nextActiveServerId);
        setCurrentTextChannelId(nextTextChannelId);
      } catch (error) {
        console.error("Ошибка загрузки пользовательских серверов:", error);
        if (isDisposed) {
          return;
        }
        setServers([]);
        setActiveServerId("");
        setCurrentTextChannelId("");
      }
    };

    loadPersistedServers().catch((error) => {
      console.error("Ошибка инициализации списка серверов:", error);
    });

    return () => {
      isDisposed = true;
    };
  }, [activeServerStorageKey, activeTextChannelStorageKey, serversStorageKey, user]);

  useEffect(() => {
    if (!user || !servers.length) {
      return;
    }

    const normalizedServers = normalizeServers(servers, user);
    const hasChanged =
      normalizedServers.length !== servers.length ||
      normalizedServers.some((server, index) => {
        const previousServer = servers[index];
        return previousServer?.id !== server.id || Boolean(previousServer?.isShared) !== Boolean(server.isShared);
      });

    if (!hasChanged) {
      return;
    }

    setServers(normalizedServers);
    setActiveServerId((previousActiveServerId) => {
      if (normalizedServers.some((server) => server.id === previousActiveServerId)) {
        return previousActiveServerId;
      }

      const previousServer = servers.find((server) => server.id === previousActiveServerId);
      const recoveredServer =
        normalizedServers.find((server) => server.name === previousServer?.name && server.ownerId === previousServer?.ownerId) ||
        normalizedServers[0];

      return recoveredServer?.id || "";
    });
  }, [servers, user]);

  useEffect(() => {
    if (!user) {
      resetFriendsState();
      setActiveDirectFriendId("");
      setDirectCallState(createDirectCallState());
      setDirectMessageToasts([]);
      setServerMessageToasts([]);
      setWorkspaceStatusToasts([]);
      setDirectUnreadCounts({});
      setServerUnreadCounts({});
      setCustomNotificationSoundData("");
      setCustomNotificationSoundName("");
      setNotificationSoundError("");
      joinedDirectChannelsRef.current.clear();
      joinedServerNotificationChannelsRef.current.clear();
      directToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      directToastTimeoutsRef.current.clear();
      serverToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      serverToastTimeoutsRef.current.clear();
      workspaceStatusToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      workspaceStatusToastTimeoutsRef.current.clear();
    }
  }, [user]);

  useEffect(() => {
    userSessionActiveRef.current = Boolean(user);
  }, [user]);
  useEffect(() => {
    if (hasBoundChatReconnectHandlerRef.current) {
      return;
    }

    hasBoundChatReconnectHandlerRef.current = true;
    chatConnection.onreconnected(() => {
      if (!userSessionActiveRef.current) {
        return;
      }

      joinedDirectChannelsRef.current.clear();
      joinedServerNotificationChannelsRef.current.clear();
      setChatSyncTick((previous) => previous + 1);
      refreshFriends().catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const handleProfileUpdated = (payload) => {
      const updatedUserId = String(payload?.userId || "");
      if (!updatedUserId) {
        return;
      }

      const nextFirstName = String(payload?.first_name || payload?.firstName || "").trim();
      const nextLastName = String(payload?.last_name || payload?.lastName || "").trim();
      const nextNickname = String(payload?.nickname || payload?.nick_name || "").trim();
      const nextAvatar = String(payload?.avatar_url || payload?.avatarUrl || payload?.avatar || "").trim();
      const nextProfileBackground = String(
        payload?.profile_background_url || payload?.profileBackgroundUrl || payload?.profileBackground || ""
      ).trim();
      const nextAvatarFrame = parseMediaFrame(payload?.avatar_frame, payload?.avatarFrame);
      const nextProfileBackgroundFrame = parseMediaFrame(
        payload?.profile_background_frame,
        payload?.profileBackgroundFrame
      );
      const nextProfileCustomization = normalizeProfileCustomization(
        payload?.profile_customization || payload?.profileCustomization || null
      );
      const nextEmail = String(payload?.email || "").trim();
      const nextDisplayName = nextNickname || `${nextFirstName} ${nextLastName}`.trim();

      updateFriendProfile(updatedUserId, (friend) => ({
        ...friend,
        firstName: nextFirstName || friend.firstName || "",
        lastName: nextLastName || friend.lastName || "",
        nickname: nextNickname || friend.nickname || "",
        name: nextDisplayName || friend.name || "",
        email: nextEmail || friend.email || "",
        avatar: nextAvatar || friend.avatar || "",
        avatarFrame: nextAvatarFrame || friend.avatarFrame || null,
        profileBackgroundUrl: nextProfileBackground || friend.profileBackgroundUrl || "",
        profileBackgroundFrame: nextProfileBackgroundFrame || friend.profileBackgroundFrame || null,
        profileCustomization: nextProfileCustomization,
      }));
      setDirectMessageToasts((previous) =>
        previous.map((toast) =>
          String(toast?.friend?.id || "") === updatedUserId
            ? {
                ...toast,
                friend: {
                  ...toast.friend,
                  firstName: nextFirstName || toast.friend?.firstName || "",
                  lastName: nextLastName || toast.friend?.lastName || "",
                  nickname: nextNickname || toast.friend?.nickname || "",
                  name: nextDisplayName || toast.friend?.name || "",
                  email: nextEmail || toast.friend?.email || "",
                  avatar: nextAvatar || toast.friend?.avatar || "",
                  avatarFrame: nextAvatarFrame || toast.friend?.avatarFrame || null,
                  profileBackgroundUrl: nextProfileBackground || toast.friend?.profileBackgroundUrl || "",
                  profileBackgroundFrame: nextProfileBackgroundFrame || toast.friend?.profileBackgroundFrame || null,
                  profileCustomization: nextProfileCustomization,
                },
              }
            : toast
        )
      );

      rerunFriendSearch();

      setServers((previous) =>
        previous.map((server) => ({
          ...server,
          members: Array.isArray(server?.members)
            ? server.members.map((member) =>
                String(member?.userId || "") === updatedUserId
                  ? {
                      ...member,
                      name: nextDisplayName || member.name || "",
                      avatar: nextAvatar || member.avatar || "",
                      avatarFrame: nextAvatarFrame || member.avatarFrame || null,
                      profileCustomization: nextProfileCustomization,
                    }
                  : member
              )
            : server.members,
        }))
      );

      setParticipantsMap((previous) =>
        Object.fromEntries(
          Object.entries(previous || {}).map(([channelKey, participants]) => [
            channelKey,
            Array.isArray(participants)
              ? participants.map((participant) =>
                  String(participant?.userId || participant?.UserId || "") === updatedUserId
                    ? {
                        ...participant,
                        name: nextDisplayName || participant.name || participant.Name || "",
                        avatar: nextAvatar || participant.avatar || participant.Avatar || "",
                        avatarFrame: nextAvatarFrame || participant.avatarFrame || participant.AvatarFrame || null,
                        profileCustomization: nextProfileCustomization,
                      }
                    : participant
                )
              : participants,
          ])
        )
      );

      if (updatedUserId === currentUserId && user) {
        const nextUser = {
          ...user,
          first_name: nextFirstName || user.first_name || user.firstName || "",
          firstName: nextFirstName || user.firstName || user.first_name || "",
          last_name: nextLastName || user.last_name || user.lastName || "",
          lastName: nextLastName || user.lastName || user.last_name || "",
          nickname: nextNickname || user.nickname || "",
          email: nextEmail || user.email || "",
          avatarUrl: nextAvatar || user.avatarUrl || user.avatar || "",
          avatar: nextAvatar || user.avatar || user.avatarUrl || "",
          avatarFrame: nextAvatarFrame,
          avatar_frame: nextAvatarFrame,
          profileBackgroundUrl:
            nextProfileBackground || user.profileBackgroundUrl || user.profile_background_url || user.profileBackground || "",
          profile_background_url:
            nextProfileBackground || user.profileBackground || user.profileBackgroundUrl || user.profile_background_url || "",
          profileBackground:
            nextProfileBackground || user.profileBackground || user.profileBackgroundUrl || user.profile_background_url || "",
          profileBackgroundFrame: nextProfileBackgroundFrame,
          profile_background_frame: nextProfileBackgroundFrame,
          profileCustomization: nextProfileCustomization,
          profile_customization: nextProfileCustomization,
        };

        setProfileCustomization(nextProfileCustomization);
        writeProfileCustomization(nextUser, nextProfileCustomization);
        setUser?.(nextUser);
        void storeSession(nextUser, {
          accessToken: getStoredToken(),
          refreshToken: getStoredRefreshToken(),
          accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
        });
      }
    };

    chatConnection.on("ProfileUpdated", handleProfileUpdated);

    return () => {
      chatConnection.off("ProfileUpdated", handleProfileUpdated);
    };
  }, [currentUserId, setUser, user]);

  useEffect(() => () => {
    directToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    directToastTimeoutsRef.current.clear();
    serverToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    serverToastTimeoutsRef.current.clear();
    workspaceStatusToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    workspaceStatusToastTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(serversStorageKey, JSON.stringify(servers));
  }, [servers, serversStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setDirectNotificationsEnabled(true);
      return;
    }

    try {
      const storedSetting = localStorage.getItem(directNotificationsStorageKey);
      setDirectNotificationsEnabled(storedSetting !== "false");
    } catch {
      setDirectNotificationsEnabled(true);
    }
  }, [directNotificationsStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setConversationNotificationsEnabled(true);
      return;
    }

    try {
      const storedSetting = localStorage.getItem(conversationNotificationsStorageKey);
      setConversationNotificationsEnabled(storedSetting !== "false");
    } catch {
      setConversationNotificationsEnabled(true);
    }
  }, [conversationNotificationsStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setServerNotificationsEnabled(true);
      return;
    }

    try {
      const storedSetting = localStorage.getItem(serverNotificationsStorageKey);
      setServerNotificationsEnabled(storedSetting !== "false");
    } catch {
      setServerNotificationsEnabled(true);
    }
  }, [serverNotificationsStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(directNotificationsStorageKey, String(directNotificationsEnabled));
    } catch {
      // ignore storage failures
    }
  }, [directNotificationsEnabled, directNotificationsStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(conversationNotificationsStorageKey, String(conversationNotificationsEnabled));
    } catch {
      // ignore storage failures
    }
  }, [conversationNotificationsEnabled, conversationNotificationsStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(serverNotificationsStorageKey, String(serverNotificationsEnabled));
    } catch {
      // ignore storage failures
    }
  }, [serverNotificationsEnabled, serverNotificationsStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setChatDraftPresence({});
      return undefined;
    }

    const refreshDraftPresence = () => {
      const nextPresence = {};

      directConversationTargets.forEach((target) => {
        const channelId = String(target?.directChannelId || buildDirectMessageChannelId(currentUserId, target?.id));
        if (channelId) {
          nextPresence[channelId] = hasChatDraft(user, channelId);
        }
      });

      (servers || []).forEach((server) => {
        (server.textChannels || []).forEach((channel) => {
          const scopedChannelId = getScopedChatChannelId(server.id, channel.id);
          nextPresence[scopedChannelId] = hasChatDraft(user, scopedChannelId);
        });
      });

      setChatDraftPresence(nextPresence);
    };

    const handleStorage = () => refreshDraftPresence();
    const handleDraftUpdated = () => refreshDraftPresence();

    refreshDraftPresence();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(getChatDraftUpdatedEventName(), handleDraftUpdated);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(getChatDraftUpdatedEventName(), handleDraftUpdated);
    };
  }, [currentUserId, directConversationTargets, servers, user]);

  useEffect(() => {
    if (directNotificationsEnabled) {
      return;
    }

    clearDirectToastsByKind("direct");
  }, [clearDirectToastsByKind, directNotificationsEnabled]);

  useEffect(() => {
    if (conversationNotificationsEnabled) {
      return;
    }

    clearDirectToastsByKind("conversation");
  }, [clearDirectToastsByKind, conversationNotificationsEnabled]);

  useEffect(() => {
    if (serverNotificationsEnabled) {
      return;
    }

    setServerMessageToasts([]);
    serverToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    serverToastTimeoutsRef.current.clear();
  }, [serverNotificationsEnabled]);

  useEffect(() => {
    if (workspaceMode !== "friends" || !currentDirectChannelId) {
      return;
    }

    clearDirectUnread(currentDirectChannelId);
  }, [currentDirectChannelId, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "friends" || !currentConversationChannelId) {
      return;
    }

    clearDirectUnread(currentConversationChannelId);
  }, [currentConversationChannelId, workspaceMode]);

  useEffect(() => {
    if (!conversationTargets.length) {
      return;
    }

    setDirectUnreadCounts((previous) => {
      let changed = false;
      const next = { ...previous };

      conversationTargets.forEach((conversation) => {
        const channelId = String(conversation?.directChannelId || "").trim();
        if (!channelId) {
          return;
        }

        if (workspaceMode === "friends" && channelId === currentConversationChannelId) {
          if (Number(next[channelId] || 0) !== 0 || !Object.prototype.hasOwnProperty.call(next, channelId)) {
            next[channelId] = 0;
            changed = true;
          }
          return;
        }

        const unreadCount = Math.max(0, Number(conversation?.unreadCount || 0) || 0);
        const hasLocalCount = Object.prototype.hasOwnProperty.call(next, channelId);
        const localUnreadCount = Number(next[channelId] || 0);
        if (unreadCount > localUnreadCount && (!hasLocalCount || localUnreadCount > 0)) {
          next[channelId] = Math.min(999, unreadCount);
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [conversationTargets, currentConversationChannelId, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "servers" || !activeServerId || !currentTextChannelId || activeDirectFriendId) {
      return;
    }

    clearServerUnread(getScopedChatChannelId(activeServerId, currentTextChannelId));
  }, [activeDirectFriendId, activeServerId, currentTextChannelId, workspaceMode]);

  useEffect(() => {
    if (!user) {
      setMicLevel(0);
      resetCameraPreviewState();
    }
  }, [resetCameraPreviewState, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      setSelectedVideoDeviceId(localStorage.getItem(videoInputDeviceStorageKey) || "");
    } catch {
      setSelectedVideoDeviceId("");
    }
  }, [videoInputDeviceStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      if (selectedVideoDeviceId) {
        localStorage.setItem(videoInputDeviceStorageKey, selectedVideoDeviceId);
      } else {
        localStorage.removeItem(videoInputDeviceStorageKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [selectedVideoDeviceId, user, videoInputDeviceStorageKey]);

  useEffect(() => {
    if (!user) return;
    if (!activeServerId) {
      localStorage.removeItem(activeServerStorageKey);
      return;
    }
    localStorage.setItem(activeServerStorageKey, activeServerId);
  }, [activeServerId, activeServerStorageKey, user]);

  useEffect(() => {
    if (!user || !currentUserId) {
      return;
    }

  const desiredChannelIds = new Set(
      [...directConversationTargets, ...conversationTargets]
        .map((target) => target.directChannelId || buildDirectMessageChannelId(currentUserId, target.id))
        .filter(Boolean)
    );

    const syncDirectChannels = async () => {
      const connection = await startChatConnection();
      if (!connection) {
        return;
      }

      const joinedChannels = joinedDirectChannelsRef.current;

      for (const channelId of Array.from(joinedChannels)) {
        if (desiredChannelIds.has(channelId)) {
          continue;
        }

        try {
          await chatConnection.invoke("LeaveChannel", channelId);
        } catch {
          // ignore cleanup failures
        }

        joinedChannels.delete(channelId);
      }

      for (const channelId of Array.from(desiredChannelIds)) {
        if (joinedChannels.has(channelId)) {
          continue;
        }

        try {
          await chatConnection.invoke("JoinChannel", channelId);
          joinedChannels.add(channelId);
        } catch {
          // ignore join failures until the direct chat is opened explicitly
        }
      }
    };

    syncDirectChannels().catch(() => {});
  }, [chatSyncTick, conversationTargets, currentUserId, directConversationTargets, user]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const desiredChannelIds = new Set(
      (servers || []).flatMap((server) =>
        (server.textChannels || [])
          .map((channel) => getScopedChatChannelId(server.id, channel.id))
          .filter(Boolean)
      )
    );

    let isDisposed = false;

    const syncServerNotificationChannels = async () => {
      const connection = await startChatConnection();
      if (!connection || isDisposed) {
        return;
      }

      const joinedChannels = joinedServerNotificationChannelsRef.current;

      for (const channelId of Array.from(joinedChannels)) {
        if (desiredChannelIds.has(channelId)) {
          continue;
        }

        try {
          await chatConnection.invoke("LeaveChannel", channelId);
        } catch {
          // ignore cleanup failures
        }

        joinedChannels.delete(channelId);
      }

      for (const channelId of Array.from(desiredChannelIds)) {
        try {
          await chatConnection.invoke("JoinChannel", channelId);
          joinedChannels.add(channelId);
        } catch {
          // ignore join failures for notification-only subscriptions
        }
      }
    };

    syncServerNotificationChannels().catch(() => {});

    return () => {
      isDisposed = true;
    };
  }, [chatSyncTick, servers, user]);

  useEffect(() => {
    if (!user || !currentUserId) {
      return undefined;
    }

    const handleReceiveDirectMessage = async (messageItem) => {
      const channelId = String(messageItem?.channelId || "");
      if (!channelId.startsWith("dm:")) {
        return;
      }

      if (String(messageItem?.authorUserId || "") === String(currentUserId)) {
        return;
      }

      const isCurrentDirectOpen = channelId === currentDirectChannelId;
      if (isCurrentDirectOpen) {
        return;
      }

      const friend = directChannelFriendMap.get(channelId);
      if (!friend) {
        return;
      }

      incrementDirectUnread(channelId);

      if (!directNotificationsEnabled) {
        return;
      }

      const preview = await resolveIncomingMessagePreview(messageItem, user, {
        fallbackText: "Новое сообщение",
        channelId,
        scope: "direct",
      });
      pushDirectToast({
        id: createDirectToastId(),
        kind: "direct",
        channelId,
        title: getDisplayName(friend) || "Новое сообщение",
        avatarSrc: getUserAvatar(friend),
        friend,
        preview,
      });
      showElectronDesktopNotification({
        title: getDisplayName(friend) || "Новое сообщение",
        body: preview,
      });
    };

    chatConnection.on("ReceiveMessage", handleReceiveDirectMessage);

    return () => {
      chatConnection.off("ReceiveMessage", handleReceiveDirectMessage);
    };
  }, [currentDirectChannelId, currentUserId, directChannelFriendMap, directNotificationsEnabled, user]);

  useEffect(() => {
    if (!user || !currentUserId) {
      return undefined;
    }

    const handleReceiveConversationMessage = async (messageItem) => {
      const channelId = String(messageItem?.channelId || "");
      if (!channelId || channelId.startsWith("dm:")) {
        return;
      }

      if (parseServerChatChannelId(channelId)) {
        return;
      }

      const conversation = conversationChannelMap.get(channelId);
      if (!conversation) {
        return;
      }

      if (String(messageItem?.authorUserId || "") === String(currentUserId)) {
        return;
      }

      if (channelId === currentConversationChannelId) {
        return;
      }

      incrementDirectUnread(channelId);

      if (!conversationNotificationsEnabled) {
        return;
      }

      const preview = await resolveIncomingMessagePreview(messageItem, user, {
        fallbackText: "Новое сообщение",
      });
      pushDirectToast({
        id: createDirectToastId(),
        kind: "conversation",
        channelId,
        title: String(conversation?.title || "Беседа"),
        avatarSrc: String(conversation?.avatar || ""),
        friend: conversation,
        preview,
      });
      showElectronDesktopNotification({
        title: String(conversation?.title || "Беседа"),
        body: `${String(messageItem?.username || "User")}: ${preview}`,
      });
    };

    chatConnection.on("ReceiveMessage", handleReceiveConversationMessage);

    return () => {
      chatConnection.off("ReceiveMessage", handleReceiveConversationMessage);
    };
  }, [
    conversationChannelMap,
    conversationNotificationsEnabled,
    currentConversationChannelId,
    currentUserId,
    user,
  ]);

  useEffect(() => {
    if (!user || !currentUserId) {
      return undefined;
    }

    const handleReceiveServerMessage = async (messageItem) => {
      const scopedChannelId = String(messageItem?.channelId || "");
      const parsedChannel = parseServerChatChannelId(scopedChannelId);
      if (!parsedChannel) {
        return;
      }

      if (String(messageItem?.authorUserId || "") === String(currentUserId)) {
        return;
      }

      const fallbackServer =
        servers.find((server) => String(server.id) === String(parsedChannel.serverId)) ||
        servers.find((server) => (server.textChannels || []).some((channel) => String(channel.id) === String(parsedChannel.channelId)));
      const fallbackChannel = fallbackServer?.textChannels?.find((channel) => String(channel.id) === String(parsedChannel.channelId));
      const channelInfo = serverChannelLookup.get(scopedChannelId) || (
        fallbackServer && fallbackChannel
          ? {
              serverId: fallbackServer.id,
              serverName: fallbackServer.name || "Сервер",
              channelId: fallbackChannel.id,
              channelName: normalizeTextChannelName(fallbackChannel.name, "channel"),
            }
          : null
      );
      if (!channelInfo) {
        return;
      }

      const isCurrentChannelOpen =
        workspaceMode === "servers" &&
        !activeDirectFriendId &&
        String(activeServerId || "") === String(channelInfo.serverId) &&
        String(currentTextChannelId || "") === String(channelInfo.channelId);

      if (isCurrentChannelOpen) {
        return;
      }

      incrementServerUnread(scopedChannelId);

      if (!serverNotificationsEnabled) {
        return;
      }

      const currentUserMentioned = isUserMentioned(messageItem?.mentions, currentUserId);
      const messagePreview = await resolveIncomingMessagePreview(messageItem, user, {
        fallbackText: "Новое сообщение",
        channelId: scopedChannelId,
        scope: "text",
      });
      pushServerToast({
        id: createServerToastId(),
        channelKey: scopedChannelId,
        scopedChannelId,
        serverId: channelInfo.serverId,
        serverName: channelInfo.serverName,
        channelId: channelInfo.channelId,
        channelName: channelInfo.channelName,
        authorName: String(messageItem?.username || "User"),
        preview: currentUserMentioned
          ? `Вас упомянули: ${messagePreview}`
          : messagePreview,
      });
      showElectronDesktopNotification({
        title: `${channelInfo.serverName} · ${channelInfo.channelName}`,
        body: `${String(messageItem?.username || "User")}: ${currentUserMentioned ? `Вас упомянули: ${messagePreview}` : messagePreview}`,
      });
    };

    chatConnection.on("ReceiveMessage", handleReceiveServerMessage);

    return () => {
      chatConnection.off("ReceiveMessage", handleReceiveServerMessage);
    };
  }, [
    activeDirectFriendId,
    activeServerId,
    currentTextChannelId,
    currentUserId,
    servers,
    serverChannelLookup,
    serverNotificationsEnabled,
    user,
    workspaceMode,
  ]);

  useEffect(() => {
    if (!activeServer?.id || isDefaultServer || !currentUserId || (!canManageServer && !canManageChannels) || !activeServerSyncFingerprint) return;
    if (lastServerSyncFingerprintRef.current === activeServerSyncFingerprint) return;

    lastServerSyncFingerprintRef.current = activeServerSyncFingerprint;

    const timeoutId = window.setTimeout(() => {
      syncServerSnapshot(activeServer, { applyResponse: false });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [activeServer, activeServerSyncFingerprint, canManageChannels, canManageServer, currentUserId, isDefaultServer]);
  useEffect(() => {
    setProfileDraft({
      firstName: user?.first_name || user?.firstName || "",
      lastName: user?.last_name || user?.lastName || "",
      nickname: user?.nickname || "",
      email: user?.email || "",
      profileBackgroundUrl: getUserProfileBackground(user),
      profileBackgroundFrame: getUserProfileBackgroundFrame(user),
    });
    setEmailChangeState((previous) => ({
      ...previous,
      email: previous.awaitingCode ? previous.email : user?.email || "",
      status: "",
    }));
  }, [
    user?.email,
    user?.first_name,
    user?.firstName,
    user?.last_name,
    user?.lastName,
    user?.nickname,
    user?.profileBackgroundUrl,
    user?.profile_background_url,
    user?.profileBackground,
    user?.profileBackgroundFrame,
    user?.profile_background_frame,
  ]);
  useEffect(() => {
    if (!activeServer?.id || !activeServer?.isShared || isDefaultServer || workspaceMode !== "servers") return;
    if (channelSettingsState) return;

    if (document.visibilityState !== "hidden") {
      refreshServerSnapshot(activeServer.id);
    }
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      refreshServerSnapshot(activeServer.id);
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [activeServer?.id, activeServer?.isShared, channelSettingsState, isDefaultServer, workspaceMode]);
  useEffect(() => {
    if (!showServerMembersPanel || !activeServer?.id || !activeServer?.isShared || isDefaultServer) return;

    refreshServerSnapshot(activeServer.id);
  }, [showServerMembersPanel, activeServer?.id, activeServer?.isShared, isDefaultServer]);
  useEffect(() => {
    if (!servers.length) {
      setActiveServerId("");
      setCurrentTextChannelId("");
      return;
    }
    if (!servers.some((server) => server.id === activeServerId)) setActiveServerId(servers[0].id);
  }, [servers, activeServerId]);
  useEffect(() => {
    if (activeServer?.textChannels?.length && !activeServer.textChannels.some((channel) => channel.id === currentTextChannelId)) {
      setCurrentTextChannelId(getStoredTextChannelId(activeTextChannelStorageKey, activeServer) || activeServer.textChannels[0].id);
    }
  }, [activeServer, activeTextChannelStorageKey, currentTextChannelId]);
  useEffect(() => {
    if (!user || !activeServer?.id || !currentTextChannelId) {
      return;
    }

    if (!activeServer.textChannels?.some((channel) => String(channel.id) === String(currentTextChannelId))) {
      return;
    }

    writeStoredTextChannelId(activeTextChannelStorageKey, activeServer.id, currentTextChannelId);
  }, [activeServer, activeTextChannelStorageKey, currentTextChannelId, user]);
  useEffect(() => {
    setChannelSearchQuery("");
  }, [activeServerId, currentTextChannelId, workspaceMode]);
  useEffect(() => {
    cancelChannelRename();
  }, [activeServerId]);
  useEffect(() => {
    if (!selectedStreamUserId) return;
    const isStillLive = liveUserIds.some((id) => String(id) === String(selectedStreamUserId));
    if (!isStillLive && !selectedStream) setSelectedStreamUserId(null);
  }, [liveUserIds, selectedStream, selectedStreamUserId]);
  useEffect(() => {
    const mediaElement = mobileVoiceStageVideoRef.current;
    if (!mediaElement) {
      return;
    }

    const activeStream =
      mobileVoiceStageMode === "remote"
        ? selectedStream?.stream || null
        : mobileVoiceStageMode === "local"
          ? localSharePreview?.stream || null
          : null;
    const activeVideoSrc = mobileVoiceStageMode === "remote" ? selectedStream?.videoSrc || "" : "";

    mediaElement.srcObject = activeStream;
    mediaElement.src = activeStream ? "" : activeVideoSrc;
    mediaElement.muted = true;

    if (activeStream || activeVideoSrc) {
      mediaElement.play().catch(() => {});
    }

    return () => {
      mediaElement.srcObject = null;
      mediaElement.src = "";
    };
  }, [localSharePreview?.stream, mobileVoiceStageMode, selectedStream?.stream, selectedStream?.videoSrc]);
  useEffect(() => {
    if (hasLocalSharePreview) {
      return;
    }

    setIsLocalSharePreviewVisible(false);
  }, [hasLocalSharePreview]);
  useEffect(() => {
    voiceClientRef.current?.setFocusedRemoteShareUser(selectedStreamUserId || "");
  }, [selectedStreamUserId]);
  useEffect(() => {
    const handleClick = (event) => {
      const target = event.target;
      const insidePopup = popupRef.current?.contains(target);
      const insideMediaFrameEditor = target instanceof Element && Boolean(target.closest(".media-frame-editor"));
      const insideServerPanel = serverMembersRef.current?.contains(target);
      const insideMemberMenu = memberRoleMenuRef.current?.contains(target);
      const insideServerContextMenu = serverContextMenuRef.current?.contains(target);
      const insideFriendListUserContextMenu = friendListUserContextMenuRef.current?.contains(target);
      const insideNoiseMenu = noiseMenuRef.current?.contains(target);
      const insideMicMenu = micMenuRef.current?.contains(target);
      const insideSoundMenu = soundMenuRef.current?.contains(target);

      if (popupRef.current && !insidePopup && !insideMediaFrameEditor) setOpenSettings(false);
      if (serverMembersRef.current && !insideServerPanel && !insideMemberMenu) setShowServerMembersPanel(false);
      if (!insideMemberMenu) setMemberRoleMenu(null);
      if (!insideServerContextMenu) setServerContextMenu(null);
      if (!insideFriendListUserContextMenu) setFriendListUserContextMenu(null);
      if (!insideNoiseMenu) setShowNoiseMenu(false);
      if (!insideMicMenu) setShowMicMenu(false);
      if (!insideSoundMenu) setShowSoundMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  useEffect(() => {
    setShowServerMembersPanel(false);
    setServerContextMenu(null);
  }, [activeServerId]);
  useEffect(() => {
    micLevelUiActiveRef.current = Boolean(
      showMicMenu
      || isMicTestActive
      || (openSettings && settingsTab === "voice_video")
    );
  }, [isMicTestActive, openSettings, settingsTab, showMicMenu]);

  const handleParticipantsMapChanged = useCallback((nextParticipantsMap) => {
    const normalizedParticipantsMap =
      nextParticipantsMap && typeof nextParticipantsMap === "object" ? nextParticipantsMap : {};

    setParticipantsMap((previousValue) => (
      areParticipantMapsEqual(previousValue, normalizedParticipantsMap)
        ? previousValue
        : normalizedParticipantsMap
    ));
  }, []);

  const handleRemoteScreenStreamsChanged = useCallback((nextShares) => {
    const normalizedShares = Array.isArray(nextShares) ? nextShares : [];

    setRemoteScreenShares((previousValue) => (
      areRemoteScreenSharesEqual(previousValue, normalizedShares)
        ? previousValue
        : normalizedShares
    ));
  }, []);

  const handleLiveUsersChanged = useCallback((nextLiveUsers) => {
    const normalizedLiveUsers = Array.isArray(nextLiveUsers)
      ? nextLiveUsers.map((value) => String(value || ""))
      : [];

    setAnnouncedLiveUserIds((previousValue) => (
      areStringArraysEqual(previousValue, normalizedLiveUsers)
        ? previousValue
        : normalizedLiveUsers
    ));
  }, []);

  const handleSpeakingUsersChanged = useCallback((nextSpeakingUsers) => {
    const normalizedSpeakingUsers = Array.isArray(nextSpeakingUsers)
      ? nextSpeakingUsers.map((value) => String(value || ""))
      : [];

    setSpeakingUserIds((previousValue) => (
      areStringArraysEqual(previousValue, normalizedSpeakingUsers)
        ? previousValue
        : normalizedSpeakingUsers
    ));
  }, []);

  const handleRoomParticipantsChanged = useCallback(({ channel, participants }) => {
    const normalizedChannel = String(channel || "");
    const normalizedParticipants = Array.isArray(participants) ? participants : [];

    setRoomVoiceParticipants((previousValue) => (
      previousValue.channel === normalizedChannel
      && areObjectArraysEqual(previousValue.participants, normalizedParticipants)
        ? previousValue
        : {
            channel: normalizedChannel,
            participants: normalizedParticipants,
          }
    ));
  }, []);

  const handleSelfVoiceStateChanged = useCallback(({
    isMicMuted: nextMicMuted,
    isDeafened: nextIsDeafened,
    isMicForced: nextIsMicForced,
    isDeafenedForced: nextIsSoundForced,
  }) => {
    const normalizedMicMuted = Boolean(nextMicMuted) && !nextIsDeafened;
    const normalizedSoundMuted = Boolean(nextIsDeafened);
    const normalizedMicForced = Boolean(nextIsMicForced);
    const normalizedSoundForced = Boolean(nextIsSoundForced);

    setIsMicMuted((previousValue) => (
      previousValue === normalizedMicMuted ? previousValue : normalizedMicMuted
    ));
    setIsSoundMuted((previousValue) => (
      previousValue === normalizedSoundMuted ? previousValue : normalizedSoundMuted
    ));
    setIsMicForced((previousValue) => (
      previousValue === normalizedMicForced ? previousValue : normalizedMicForced
    ));
    setIsSoundForced((previousValue) => (
      previousValue === normalizedSoundForced ? previousValue : normalizedSoundForced
    ));
  }, []);

  const handleMicLevelChanged = useCallback((nextLevel) => {
    if (!micLevelUiActiveRef.current) {
      return;
    }

    const normalizedLevel = normalizeMicLevel(nextLevel);
    setMicLevel((previousValue) => {
      const delta = Math.abs(previousValue - normalizedLevel);
      const crossingZero = (previousValue === 0) !== (normalizedLevel === 0);
      return delta >= 0.04 || crossingZero ? normalizedLevel : previousValue;
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const measurePing = async ({ commit = true } = {}) => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const startedAt = performance.now();
      try {
        const response = await fetch(`${API_URL}/api/ping`, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          throw new Error(`Ping failed with status ${response.status}`);
        }

        if (!disposed && commit) {
          setPingMs(Math.max(1, Math.round(performance.now() - startedAt)));
        }
      } catch {
        if (!disposed && commit) {
          setPingMs(null);
        }
      }
    };

    const bootstrapPing = async () => {
      await measurePing({ commit: false }).catch(() => {});
      if (disposed) {
        return;
      }

      await measurePing();
    };

    bootstrapPing();
    const intervalId = window.setInterval(measurePing, 5000);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let disposed = false;
    let client = null;
    let initializeTimeoutId = 0;
    let idleInitRequestId = 0;

    const initializeVoiceClient = async () => {
      if (voiceClientRef.current) {
        return voiceClientRef.current;
      }

      const createVoiceRoomClient = await loadVoiceRoomClientFactory();
      if (disposed) {
        return null;
      }

      client = createVoiceRoomClient({
      onParticipantsMapChanged: handleParticipantsMapChanged,
      onChannelChanged: (nextChannel) => {
        const normalizedNextChannel = String(nextChannel || "");
        if (
          normalizedNextChannel
          && suppressedVoiceChannelRef.current
          && suppressedVoiceChannelRef.current === normalizedNextChannel
        ) {
          void voiceClientRef.current?.leaveChannel().catch((error) => {
            console.error("Не удалось отменить позднее подключение к голосовому каналу:", error);
          });
          return;
        }

        if (!nextChannel && voiceJoinInFlightRef.current && pendingVoiceChannelTargetRef.current) {
          return;
        }

        if (String(currentVoiceChannelRef.current || "") !== normalizedNextChannel) {
          setVoicePingMs((previousValue) => (previousValue === null ? previousValue : null));
        }

        if (!normalizedNextChannel) {
          suppressedVoiceChannelRef.current = "";
        }

        setCurrentVoiceChannel((previousValue) => (
          String(previousValue || "") === String(nextChannel || "") ? previousValue : nextChannel
        ));
        setJoiningVoiceChannelId((previous) => (String(previous || "") === String(nextChannel || "") ? "" : previous));
        if (!nextChannel && isDirectCallChannelId(directCallStateRef.current.channelId)) {
          const currentCall = directCallStateRef.current;
          if (currentCall.lastReason === "expected-end") {
            setDirectCallState(createDirectCallState());
            return;
          }

          if (currentCall.phase === "connected" || currentCall.phase === "connecting" || currentCall.phase === "reconnecting") {
            setDirectCallState(buildDirectCallState({
              phase: "disconnected",
              statusLabel: "Соединение прервано",
              channelId: currentCall.channelId,
              peerUserId: currentCall.peerUserId,
              peerName: currentCall.peerName,
              peerAvatar: currentCall.peerAvatar,
              peerAvatarFrame: currentCall.peerAvatarFrame,
              canRetry: true,
              isMiniMode: true,
              direction: currentCall.direction,
              connectionQuality: "reconnecting",
              endedAt: new Date().toISOString(),
            }));
            appendDirectCallHistoryEntry({
              peerUserId: currentCall.peerUserId,
              peerName: currentCall.peerName,
              peerAvatar: currentCall.peerAvatar,
              direction: currentCall.direction || "incoming",
              outcome: "disconnected",
            });
          } else {
            setDirectCallState(createDirectCallState());
          }
        }
      },
      onRemoteScreenStreamsChanged: handleRemoteScreenStreamsChanged,
      onLocalScreenShareChanged: (nextValue) => {
        const normalizedValue = Boolean(nextValue);
        setIsSharingScreen((previousValue) => (
          previousValue === normalizedValue ? previousValue : normalizedValue
        ));
      },
      onLocalLiveShareChanged: ({ mode }) => {
        const normalizedMode = mode || "";
        setLocalLiveShareMode((previousValue) => (
          previousValue === normalizedMode ? previousValue : normalizedMode
        ));
      },
      onLocalPreviewStreamChanged: ({ stream, mode, sourceTitle }) => {
        const normalizedStream = stream || null;
        const normalizedMode = mode || "";
        const normalizedSourceTitle = String(sourceTitle || "").trim();
        setLocalSharePreview((previousValue) => (
          previousValue.stream === normalizedStream
            && previousValue.mode === normalizedMode
            && String(previousValue.sourceTitle || "") === normalizedSourceTitle
            ? previousValue
            : {
                stream: normalizedStream,
                mode: normalizedMode,
                sourceTitle: normalizedSourceTitle,
              }
        ));
      },
      onLiveUsersChanged: handleLiveUsersChanged,
      onSpeakingUsersChanged: handleSpeakingUsersChanged,
      onRoomParticipantsChanged: handleRoomParticipantsChanged,
      onSelfVoiceStateChanged: handleSelfVoiceStateChanged,
      onMicLevelChanged: handleMicLevelChanged,
      onAudioDevicesChanged: handleAudioDevicesChanged,
      onVoicePingChanged: (nextPingMs) => {
        const normalizedPingMs = normalizeMeasuredPingMs(nextPingMs);
        setVoicePingMs((previousValue) => (
          previousValue === normalizedPingMs ? previousValue : normalizedPingMs
        ));
      },
      onVoiceRouteChanged: (nextRouteSnapshot) => {
        setVoiceRouteSnapshot(nextRouteSnapshot || null);
      },
      onIncomingDirectCall: ({ channelName, fromUserId, fromName, fromAvatar }) => {
        if (!channelName || !fromUserId) {
          return;
        }

        const currentCall = directCallStateRef.current;
        if (
          currentCall.phase !== "idle" && currentCall.channelId !== channelName
        ) {
          voiceClientRef.current?.declineDirectCall(fromUserId, channelName, "busy").catch((error) => {
            console.error("Не удалось отклонить входящий звонок:", error);
          });
          return;
        }

        setDirectCallState(buildDirectCallState({
          phase: "incoming",
          statusLabel: "Входящий звонок",
          channelId: channelName,
          peerUserId: String(fromUserId || ""),
          peerName: String(fromName || "Пользователь"),
          peerAvatar: String(fromAvatar || ""),
          peerAvatarFrame: null,
          peer: {
            userId: String(fromUserId || ""),
            name: String(fromName || "Пользователь"),
            avatar: String(fromAvatar || ""),
            avatarFrame: null,
          },
          connectionQuality: "unknown",
          canRetry: false,
          isMiniMode: false,
          direction: "incoming",
          startedAt: new Date().toISOString(),
        }));
        showServerInviteFeedback(`Входящий звонок от ${String(fromName || "пользователя")}.`);
        showElectronDesktopNotification({
          title: "Входящий звонок",
          body: `Вам звонит ${String(fromName || "пользователь")}.`,
        });
      },
      onDirectCallAccepted: ({ channelName, fromUserId, fromName, fromAvatar }) => {
        if (!channelName || !fromUserId || directCallStateRef.current.channelId !== channelName) {
          return;
        }

        const currentCall = directCallStateRef.current;
        const connectingCall = {
          ...currentCall,
          phase: "connecting",
          status: "connecting",
          statusLabel: "Соединяем звонок",
          peerUserId: String(fromUserId || currentCall.peerUserId || ""),
          peerName: String(fromName || currentCall.peerName || "Пользователь"),
          peerAvatar: String(fromAvatar || currentCall.peerAvatar || ""),
          peer: {
            userId: String(fromUserId || currentCall.peerUserId || ""),
            name: String(fromName || currentCall.peerName || "Пользователь"),
            avatar: String(fromAvatar || currentCall.peerAvatar || ""),
            avatarFrame: currentCall.peerAvatarFrame || null,
          },
          canRetry: false,
        };
        directCallStateRef.current = connectingCall;
        setDirectCallState(connectingCall);
        openDirectChat(fromUserId);

        void (async () => {
          try {
            if (directCallStateRef.current.channelId !== channelName || directCallStateRef.current.phase !== "connecting") {
              return;
            }

            if (currentVoiceChannelRef.current && currentVoiceChannelRef.current !== channelName) {
              await disconnectFromActiveVoiceContext();
            }

            await voiceClientRef.current?.joinChannel(channelName, user);
            if (directCallStateRef.current.channelId !== channelName || directCallStateRef.current.phase !== "connecting") {
              if (currentVoiceChannelRef.current === channelName) {
                await disconnectFromActiveVoiceContext({ preserveSuppressedChannel: false });
              }
              return;
            }

            if (directCallStateRef.current.channelId !== channelName) {
              return;
            }

            const connectedCall = {
              ...directCallStateRef.current,
              phase: "connected",
              status: "connected",
              statusLabel: "Идёт разговор",
              isMiniMode: true,
              connectionQuality: getDirectCallConnectionQuality(activeLatencyMs, "connected"),
            };
            directCallStateRef.current = connectedCall;
            setDirectCallState(connectedCall);
          } catch (error) {
            console.error("Не удалось подключить исходящий звонок:", error);
            if (currentVoiceChannelRef.current === channelName) {
              try {
                await disconnectFromActiveVoiceContext({ preserveSuppressedChannel: false });
              } catch (leaveError) {
                console.error("Не удалось сбросить состояние личного звонка:", leaveError);
              }
            }
            appendDirectCallHistoryEntry({
              peerUserId: String(fromUserId || directCallStateRef.current.peerUserId || ""),
              peerName: String(fromName || directCallStateRef.current.peerName || "Пользователь"),
              peerAvatar: String(fromAvatar || directCallStateRef.current.peerAvatar || ""),
              direction: "outgoing",
              outcome: "failed",
            });
            const failedCall = buildDirectCallState({
              phase: "disconnected",
              statusLabel: "Не удалось подключить звонок",
              peerUserId: String(fromUserId || directCallStateRef.current.peerUserId || ""),
              peerName: String(fromName || directCallStateRef.current.peerName || "Пользователь"),
              peerAvatar: String(fromAvatar || directCallStateRef.current.peerAvatar || ""),
              peerAvatarFrame: directCallStateRef.current.peerAvatarFrame || null,
              canRetry: true,
              isMiniMode: false,
              direction: "outgoing",
              lastReason: error?.message || "failed",
              endedAt: new Date().toISOString(),
            });
            directCallStateRef.current = failedCall;
            setDirectCallState(failedCall);
            showServerInviteFeedback(error?.message || "Не удалось подключить звонок.");
          }
        })();
      },
      onDirectCallDeclined: ({ channelName, fromName, reason }) => {
        if (!channelName || directCallStateRef.current.channelId !== channelName) {
          return;
        }

        const normalizedReason = String(reason || "").trim().toLowerCase();
        const fallbackName = String(fromName || directCallStateRef.current.peerName || "Пользователь");
        const statusMessage =
          normalizedReason === "offline"
            ? `${fallbackName} сейчас не в сети.`
            : normalizedReason === "busy"
              ? `${fallbackName} сейчас занят другим звонком.`
              : normalizedReason === "cancelled"
                ? `${fallbackName} отменил звонок.`
                : `${fallbackName} отклонил звонок.`;
        void clearRemoteDirectCall({
          channelName,
          fromName: fallbackName,
          outcome: normalizedReason || "declined",
          feedbackMessage: statusMessage,
        });
      },
      onDirectCallEnded: ({ channelName, fromName }) => {
        if (!channelName || directCallStateRef.current.channelId !== channelName) {
          return;
        }

        const fallbackName = String(fromName || directCallStateRef.current.peerName || "Пользователь");
        void clearRemoteDirectCall({
          channelName,
          fromName: fallbackName,
          outcome: "ended",
          feedbackMessage: `${fallbackName} завершил звонок.`,
        });
      },
    });
    voiceClientRef.current = client;
    applySelectedAudioDevicesToClient(client);
    applyVoiceProcessingToClient(client);
    client.connect(user).catch((error) => logVoiceHubError("Ошибка подключения к голосовому хабу:", error));
    flushQueuedSelfVoiceState();
      return client;
    };

    initializeVoiceClientRef.current = initializeVoiceClient;

    const scheduleVoiceClientInit = () => {
      ensureVoiceClientReady().catch((error) => {
        logVoiceHubError("Voice client initialization failed:", error);
      });
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleInitRequestId = window.requestIdleCallback(() => {
        scheduleVoiceClientInit();
      }, { timeout: 900 });
    } else {
      initializeTimeoutId = window.setTimeout(() => {
        scheduleVoiceClientInit();
      }, 450);
    }

    return () => {
      disposed = true;
      window.clearTimeout(initializeTimeoutId);
      if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function" && idleInitRequestId) {
        window.cancelIdleCallback(idleInitRequestId);
      }
      if (initializeVoiceClientRef.current === initializeVoiceClient) {
        initializeVoiceClientRef.current = null;
      }
      if (client) {
        client.disconnect().catch((error) => logVoiceHubError("Ошибка отключения от голосового хаба:", error));
      }
      if (voiceClientRef.current === client) voiceClientRef.current = null;
    };
  }, [
    applySelectedAudioDevicesToClient,
    applyVoiceProcessingToClient,
    handleAudioDevicesChanged,
    handleLiveUsersChanged,
    handleMicLevelChanged,
    handleParticipantsMapChanged,
    handleRemoteScreenStreamsChanged,
    handleRoomParticipantsChanged,
    handleSelfVoiceStateChanged,
    handleSpeakingUsersChanged,
    ensureVoiceClientReady,
    flushQueuedSelfVoiceState,
    user?.id,
  ]);
  useEffect(() => {
    if (!user?.id || !voiceClientRef.current) return;
    voiceClientRef.current.connect(user).catch((error) => logVoiceHubError("Ошибка обновления пользователя в голосовом хабе:", error));
  }, [user?.id, user?.nickname, user?.firstName, user?.first_name, user?.avatarUrl, user?.avatar]);
  useEffect(() => {
    const shouldMutePublishedMic =
      isMicMuted || (Boolean(currentVoiceChannel) && !isDirectCallChannelId(currentVoiceChannel) && isSoundMuted);
    const effectiveMicVolume = isMicTestActive ? micVolume : currentVoiceChannel ? (shouldMutePublishedMic ? 0 : micVolume) : micVolume;
    voiceClientRef.current?.setMicrophoneVolume(effectiveMicVolume);
  }, [currentVoiceChannel, micVolume, isMicMuted, isMicTestActive, isSoundMuted]);
  useEffect(() => {
    const shouldMutePublishedMic =
      isMicMuted
      || (Boolean(currentVoiceChannel) && isMicTestActive)
      || (Boolean(currentVoiceChannel) && !isDirectCallChannelId(currentVoiceChannel) && isSoundMuted);
    queueSelfVoiceStateSync({ isMicMuted: shouldMutePublishedMic, isDeafened: isSoundMuted });
  }, [currentVoiceChannel, isMicMuted, isMicTestActive, isSoundMuted, queueSelfVoiceStateSync]);
  useEffect(() => {
    voiceClientRef.current?.setRemoteVolume(isSoundMuted ? 0 : audioVolume);
  }, [audioVolume, isSoundMuted]);
  useEffect(() => {
    const voiceClient = voiceClientRef.current;
    if (!voiceClient) {
      return undefined;
    }

    if (!isMicTestActive) {
      voiceClient.stopMicrophoneTestPlayback?.().catch((error) => {
        console.error("Ошибка остановки проверки микрофона:", error);
      });
      return undefined;
    }

    voiceClient.startMicrophoneTestPlayback?.().catch((error) => {
      console.error("Ошибка запуска проверки микрофона:", error);
      setIsMicTestActive(false);
    });

    return () => {
      voiceClient.stopMicrophoneTestPlayback?.().catch((error) => {
        console.error("Ошибка остановки проверки микрофона:", error);
      });
    };
  }, [isMicTestActive]);
  useEffect(() => {
    if (!showCameraModal) {
      stopCameraPreview();
      return;
    }

    if (isCameraShareActive) {
      stopCameraPreview();
      return;
    }

    loadCameraDevices(selectedVideoDeviceId).catch((error) => {
      console.error("Ошибка обновления списка камер:", error);
    });
  }, [isCameraShareActive, selectedVideoDeviceId, showCameraModal]);
  useEffect(() => () => {
    stopCameraPreview();
  }, []);
  useEffect(() => {
    const previousChannel = previousVoiceChannelRef.current;
    if (voiceTransitionSoundTimeoutRef.current) {
      clearTimeout(voiceTransitionSoundTimeoutRef.current);
      voiceTransitionSoundTimeoutRef.current = null;
    }

    const pendingLocalTransition = pendingLocalVoiceTransitionRef.current;
    if (
      pendingLocalTransition
      && String(pendingLocalTransition.from || "") === String(previousChannel || "")
      && String(pendingLocalTransition.to || "") === String(currentVoiceChannel || "")
    ) {
      pendingLocalVoiceTransitionRef.current = null;
      previousVoiceChannelRef.current = currentVoiceChannel;
      return;
    }

    if (!previousChannel && currentVoiceChannel) {
      playUiTone("join");
    } else if (previousChannel && !currentVoiceChannel) {
      playUiTone("leave");
    } else if (previousChannel && currentVoiceChannel && previousChannel !== currentVoiceChannel) {
      playUiTone("leave");
      voiceTransitionSoundTimeoutRef.current = window.setTimeout(() => {
        playUiTone("join");
        voiceTransitionSoundTimeoutRef.current = null;
      }, 90);
    }

    pendingLocalVoiceTransitionRef.current = null;
    previousVoiceChannelRef.current = currentVoiceChannel;
  }, [currentVoiceChannel]);
  useEffect(() => () => {
    if (voiceTransitionSoundTimeoutRef.current) {
      clearTimeout(voiceTransitionSoundTimeoutRef.current);
      voiceTransitionSoundTimeoutRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (!currentVoiceChannel) {
      previousVoiceParticipantIdsRef.current = { channelId: "", participantIds: [] };
      return;
    }

    const nextParticipantIds = currentVoiceParticipants
      .map((participant) => String(participant?.userId || ""))
      .filter(Boolean);
    const previousSnapshot = previousVoiceParticipantIdsRef.current;

    if (previousSnapshot.channelId !== String(currentVoiceChannel)) {
      previousVoiceParticipantIdsRef.current = {
        channelId: String(currentVoiceChannel),
        participantIds: nextParticipantIds,
      };
      return;
    }

    const previousParticipantSet = new Set(previousSnapshot.participantIds);
    const nextParticipantSet = new Set(nextParticipantIds);
    const selfUserId = String(currentUserId || "");
    const joinedRemoteParticipants = nextParticipantIds.filter((userId) => userId !== selfUserId && !previousParticipantSet.has(userId));
    const leftRemoteParticipants = previousSnapshot.participantIds.filter((userId) => userId !== selfUserId && !nextParticipantSet.has(userId));

    if (joinedRemoteParticipants.length) {
      playUiTone("join");
    } else if (leftRemoteParticipants.length) {
      playUiTone("leave");
    }

    previousVoiceParticipantIdsRef.current = {
      channelId: String(currentVoiceChannel),
      participantIds: nextParticipantIds,
    };
  }, [currentUserId, currentVoiceChannel, currentVoiceParticipants]);
  useEffect(() => () => {
    clearScreenShareStartToneTimeout();
  }, []);
  useEffect(() => {
    if (!currentVoiceChannel) {
      previousLiveVoiceUserIdsRef.current = { channelId: "", userIds: [] };
      return;
    }

    const nextLiveUserIds = currentVoiceParticipants
      .filter((participant) => participant?.isLive)
      .map((participant) => String(participant?.userId || ""))
      .filter(Boolean);
    const previousSnapshot = previousLiveVoiceUserIdsRef.current;

    if (previousSnapshot.channelId !== String(currentVoiceChannel)) {
      previousLiveVoiceUserIdsRef.current = {
        channelId: String(currentVoiceChannel),
        userIds: nextLiveUserIds,
      };
      return;
    }

    const previousLiveSet = new Set(previousSnapshot.userIds);
    const nextLiveSet = new Set(nextLiveUserIds);
    const startedShares = nextLiveUserIds.filter((userId) => !previousLiveSet.has(userId));
    const stoppedShares = previousSnapshot.userIds.filter((userId) => !nextLiveSet.has(userId));
    const selfUserId = String(currentUserId || "");
    const onlyLocalStart = Boolean(selfUserId) && startedShares.length > 0 && startedShares.every((userId) => userId === selfUserId);
    const onlyLocalStop = Boolean(selfUserId) && stoppedShares.length > 0 && stoppedShares.every((userId) => userId === selfUserId);

    if (startedShares.length) {
      if (onlyLocalStart && pendingLocalScreenShareToneRef.current === "shareStart") {
        pendingLocalScreenShareToneRef.current = "";
      } else {
        playUiTone("shareStart");
      }
    } else if (stoppedShares.length) {
      clearScreenShareStartToneTimeout();
      if (onlyLocalStop && pendingLocalScreenShareToneRef.current === "shareStop") {
        pendingLocalScreenShareToneRef.current = "";
      } else {
        playUiTone("shareStop");
      }
    }

    previousLiveVoiceUserIdsRef.current = {
      channelId: String(currentVoiceChannel),
      userIds: nextLiveUserIds,
    };
  }, [currentUserId, currentVoiceChannel, currentVoiceParticipants]);
  useEffect(() => {
    if (!currentVoiceChannel) {
      previousMicMutedRef.current = isMicMuted;
      return;
    }

    if (previousMicMutedRef.current === null) {
      previousMicMutedRef.current = isMicMuted;
      return;
    }

    if (previousMicMutedRef.current !== isMicMuted) {
      const nextTone = isMicMuted ? "mute" : "unmute";
      if (pendingLocalMicToneRef.current === nextTone) {
        pendingLocalMicToneRef.current = "";
      } else {
        playUiTone(nextTone);
      }
    }

    previousMicMutedRef.current = isMicMuted;
  }, [currentVoiceChannel, isMicMuted]);
  useEffect(() => {
    if (!currentVoiceChannel) {
      previousSoundMutedRef.current = isSoundMuted;
      return;
    }

    if (previousSoundMutedRef.current === null) {
      previousSoundMutedRef.current = isSoundMuted;
      return;
    }

    if (previousSoundMutedRef.current !== isSoundMuted) {
      const nextTone = isSoundMuted ? "mute" : "unmute";
      if (pendingLocalSoundToneRef.current === nextTone) {
        pendingLocalSoundToneRef.current = "";
      } else {
        playUiTone(nextTone);
      }
    }

    previousSoundMutedRef.current = isSoundMuted;
  }, [currentVoiceChannel, isSoundMuted]);

  const replaceServerSnapshot = (snapshot, { activate = false } = {}) => {
    if (!snapshot) return;

    const normalizedServer = normalizeServers([{ ...snapshot, isShared: true }], user)[0];
    if (!normalizedServer) return;
    setServers((previous) => {
      const existingIndex = previous.findIndex((server) =>
        server.id === normalizedServer.id ||
        getCanonicalSharedServerId(server.id, server.ownerId || normalizedServer.ownerId) === normalizedServer.id
      );
      if (existingIndex === -1) {
        return [...previous, normalizedServer];
      }

      const nextServers = [...previous];
      nextServers[existingIndex] = {
        ...normalizedServer,
        isShared: previous[existingIndex]?.isShared || normalizedServer.isShared,
      };
      return nextServers;
    });

    setActiveServerId((previousActiveServerId) =>
      previousActiveServerId === normalizedServer.id ||
      getCanonicalSharedServerId(previousActiveServerId, normalizedServer.ownerId) === normalizedServer.id
        ? normalizedServer.id
        : previousActiveServerId
    );

    if (activate) {
      setWorkspaceMode("servers");
      setActiveServerId(normalizedServer.id);
      setCurrentTextChannelId(getStoredTextChannelId(activeTextChannelStorageKey, normalizedServer) || normalizedServer.textChannels?.[0]?.id || "");
    }
  };
  const updateServer = (updater) => setServers((previous) => previous.map((server) => (server.id === activeServerId ? updater(server) : server)));
  const syncServerSnapshot = async (serverSnapshot, { applyResponse = true } = {}) => {
    if (
      !serverSnapshot ||
      !currentUserId ||
      (
        !hasServerPermission(serverSnapshot, currentUserId, "manage_server") &&
        !hasServerPermission(serverSnapshot, currentUserId, "manage_channels")
      )
    ) {
      return null;
    }

    const syncKey = getServerSnapshotKey(serverSnapshot);
    const syncFingerprint = getServerSyncFingerprint(serverSnapshot);
    if (syncKey && syncFingerprint) {
      pendingServerSyncFingerprintsRef.current.set(syncKey, syncFingerprint);
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/server-invites/server-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorUserId: currentUserId,
          serverSnapshot,
        }),
      });

      if (response.status === 403) {
        return null;
      }

      const data = await parseApiResponse(response);
      if (response.ok && data) {
        if (applyResponse) {
          replaceServerSnapshot(data);
        }
        return data;
      }
    } catch (error) {
      console.error("Ошибка синхронизации сервера:", error);
    } finally {
      if (syncKey && syncFingerprint) {
        window.setTimeout(() => {
          if (pendingServerSyncFingerprintsRef.current.get(syncKey) === syncFingerprint) {
            pendingServerSyncFingerprintsRef.current.delete(syncKey);
          }
        }, 2000);
      }
    }

    return null;
  };
  const refreshServerSnapshot = async (serverId) => {
    if (!serverId) return;

    const requestServer = latestServersRef.current.find((server) =>
      server.id === serverId || getServerSnapshotKey(server) === getServerSnapshotKey(serverId, server.ownerId)
    );
    const requestFingerprint = getServerSyncFingerprint(requestServer);

    try {
      const response = await authFetch(`${API_BASE_URL}/server-invites/server/${serverId}`, {
        method: "GET",
        cache: "no-store",
      });

      const snapshot = await parseApiResponse(response);
      if (!response.ok || !snapshot) {
        return;
      }

      const snapshotKey = getServerSnapshotKey(snapshot);
      const latestServer = latestServersRef.current.find((server) =>
        server.id === snapshot.id || getServerSnapshotKey(server) === snapshotKey
      );
      const latestFingerprint = getServerSyncFingerprint(latestServer);
      const pendingFingerprint = pendingServerSyncFingerprintsRef.current.get(snapshotKey);
      if (pendingFingerprint && pendingFingerprint === latestFingerprint) {
        return;
      }

      if (requestFingerprint && latestFingerprint && requestFingerprint !== latestFingerprint) {
        return;
      }

      replaceServerSnapshot(snapshot);
    } catch (error) {
      console.error("Ошибка обновления сервера:", error);
    }
  };
  const openSettingsPanel = useCallback((tab = "voice_video") => {
    const traceId = startPerfTrace("menu-main", "open-settings-panel", {
      tab: String(tab || "voice_video"),
    });
    setSettingsTab(tab);
    setOpenSettings(true);
    setShowServerMembersPanel(false);
    setShowMicMenu(false);
    setShowSoundMenu(false);
    finishPerfTraceOnNextFrame(traceId, {
      tab: String(tab || "voice_video"),
    });
  }, []);
  const openServerSettingsPanel = useCallback(() => {
    openSettingsPanel("server");
  }, [openSettingsPanel]);
  const openCreateServerModal = () => {
    setCreateServerName("");
    setCreateServerIcon("");
    setCreateServerIconFrame(getDefaultMediaFrame());
    setCreateServerError("");
    setShowCreateServerModal(true);
  };
  const closeCreateServerModal = () => {
    setShowCreateServerModal(false);
    setCreateServerIconFrame(getDefaultMediaFrame());
    setCreateServerError("");
  };
  const {
    mediaFrameEditorState,
    avatarInputRef,
    profileBackgroundInputRef,
    serverIconInputRef,
    closeMediaFrameEditor,
    handleMediaFrameConfirm,
    handleCreateServerIconChange,
    handleAvatarChange,
    handleProfileBackgroundChange,
    handleServerIconChange,
  } = useMenuMainMediaFrameActions({
    user,
    setUser,
    activeServer,
    canManageServer,
    updateServer,
    setProfileDraft,
    setProfileStatus,
    createServerIconFrame,
    setCreateServerIcon,
    setCreateServerIconFrame,
    setCreateServerError,
  });
  const handleAddServer = () => {
    openCreateServerModal();
  };
  const handleCreateServerSubmit = (event) => {
    event?.preventDefault?.();
    const nextName = String(createServerName || "");
    if (!nextName.trim()) {
      setCreateServerError("Введите название сервера.");
      return;
    }

    const server = createServer(nextName, user, {
      icon: createServerIcon || DEFAULT_SERVER_ICON,
      iconFrame: createServerIconFrame,
    });
    setServers((previous) => [...previous, server]);
    setWorkspaceMode("servers");
    setActiveServerId(server.id);
    setCurrentTextChannelId(server.textChannels[0]?.id || "");
    setDesktopServerPane("text");
    setActiveDirectFriendId("");
    setShowCreateServerModal(false);
    setCreateServerName("");
    setCreateServerIcon("");
    setCreateServerIconFrame(getDefaultMediaFrame());
    setCreateServerError("");
  };
  const handleDeleteServer = async (serverId) => {
    const serverToDelete = servers.find((server) => String(server.id) === String(serverId));
    if (!serverToDelete) return;
    setServerContextMenu(null);
    if (!hasServerPermission(serverToDelete, currentUserId, "manage_server")) return;
    if (isPersonalDefaultServer(serverToDelete, user)) {
      setProfileStatus("Личный сервер нельзя удалить.");
      return;
    }

    const serverName = serverToDelete.name || "сервер";
    const isOwnerDelete = isServerOwnedByUser(serverToDelete, currentUserId);
    const confirmMessage = isOwnerDelete
      ? `Удалить сервер «${serverName}»? Это действие нельзя отменить.`
      : `Удалить сервер «${serverName}»?`;
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;

    if (serverToDelete.isShared) {
      try {
        const response = await authFetch(`${API_BASE_URL}/server-invites/server/${encodeURIComponent(serverToDelete.id)}`, {
          method: "DELETE",
        });

        if (!response.ok && response.status !== 404) {
          const data = await parseApiResponse(response);
          throw new Error(getApiErrorMessage(response, data, "Не удалось удалить сервер."));
        }
      } catch (error) {
        setProfileStatus(error?.message || "Не удалось удалить сервер.");
        return;
      }
    }

    if (serverToDelete.voiceChannels.some((channel) => getScopedVoiceChannelId(serverToDelete.id, channel.id) === currentVoiceChannel)) await leaveVoiceChannel();
    const nextServers = servers.filter((server) => String(server.id) !== String(serverId));
    const nextActiveId = String(activeServerId) === String(serverId) ? nextServers[0]?.id || "" : activeServerId;
    const nextActiveServer = nextServers.find((server) => server.id === nextActiveId) || nextServers[0] || null;
    setServers(nextServers);
    setActiveServerId(nextActiveId);
    setCurrentTextChannelId(getStoredTextChannelId(activeTextChannelStorageKey, nextActiveServer) || nextActiveServer?.textChannels?.[0]?.id || "");
    setSelectedStreamUserId(null);
    setProfileStatus("Сервер удалён.");
  };
  const updateActiveServerName = (value) => {
    if (!canManageServer) return;
    updateServer((server) => ({ ...server, name: value }));
  };
  const updateActiveServerDescription = (value) => {
    if (!canManageServer) return;
    updateServer((server) => ({ ...server, description: String(value || "").slice(0, 280) }));
  };
  const updateMicVolume = (value) => {
    const normalizedValue = clampDeviceVolumePercent(value, micVolume);
    setMicVolume(normalizedValue);
    const effectiveMicVolume = currentVoiceChannel ? (isMicMuted || isSoundMuted ? 0 : normalizedValue) : normalizedValue;
    voiceClientRef.current?.setMicrophoneVolume(effectiveMicVolume);
  };
  const updateAudioVolume = (value) => {
    const normalizedValue = clampDeviceVolumePercent(value, audioVolume);
    setAudioVolume(normalizedValue);
    voiceClientRef.current?.setRemoteVolume(isSoundMuted ? 0 : normalizedValue);
  };
  const handleInputDeviceChange = (deviceId) => {
    setSelectedInputDeviceId(deviceId || "");
  };
  const handleOutputDeviceChange = (deviceId) => {
    setSelectedOutputDeviceId(deviceId || "");
  };
  const handleNoiseSuppressionModeChange = (mode) => {
    const normalizedMode =
      mode === "voice_isolation"
        ? "hard_gate"
        : mode === "rnnoise" || mode === "krisp" || mode === "ai_noise_suppression"
          ? "hard_gate"
          : mode;
    setNoiseSuppressionMode(VOICE_INPUT_MODES.includes(normalizedMode) ? normalizedMode : DEFAULT_VOICE_INPUT_MODE);
    setShowNoiseMenu(false);
  };
  const toggleEchoCancellation = () => {
    setEchoCancellationEnabled((previous) => !previous);
  };
  const openMemberActionsMenu = (event, member) => {
    const triggerRect = event.currentTarget.getBoundingClientRect();
    setMemberRoleMenu({
      memberUserId: member.userId,
      x: Math.max(12, Math.min(triggerRect.right - 188, window.innerWidth - 232)),
      y: Math.max(12, Math.min(triggerRect.bottom + 8, window.innerHeight - 320)),
    });
  };
  const updateMemberRole = (memberUserId, roleId) => {
    if (!activeServer || !canAssignRoleToMember(activeServer, currentUserId, memberUserId, roleId)) return;
    const nextServer = {
      ...activeServer,
      members: activeServer.members.map((member) =>
        String(member.userId) === String(memberUserId) ? { ...member, roleId } : member
      ),
    };
    updateServer(() => nextServer);
    if (nextServer.isShared) {
      syncServerSnapshot(nextServer);
    }
    setMemberRoleMenu(null);
  };
  const updateMemberNickname = (memberUserId) => {
    if (!activeServer || !canManageTargetMember(activeServer, currentUserId, memberUserId, "manage_nicknames")) return;
    const targetMember = activeServer.members.find((member) => String(member.userId) === String(memberUserId));
    if (!targetMember) return;

    const nextName = window.prompt("Введите новый ник участника", targetMember.name || "");
    if (typeof nextName !== "string") {
      return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) {
      return;
    }

    const nextServer = {
      ...activeServer,
      members: activeServer.members.map((member) =>
        String(member.userId) === String(memberUserId) ? { ...member, name: trimmedName } : member
      ),
    };
    updateServer(() => nextServer);
    if (nextServer.isShared) {
      syncServerSnapshot(nextServer);
    }
    setMemberRoleMenu(null);
  };
  const updateMemberVoiceState = async (memberUserId, nextState) => {
    if (!voiceClientRef.current) {
      return;
    }

    try {
      await voiceClientRef.current.updateParticipantVoiceState(memberUserId, nextState);
      setMemberRoleMenu(null);
    } catch (error) {
      console.error("Ошибка обновления голосового состояния участника:", error);
    }
  };
  const markServerAsShared = (serverId) => {
    if (!serverId) return;
    setServers((previous) =>
      previous.map((server) => {
        const canonicalServerId = getCanonicalSharedServerId(server.id, server.ownerId);
        if ((server.id === serverId || canonicalServerId === serverId) && !isPersonalDefaultServer(server, user)) {
          return { ...server, id: serverId, isShared: true };
        }

        return server;
      })
    );
    setActiveServerId((previousActiveServerId) => {
      if (previousActiveServerId === serverId) {
        return previousActiveServerId;
      }

      const previousActiveServer = servers.find((server) => server.id === previousActiveServerId);
      if (!previousActiveServer) {
        return previousActiveServerId;
      }

      const canonicalServerId = getCanonicalSharedServerId(previousActiveServer.id, previousActiveServer.ownerId);
      return canonicalServerId === serverId ? serverId : previousActiveServerId;
    });
  };
  const {
    serverInviteFeedback,
    showServerInviteFeedback,
    requestServerInviteLink,
    handleInvitePeopleToVoice,
    copyServerInviteLink,
  } = useServerInviteActions({
    apiBaseUrl: API_BASE_URL,
    activeServer,
    servers,
    serverContextMenu,
    setServerContextMenu,
    canInviteToServer,
    syncServerSnapshot,
    markServerAsShared,
  });
  const {
    closeServerInviteModal,
    createServerInviteLinkForModal,
    handleLeaveServer,
    openServerInviteModal,
    serverInviteModalOpen,
    serverInviteTarget,
    serverInviteTargetChannelName,
  } = useMenuMainServerInviteFlow({
    activeServer,
    activeServerId,
    activeTextChannelStorageKey,
    canInviteToServer,
    currentTextChannel,
    currentVoiceChannel,
    leaveVoiceChannel: requestLeaveVoiceChannel,
    requestServerInviteLink,
    servers,
    setActiveServerId,
    setCurrentTextChannelId,
    setProfileStatus,
    setSelectedStreamUserId,
    setServerContextMenu,
    setServers,
    showServerInviteFeedback,
    user,
  });
  const {
    showQrScannerModal,
    qrScannerDevices,
    selectedQrScannerDeviceId,
    qrScannerPreviewRef,
    hasQrScannerPreview,
    qrScannerError,
    qrScannerStatus,
    openQrDeviceScanner,
    closeQrScannerModal,
    handleQrScannerDeviceChange,
    startQrScannerPreview,
  } = useMenuMainQrScanner({
    refreshDeviceSessions,
    showServerInviteFeedback,
  });
  const {
    startDirectCallWithUser,
    acceptDirectCall,
    declineDirectCall,
    endDirectCall,
    retryDirectCall,
    clearRemoteDirectCall,
    setDirectCallMiniMode,
    dismissDirectCallOverlay,
  } = useMenuMainDirectCalls({
    currentUserId,
    user,
    directConversationTargets,
    activeLatencyMs,
    directCallStateRef,
    currentVoiceChannelRef,
    voiceClientRef,
    ensureVoiceClientReady,
    disconnectFromActiveVoiceContext,
    openDirectChat,
    setDirectCallState,
    appendDirectCallHistoryEntry,
    showServerInviteFeedback,
  });
  const startDirectCallIfAllowed = useCallback((targetUserId) => {
    const normalizedUserId = String(targetUserId || "").trim();
    const targetFriend = friendsWithRelationState.find((friend) => String(friend?.id || "") === normalizedUserId);
    if (targetFriend?.isBlocked) {
      showServerInviteFeedback("Вы заблокировали этого пользователя. Звонок недоступен.");
      return;
    }

    if (targetFriend?.blockedYou) {
      showServerInviteFeedback("Пользователь ограничил общение с вами. Звонок недоступен.");
      return;
    }

    return startDirectCallWithUser(targetUserId);
  }, [friendsWithRelationState, showServerInviteFeedback, startDirectCallWithUser]);
  useMenuMainKeyboardShortcuts({
    quickSwitcherOpen,
    quickSwitcherItems,
    quickSwitcherSelectedIndex,
    setQuickSwitcherOpen,
    setQuickSwitcherQuery,
    setQuickSwitcherSelectedIndex,
    closeQuickSwitcher,
    handleQuickSwitcherSelect,
    toggleMicMute,
    toggleSoundMute,
    directCallStateRef,
    acceptDirectCall,
    declineDirectCall,
    endDirectCall,
    navigateHistoryBack,
    navigateHistoryForward,
  });
  const sendServerInviteToFriend = useCallback(
    async (friend, inviteLink) => {
      const friendId = String(friend?.id || friend?.userId || "").trim();
      const channelId = String(friend?.directChannelId || buildDirectMessageChannelId(currentUserId, friendId)).trim();

      if (!friendId || !channelId || !inviteLink) {
        throw new Error("Не удалось подготовить личный чат.");
      }

      await sendMessagesCompatCore(channelId, getUserAvatar(user), [
        {
          clientTempId: createId("server-invite"),
          message: inviteLink,
        },
      ], { allowBatch: false, user });
    },
    [currentUserId, user]
  );
  const findInviteServerForFriend = useCallback((targetUserId) => {
    const normalizedUserId = String(targetUserId || "").trim();
    if (!normalizedUserId) {
      return null;
    }

    const seenServerIds = new Set();
    return [activeServer, ...servers].find((server) => {
      const serverId = String(server?.id || "");
      if (!serverId || seenServerIds.has(serverId) || !canInviteToServer(server)) {
        return false;
      }

      seenServerIds.add(serverId);
      return !(server.members || []).some((member) => String(member?.userId || member?.id || "") === normalizedUserId);
    }) || null;
  }, [activeServer, canInviteToServer, servers]);
  const canInviteFriendToAnyServer = useCallback(
    (targetUserId) => Boolean(findInviteServerForFriend(targetUserId)),
    [findInviteServerForFriend]
  );
  const handleInviteFriendListUserToServer = useCallback(async () => {
    const menu = friendListUserContextMenu;
    const targetUserId = String(menu?.userId || "").trim();
    if (!targetUserId || menu?.isSelf || menu?.isBlocked || menu?.blockedYou) {
      return;
    }

    const targetServer = findInviteServerForFriend(targetUserId);
    if (!targetServer) {
      showServerInviteFeedback("Нет сервера, куда можно пригласить этого друга.");
      setFriendListUserContextMenu(null);
      return;
    }

    setFriendListUserContextMenu(null);
    showServerInviteFeedback("Готовим приглашение...");

    try {
      const inviteLink = await requestServerInviteLink(targetServer, { copyToClipboard: false });
      await sendServerInviteToFriend({
        id: targetUserId,
        userId: targetUserId,
        directChannelId: menu.directChannelId || buildDirectMessageChannelId(currentUserId, targetUserId),
      }, inviteLink);
      showServerInviteFeedback(`Приглашение на ${targetServer.name || "сервер"} отправлено.`);
    } catch (error) {
      showServerInviteFeedback(error?.message || "Не удалось отправить приглашение.");
    }
  }, [
    currentUserId,
    findInviteServerForFriend,
    friendListUserContextMenu,
    requestServerInviteLink,
    sendServerInviteToFriend,
    showServerInviteFeedback,
  ]);
  const joinVoiceChannel = async (channel) => {
    if (!user?.id || !channel?.id || !activeServer?.id) return;
    const scopedChannelId = getScopedVoiceChannelId(activeServer.id, channel.id);
    setSelectedVoiceChannelId(channel.id);
    const userLimit = Math.min(99, Math.max(0, Number(channel.userLimit || 0)));
    const channelParticipants = activeVoiceParticipantsMap?.[channel.id] || activeVoiceParticipantsMap?.[scopedChannelId] || [];
    const clientVoiceChannelId = String(voiceClientRef.current?.getCurrentChannel?.() || "");
    const isAlreadyInTargetChannel =
      String(currentVoiceChannelRef.current || "") === String(scopedChannelId)
      || clientVoiceChannelId === String(scopedChannelId);
    const showSelectedVoicePane = ({ syncCurrentChannel = false } = {}) => {
      const shouldSyncCurrentChannel =
        syncCurrentChannel && String(currentVoiceChannelRef.current || "") !== String(scopedChannelId);
      const shouldSwitchMobilePane =
        isMobileViewport && (mobileSection !== "servers" || mobileServersPane !== "voice");

      if (desktopServerPane === "voice" && !shouldSwitchMobilePane && !shouldSyncCurrentChannel) {
        return;
      }

      pushNavigationHistory(() => {
        setDesktopServerPane("voice");
        if (shouldSyncCurrentChannel) {
          setCurrentVoiceChannel(scopedChannelId);
        }
        if (isMobileViewport) {
          setMobileSection("servers");
          setMobileServersPane("voice");
        }
      });
    };

    if (voiceJoinInFlightRef.current && pendingVoiceChannelTargetRef.current === scopedChannelId) {
      showSelectedVoicePane();
      return;
    }

    if (isAlreadyInTargetChannel) {
      pendingLocalVoiceTransitionRef.current = null;
      setJoiningVoiceChannelId((previous) => (String(previous || "") === scopedChannelId ? "" : previous));
      showSelectedVoicePane({ syncCurrentChannel: true });
      return;
    }

    if (userLimit > 0 && !isAlreadyInTargetChannel && channelParticipants.length >= userLimit) {
      showServerInviteFeedback(`Голосовой канал заполнен: ${userLimit}/${userLimit}.`);
      return;
    }

    if (!voiceClientRef.current) {
      await ensureVoiceClientReady();
    }
    if (!voiceClientRef.current) return;

    const joinTraceId = startPerfTrace("voice", "join-voice-channel", {
      channelId: String(channel.id || ""),
      scopedChannelId,
      serverId: String(activeServer.id || ""),
    });
    let joinSucceeded = false;
    let joinTraceFinished = false;
    const finishJoinTrace = (extra = {}) => {
      if (joinTraceFinished) {
        return;
      }

      joinTraceFinished = true;
      finishPerfTrace(joinTraceId, extra);
    };
    const activateJoinedVoiceUi = () => {
      pushNavigationHistory(() => {
        setDesktopServerPane("voice");
        setCurrentVoiceChannel((previousValue) => (
          String(previousValue || "") === scopedChannelId ? previousValue : scopedChannelId
        ));
        if (isMobileViewport) {
          setMobileSection("servers");
          setMobileServersPane("voice");
        }
      });
    };

    playImmediateVoiceTransitionTone(scopedChannelId);

    const joinAttemptId = voiceJoinAttemptRef.current + 1;
    voiceJoinAttemptRef.current = joinAttemptId;
    voiceJoinInFlightRef.current = true;
    pendingVoiceChannelTargetRef.current = scopedChannelId;
    if (suppressedVoiceChannelRef.current === scopedChannelId) {
      suppressedVoiceChannelRef.current = "";
    }
    setJoiningVoiceChannelId(scopedChannelId);
    try {
      await voiceClientRef.current.joinChannel(scopedChannelId, user, {
        audioBitrateKbps: Number(channel.bitrateKbps || 64),
        userLimit,
        videoQuality: channel.videoQuality || "auto",
        region: channel.region || "auto",
      });
      if (voiceJoinAttemptRef.current !== joinAttemptId) {
        const latestPendingChannelId = String(pendingVoiceChannelTargetRef.current || "");
        const latestVisibleChannelId = String(currentVoiceChannelRef.current || "");
        const clientVoiceChannelId = String(voiceClientRef.current?.getCurrentChannel?.() || "");
        const isStaleChannelStillActive =
          latestPendingChannelId === scopedChannelId
          || latestVisibleChannelId === scopedChannelId
          || clientVoiceChannelId === scopedChannelId;
        if (isStaleChannelStillActive) {
          try {
            await voiceClientRef.current.leaveChannel();
          } catch {
            // ignore stale join cleanup failures
          }
        }
        finishJoinTrace({
          channelId: String(channel.id || ""),
          retry: false,
          scopedChannelId,
          success: false,
          cancelled: true,
        });
        return;
      }
      activateJoinedVoiceUi();
      joinSucceeded = true;
    } catch (error) {
      if (voiceJoinAttemptRef.current === joinAttemptId) {
        const errorName = String(error?.name || "").trim();
        const isMicrophoneStartError = errorName === "NotReadableError" || errorName === "TrackStartError";
        if (isMicrophoneStartError) {
          const message = error?.message || "Микрофон не удалось запустить. Закройте приложения, которые могут использовать микрофон, или выберите другой вход в настройках голоса.";
          showServerInviteFeedback(message);
          console.error("Ошибка входа в голосовой канал:", error);
          pendingLocalVoiceTransitionRef.current = null;
          setCurrentVoiceChannel(null);
          setJoiningVoiceChannelId("");
          finishJoinTrace({
            channelId: String(channel.id || ""),
            retry: false,
            scopedChannelId,
            success: false,
          });
          return;
        }

        try {
          await voiceClientRef.current.leaveChannel();
        } catch {
          // ignore retry cleanup failures
        }

        try {
          await voiceClientRef.current.joinChannel(scopedChannelId, user, {
            audioBitrateKbps: Number(channel.bitrateKbps || 64),
            userLimit,
            videoQuality: channel.videoQuality || "auto",
            region: channel.region || "auto",
          });
          activateJoinedVoiceUi();
          joinSucceeded = true;
          finishJoinTrace({
            channelId: String(channel.id || ""),
            retry: true,
            scopedChannelId,
            success: true,
          });
          return;
        } catch (retryError) {
          const message = retryError?.message || error?.message || "Не удалось подключиться к голосовому каналу.";
          showServerInviteFeedback(message);
          console.error("Ошибка входа в голосовой канал:", retryError);
          pendingLocalVoiceTransitionRef.current = null;
          setCurrentVoiceChannel(null);
          setJoiningVoiceChannelId("");
          finishJoinTrace({
            channelId: String(channel.id || ""),
            retry: true,
            scopedChannelId,
            success: false,
          });
        }
      }
    } finally {
      if (voiceJoinAttemptRef.current === joinAttemptId) {
        voiceJoinInFlightRef.current = false;
        pendingVoiceChannelTargetRef.current = "";
        setJoiningVoiceChannelId("");
      }

      if (!joinSucceeded && voiceJoinAttemptRef.current === joinAttemptId) {
        pendingLocalVoiceTransitionRef.current = null;
      }

      finishJoinTrace({
        channelId: String(channel.id || ""),
        retry: false,
        scopedChannelId,
        success: joinSucceeded,
      });
    }
  };
  const leaveVoiceChannel = async () => {
    if (!voiceClientRef.current) return;
    const cancelledChannelId = String(pendingVoiceChannelTargetRef.current || currentVoiceChannelRef.current || "");
    playImmediateVoiceTransitionTone("");
    const leaveTraceId = startPerfTrace("voice", "leave-voice-channel", {
      currentVoiceChannel: String(currentVoiceChannel || ""),
    });
    let leaveSucceeded = false;
    try {
      if (cancelledChannelId) {
        suppressedVoiceChannelRef.current = cancelledChannelId;
      }
      voiceJoinAttemptRef.current += 1;
      voiceJoinInFlightRef.current = false;
      pendingVoiceChannelTargetRef.current = "";
      setJoiningVoiceChannelId("");
      setCurrentVoiceChannel(null);
      setSelectedStreamUserId(null);
      setIsLocalSharePreviewVisible(false);
      pushNavigationHistory(() => {
        setDesktopServerPane("text");
        if (isMobileViewport) {
          setMobileServersPane("channels");
        }
      });
      await voiceClientRef.current.leaveChannel();
      leaveSucceeded = true;
    } catch (error) {
      console.error("Ошибка выхода из голосового канала:", error);
    } finally {
      finishPerfTrace(leaveTraceId, {
        currentVoiceChannel: String(currentVoiceChannel || ""),
        success: leaveSucceeded,
      });
    }
  };
  leaveVoiceChannelRef.current = leaveVoiceChannel;

  const leaveCurrentVoiceContext = async () => {
    if (isDirectCallChannelId(currentVoiceChannelRef.current) && directCallStateRef.current.phase !== "idle") {
      if (directCallStateRef.current.phase === "connected") {
        await endDirectCall();
        return;
      }

      await declineDirectCall();
      return;
    }

    await leaveVoiceChannel();
  };
  const {
    openChannelSettings,
    closeChannelSettings,
    updateChannelSettings,
    cancelChannelRename,
    updateChannelRenameValue,
    submitChannelRename,
    handleDeleteTextChannel,
    handleDeleteVoiceChannel,
    addTextChannel,
    addVoiceChannel,
    createChannelCategory,
    toggleChannelCategory,
    deleteChannelCategory,
    deleteDefaultChannelCategory,
    reorderChannelCategories,
    moveServerChannel,
    createServerChannel,
    createForumPost,
    addForumReply,
  } = useMenuMainChannelActions({
    user,
    activeServer,
    canManageChannels,
    currentTextChannelId,
    setCurrentTextChannelId,
    currentVoiceChannel,
    leaveVoiceChannel,
    updateServer,
    syncServerSnapshot,
    lastServerSyncFingerprintRef,
    setDesktopServerPane,
    channelRenameState,
    setChannelRenameState,
    setChannelSettingsState,
  });
  const handleLogout = async () => {
    try { await voiceClientRef.current?.disconnect(); } catch (error) { console.error("Ошибка при отключении перед выходом:", error); }
    finally {
      setOpenSettings(false);
      setShowModal(false);
      setShowCameraModal(false);
      setIsLocalSharePreviewVisible(false);
      stopCameraPreview();
      onLogout?.();
    }
  };
  const applyLiveStreamQuality = useCallback((nextResolution, nextFps) => {
    if (!isScreenShareActive && !isCameraShareActive) {
      return;
    }

    voiceClientRef.current?.setLocalShareVideoQuality?.({
      resolution: nextResolution,
      fps: nextFps,
    }).catch((error) => {
      console.error("Не удалось обновить качество стрима:", error);
      showServerInviteFeedback(error?.message || "Не удалось обновить качество стрима.");
    });
  }, [isCameraShareActive, isScreenShareActive, showServerInviteFeedback, voiceClientRef]);
  const handleStreamResolutionChange = useCallback((nextResolution) => {
    const normalizedResolution = STREAM_RESOLUTION_OPTIONS.some((option) => option.value === nextResolution)
      ? nextResolution
      : "1080p";
    const nextFps = normalizeStreamFpsForResolution(fps, normalizedResolution);

    setResolution(normalizedResolution);
    if (nextFps !== fps) {
      setFps(nextFps);
    }
    applyLiveStreamQuality(normalizedResolution, nextFps);
  }, [applyLiveStreamQuality, fps]);
  const handleStreamFpsChange = useCallback((nextFpsValue) => {
    const nextFps = normalizeStreamFpsForResolution(nextFpsValue, resolution);
    setFps(nextFps);
    applyLiveStreamQuality(resolution, nextFps);
  }, [applyLiveStreamQuality, resolution]);
  const {
    startScreenShare,
    stopScreenShare,
    handleScreenShareAction,
    openLocalSharePreview,
    closeLocalSharePreview,
    startCameraShare,
    stopCameraShare,
  } = useMenuMainLocalShareActions({
    voiceClientRef,
    currentVoiceChannel,
    currentVoiceChannelRef,
    servers,
    resolution,
    fps,
    shareStreamAudio,
    selectedVideoDeviceId,
    isScreenShareActive,
    isCameraShareActive,
    isScreenShareSupported,
    displayCaptureSupportInfo,
    hasLocalSharePreview,
    setShowModal,
    setShowCameraModal,
    setSelectedStreamUserId,
    setIsLocalSharePreviewVisible,
    setScreenShareError,
    setCameraError,
    setDesktopServerPane,
    pushNavigationHistory,
    showServerInviteFeedback,
    stopCameraPreview,
    startCameraPreview,
    pendingLocalScreenShareToneRef,
    clearScreenShareStartToneTimeout,
    scheduleScreenShareStartTone,
    playUiTone,
  });
  const openMobileVoiceStageFullscreen = async () => {
    const videoElement = mobileVoiceStageVideoRef.current;
    const targetElement = videoElement || mobileVoiceStageImageRef.current || mobileVoiceStageShellRef.current;
    if (!targetElement) {
      return;
    }

    try {
      if (typeof targetElement.requestFullscreen === "function") {
        await targetElement.requestFullscreen();
        return;
      }

      if (videoElement && typeof videoElement.webkitEnterFullscreen === "function") {
        videoElement.webkitEnterFullscreen();
      }
    } catch (error) {
      console.error("Не удалось открыть эфир на весь экран:", error);
    }
  };
  const openCameraModal = () => {
    setCameraError("");
    setShowModal(false);
    setScreenShareError("");
    setShowNoiseMenu(false);
    setShowCameraModal(true);
  };
  const closeCameraModal = () => {
    setShowCameraModal(false);
    setCameraError("");
    stopCameraPreview();
  };
  const handleCameraAction = () => {
    if (isMobileViewport) {
      openCameraModal();
      return;
    }

    if (isCameraShareActive) {
      void stopCameraShare();
      return;
    }

    setCameraError("");
    setShowModal(false);
    setScreenShareError("");
    setShowNoiseMenu(false);
    void startCameraShare({ restorePreviewOnError: false });
  };
  const handleWatchStream = (userId) => {
    const normalizedUserId = String(userId);
    pushNavigationHistory(() => {
      setIsLocalSharePreviewVisible(false);
      setDesktopServerPane("voice");
      setSelectedStreamUserId(normalizedUserId);
      if (isMobileViewport) {
        setMobileServersPane("voice");
      }
    });
    voiceClientRef.current?.requestScreenShare(normalizedUserId).catch((error) => console.error("Ошибка запроса просмотра трансляции:", error));
  };
  const handlePreviewStream = (userId) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      return;
    }

    voiceClientRef.current?.requestScreenShare(normalizedUserId).catch((error) => console.error("Screen share preview request failed:", error));
  };
  const handleImportServer = (snapshot) => {
    if (!snapshot) return;
    replaceServerSnapshot({ ...snapshot, isShared: true }, { activate: true });
    setOpenSettings(false);
  };
  useEffect(() => {
    if (!pendingImportedServer) {
      return;
    }

    handleImportServer(pendingImportedServer);
    onPendingImportedServerHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImportedServer]);
  const clearServerLongPress = () => {
    if (serverLongPressTimeoutRef.current) {
      window.clearTimeout(serverLongPressTimeoutRef.current);
      serverLongPressTimeoutRef.current = null;
    }
  };
  const openServerContextMenu = (event, server) => {
    if (!server) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setServerContextMenu({
      serverId: server.id,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 272)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 172)),
      status: "",
      isLoading: false,
    });
  };
  const handleServerShortcutPointerDown = (event, server) => {
    if (!server || event.button > 0 || event.pointerType === "mouse") {
      return;
    }

    clearServerLongPress();
    serverLongPressTriggeredRef.current = false;
    serverLongPressTimeoutRef.current = window.setTimeout(async () => {
      serverLongPressTriggeredRef.current = true;
      suppressedServerClickRef.current = String(server.id);
      window.setTimeout(() => {
        if (suppressedServerClickRef.current === String(server.id)) {
          suppressedServerClickRef.current = "";
        }
      }, 1200);

      try {
        await requestServerInviteLink(server);
        showServerInviteFeedback(`Ссылка на ${server.name || "сервер"} скопирована.`);
        if (typeof navigator?.vibrate === "function") {
          navigator.vibrate(16);
        }
      } catch (error) {
        showServerInviteFeedback(error?.message || "Не удалось скопировать ссылку.");
      } finally {
        serverLongPressTimeoutRef.current = null;
      }
    }, 520);
  };
  const handleServerShortcutPointerUp = (event) => {
    clearServerLongPress();
    if (!serverLongPressTriggeredRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    serverLongPressTriggeredRef.current = false;
  };
  const handleServerShortcutPointerCancel = () => {
    clearServerLongPress();
    serverLongPressTriggeredRef.current = false;
  };
  const handleServerShortcutClick = (server) => (event) => {
    if (String(suppressedServerClickRef.current || "") === String(server?.id || "")) {
      suppressedServerClickRef.current = "";
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    selectServer(server);
  };
  function toggleMicMute() {
    setIsMicMuted((previous) => {
      if (previous && (isMicForced || isSoundForced)) {
        return previous;
      }

      const nextValue = !previous;
      if (currentVoiceChannelRef.current) {
        const nextTone = nextValue ? "mute" : "unmute";
        pendingLocalMicToneRef.current = nextTone;
        playUiTone(nextTone);
      }

      return nextValue;
    });
  }
  function toggleSoundMute() {
    setIsSoundMuted((previous) => {
      if (previous && isSoundForced) {
        return previous;
      }

      const nextValue = !previous;
      if (currentVoiceChannelRef.current) {
        const nextTone = nextValue ? "mute" : "unmute";
        pendingLocalSoundToneRef.current = nextTone;
        playUiTone(nextTone);
      }

      return nextValue;
    });
  }
  const suppressTooltipOnClick = (event) => {
    const target = event?.currentTarget;
    if (!target?.dataset) {
      return;
    }

    target.dataset.tooltipSuppressed = "true";
    if (typeof target.blur === "function") {
      target.blur();
    }
  };
  const restoreTooltipOnLeave = (event) => {
    const target = event?.currentTarget;
    if (!target?.dataset) {
      return;
    }

    delete target.dataset.tooltipSuppressed;
  };
  const updateProfileDraft = (field, value) => {
    if (field === "firstName" || field === "lastName") {
      const otherField = field === "firstName" ? "lastName" : "firstName";

      setProfileDraft((previous) => {
        const lockedScript =
          detectNameScript(previous[otherField]) ||
          detectNameScript(previous[field]) ||
          detectNameScript(value);

        return {
          ...previous,
          [field]: normalizeSingleWordNameInput(value, MAX_PROFILE_NAME_LENGTH, lockedScript),
        };
      });
    } else if (field === "nickname") {
      setProfileDraft((previous) => ({
        ...previous,
        nickname: normalizeProfileNicknameInput(value),
      }));
    } else {
      setProfileDraft((previous) => ({ ...previous, [field]: value }));
    }

    if (profileStatus) {
      setProfileStatus("");
    }
  };
  const updateEmailChangeDraft = (field, value) => {
    setEmailChangeState((previous) => ({
      ...previous,
      [field]: field === "code" || field === "totpCode"
        ? String(value || "").replace(/\D/g, "").slice(0, 6)
        : String(value || ""),
      status: "",
    }));
  };
  const startEmailChange = async () => {
    const nextEmail = String(emailChangeState.email || "").trim();
    if (!nextEmail) {
      setEmailChangeState((previous) => ({ ...previous, status: "Введите новую почту." }));
      return;
    }

    if (nextEmail === String(user?.email || "").trim()) {
      setEmailChangeState((previous) => ({ ...previous, status: "Это уже текущая почта." }));
      return;
    }

    setEmailChangeState((previous) => ({ ...previous, isBusy: true, status: "" }));

    try {
      const response = await authFetch(`${API_URL}/api/user/email-change/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось отправить код подтверждения."));
      }

      setEmailChangeState((previous) => ({
        ...previous,
        email: data?.email || nextEmail,
        verificationToken: data?.verificationToken || "",
        code: "",
        totpCode: "",
        isBusy: false,
        awaitingCode: true,
        status: "Код отправлен на текущую почту. Введите его для смены email.",
      }));
    } catch (error) {
      setEmailChangeState((previous) => ({
        ...previous,
        isBusy: false,
        status: error?.message || "Не удалось отправить код подтверждения.",
      }));
    }
  };
  const confirmEmailChange = async () => {
    const nextEmail = String(emailChangeState.email || "").trim();
    const code = String(emailChangeState.code || "").trim();
    const totpCode = String(emailChangeState.totpCode || "").trim();

    if (!emailChangeState.verificationToken || code.length !== 6) {
      setEmailChangeState((previous) => ({ ...previous, status: "Введите шестизначный код из письма." }));
      return;
    }

    if (isTotpEnabled && totpCode.length !== 6) {
      setEmailChangeState((previous) => ({ ...previous, status: "Введите код из Google Authenticator." }));
      return;
    }

    setEmailChangeState((previous) => ({ ...previous, isBusy: true, status: "" }));

    try {
      const response = await authFetch(`${API_URL}/api/user/email-change/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: nextEmail,
          verificationToken: emailChangeState.verificationToken,
          code,
          totpCode,
        }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось подтвердить смену почты."));
      }

      const nextUser = {
        ...user,
        email: data?.email || nextEmail,
        is_email_verified: Boolean(data?.is_email_verified ?? true),
        isEmailVerified: Boolean(data?.is_email_verified ?? true),
      };
      setUser?.(nextUser);
      setProfileDraft((previous) => ({ ...previous, email: nextUser.email }));
      await storeSession(nextUser, {
        accessToken: getStoredToken(),
        refreshToken: getStoredRefreshToken(),
        accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
      });
      setEmailChangeState({
        email: nextUser.email,
        verificationToken: "",
        code: "",
        totpCode: "",
        status: "Почта обновлена.",
        isBusy: false,
        awaitingCode: false,
      });
    } catch (error) {
      setEmailChangeState((previous) => ({
        ...previous,
        isBusy: false,
        status: error?.message || "Не удалось подтвердить смену почты.",
      }));
    }
  };
  const handleProfileSave = async (event) => {
    event?.preventDefault?.();

    const nextFirstName = profileDraft.firstName.trim();
    const nextLastName = profileDraft.lastName.trim();
    const nextNickname = profileDraft.nickname.trim();
    if (!nextFirstName) {
      setProfileStatus("Имя не должно быть пустым.");
      return;
    }

    if (!nextNickname) {
      setProfileStatus("Никнейм не должен быть пустым.");
      return;
    }

    if (
      nextFirstName.length > MAX_PROFILE_NAME_LENGTH ||
      nextLastName.length > MAX_PROFILE_NAME_LENGTH
    ) {
      setProfileStatus("Имя и фамилия должны быть не длиннее 32 символов.");
      return;
    }

    if (!isValidProfileName(nextFirstName) || (nextLastName && !isValidProfileName(nextLastName))) {
      setProfileStatus("Имя и фамилия должны состоять из одного слова и могут содержать только буквы, дефис и апостроф.");
      return;
    }

    if (nextLastName && !areNamesUsingSameScript(nextFirstName, nextLastName)) {
      setProfileStatus("Имя и фамилия должны быть полностью на одном языке: либо на русском, либо на английском.");
      return;
    }

    if (!isNicknameUsingSingleScript(nextNickname)) {
      setProfileStatus("Никнейм должен быть полностью на одном языке: либо на русском, либо на английском.");
      return;
    }

    setProfileStatus("Сохраняем профиль...");

    try {
      const response = await authFetch(`${API_URL}/api/user/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: nextFirstName,
          lastName: nextLastName,
          nickname: nextNickname,
          avatarFrame: serializeMediaFrame(getUserAvatarFrame(user)),
          profileBackgroundUrl: profileDraft.profileBackgroundUrl ?? getUserProfileBackground(user),
          profileBackgroundFrame: serializeMediaFrame(profileDraft.profileBackgroundFrame),
        }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось сохранить профиль."));
      }

      const nextUser = {
        ...user,
        first_name: data?.first_name || nextFirstName,
        firstName: data?.first_name || nextFirstName,
        last_name: data?.last_name || nextLastName,
        lastName: data?.last_name || nextLastName,
        nickname: data?.nickname || nextNickname,
        email: data?.email || profileDraft.email || user?.email || "",
        avatarUrl: data?.avatar_url || user?.avatarUrl || user?.avatar || "",
        avatar: data?.avatar_url || user?.avatar || user?.avatarUrl || "",
        avatarFrame: parseMediaFrame(data?.avatar_frame, data?.avatarFrame, getUserAvatarFrame(user)),
        avatar_frame: parseMediaFrame(data?.avatar_frame, data?.avatarFrame, getUserAvatarFrame(user)),
        profileBackgroundUrl:
          data?.profile_background_url || profileDraft.profileBackgroundUrl || getUserProfileBackground(user),
        profile_background_url:
          data?.profile_background_url || profileDraft.profileBackgroundUrl || getUserProfileBackground(user),
        profileBackground:
          data?.profile_background_url || profileDraft.profileBackgroundUrl || getUserProfileBackground(user),
        profileBackgroundFrame: parseMediaFrame(
          data?.profile_background_frame,
          data?.profileBackgroundFrame,
          profileDraft.profileBackgroundFrame
        ),
        profile_background_frame: parseMediaFrame(
          data?.profile_background_frame,
          data?.profileBackgroundFrame,
          profileDraft.profileBackgroundFrame
        ),
      };

      setUser?.(nextUser);
      await storeSession(nextUser, {
        accessToken: getStoredToken(),
        refreshToken: getStoredRefreshToken(),
        accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
      });
      setProfileStatus("Изменения профиля сохранены.");
    } catch (error) {
      console.error("Ошибка сохранения профиля:", error);
      setProfileStatus(error?.message || "Не удалось сохранить профиль.");
    }
  };

  const profileBackgroundSrc = resolveMediaUrl(getUserProfileBackground(user), "");
  const settingsNavSections = SETTINGS_NAV_SECTIONS;
  const mobileSettingsNavItems = useMemo(
    () => SETTINGS_NAV_ITEMS.filter((item) => activeServer || (item.id !== "server" && item.id !== "roles")),
    [activeServer]
  );
  const activeSettingsTabMeta =
    mobileSettingsNavItems.find((item) => item.id === settingsTab) ||
    SETTINGS_NAV_ITEMS.find((item) => item.id === settingsTab) ||
    SETTINGS_NAV_ITEMS[0];
  const activeMicMenuBars = getMeterActiveBars(micLevel, 24);
  const activeMicSettingsBars = getMeterActiveBars(micLevel, 48);
  const displayedPingMs = currentVoiceChannel ? resolvedVoicePingMs : resolvedApiPingMs;
  const pingTone = getPingTone(displayedPingMs);
  const pingTooltip =
    displayedPingMs ? `Пинг: ${displayedPingMs} мс` : "Пинг недоступен";

  const toggleMicrophoneTestPreview = async () => {
    if (isMicTestActive) {
      setIsMicTestActive(false);
      return;
    }

    const voiceClient = await ensureVoiceClientReady();
    if (!voiceClient) {
      return;
    }

    setIsMicTestActive(true);
  };

  const handleCameraPreviewDeviceChange = (deviceId) => {
    setSelectedVideoDeviceId(deviceId);

    if (!hasCameraPreview) {
      return;
    }

    startCameraPreview(deviceId).catch((error) => {
      console.error("Ошибка обновления предпросмотра камеры:", error);
    });
  };

  const settingsContentProps = {
    settingsTab,
    setSettingsTab,
    profileBackgroundSrc,
    profileDraft,
    profileAccountName: getProfileFullName({
      ...(user || {}),
      firstName: profileDraft.firstName,
      first_name: profileDraft.firstName,
      lastName: profileDraft.lastName,
      last_name: profileDraft.lastName,
      nickname: profileDraft.nickname,
    }),
    profileDisplayName: getDisplayName({
      ...(user || {}),
      nickname: profileDraft.nickname,
      firstName: profileDraft.firstName,
      first_name: profileDraft.firstName,
      lastName: profileDraft.lastName,
      last_name: profileDraft.lastName,
    }),
    profileStatus,
    profileCustomization,
    handleProfileCustomizationChange,
    emailChangeState,
    isTotpEnabled,
    totpSetup,
    maxProfileNicknameLength: MAX_PROFILE_NICKNAME_LENGTH,
    user,
    avatarInputRef,
    profileBackgroundInputRef,
    serverIconInputRef,
    handleResetProfileCustomization,
    handleProfileSave,
    updateProfileDraft,
    updateEmailChangeDraft,
    startEmailChange,
    confirmEmailChange,
    updateTotpCode,
    startTotpSetup,
    verifyTotpSetup,
    disableTotp,
    handleLogout,
    deviceSessions,
    deviceSessionsLoading,
    deviceSessionsError,
    refreshDeviceSessions,
    openQrDeviceScanner,
    integrations,
    integrationsLoading,
    integrationsStatus,
    integrationActionBusy,
    handleConnectIntegration,
    handleDisconnectIntegration,
    handleToggleIntegrationSetting,
    audioInputDevices,
    audioOutputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    outputSelectionAvailable,
    micVolume,
    audioVolume,
    activeMicSettingsBars,
    isMicTestActive,
    noiseProfileOptions,
    noiseSuppressionMode,
    activeNoiseProfile,
    echoCancellationEnabled,
    autoInputSensitivity,
    handleInputDeviceChange,
    handleOutputDeviceChange,
    updateMicVolume,
    updateAudioVolume,
    toggleMicrophoneTestPreview,
    handleNoiseSuppressionModeChange,
    toggleEchoCancellation,
    setAutoInputSensitivity,
    directNotificationsEnabled,
    conversationNotificationsEnabled,
    serverNotificationsEnabled,
    directMessageSoundEnabled,
    directMessageSendSoundId,
    directMessageReceiveSoundId,
    notificationSoundEnabled,
    notificationSoundId,
    notificationSoundOptions,
    customNotificationSoundData,
    customNotificationSoundName,
    notificationSoundError,
    notificationSoundInputRef,
    setDirectNotificationsEnabled,
    setConversationNotificationsEnabled,
    setServerNotificationsEnabled,
    setDirectMessageSoundEnabled,
    setDirectMessageSendSoundId,
    setDirectMessageReceiveSoundId,
    setNotificationSoundEnabled,
    setNotificationSoundId,
    setCustomNotificationSoundData,
    setCustomNotificationSoundName,
    setNotificationSoundError,
    handleCustomNotificationSoundChange,
    uiDensity,
    uiFontScale,
    uiReduceMotion,
    uiTouchTargetSize,
    setUiDensity,
    setUiFontScale,
    setUiReduceMotion,
    setUiTouchTargetSize,
    activeServer,
    canManageServer,
    canInviteMembers,
    isDefaultServer,
    currentUserId,
    voiceParticipantByUserId,
    updateActiveServerName,
    updateActiveServerDescription,
    handleDeleteServer,
    canManageTargetMember,
    canAssignRoleToMember,
    openMemberActionsMenu,
    syncServerSnapshot,
    handleImportServer,
    markServerAsShared,
    currentServerRole,
  };

  const renderSettingsContent = () => (
    <Suspense fallback={settingsContentFallback}>
      <MenuMainSettingsContent {...settingsContentProps} />
    </Suspense>
  );
  const renderMobileSettingsShell = () => (
    <Suspense fallback={settingsContentFallback}>
      <MenuMainMobileSettingsShell
        activeSettingsTabMeta={activeSettingsTabMeta}
        user={user}
        mobileSettingsNavItems={mobileSettingsNavItems}
        settingsTab={settingsTab}
        setOpenSettings={setOpenSettings}
        setSettingsTab={setSettingsTab}
      >
        {renderSettingsContent()}
      </MenuMainMobileSettingsShell>
    </Suspense>
  );
  const clearChannelSearch = useCallback(() => setChannelSearchQuery(""), []);
  const stableOpenDirectChat = useStableEvent(openDirectChat);
  const stableStartDirectCallWithUser = useStableEvent(startDirectCallIfAllowed);
  const stableHandleAddServer = useStableEvent(handleAddServer);
  const stableOpenLocalSharePreview = useStableEvent(openLocalSharePreview);
  const stableCloseLocalSharePreview = useStableEvent(closeLocalSharePreview);
  const stableHandlePreviewStream = useStableEvent(handlePreviewStream);
  const stableHandleWatchStream = useStableEvent(handleWatchStream);
  const stableStopScreenShare = useStableEvent(stopScreenShare);
  const stableStopCameraShare = useStableEvent(stopCameraShare);
  const stableHandleScreenShareAction = useStableEvent(handleScreenShareAction);
  const stableOpenCameraModal = useStableEvent(openCameraModal);
  const stableHandleCameraAction = useStableEvent(handleCameraAction);
  const stableLeaveVoiceChannel = useStableEvent(leaveVoiceChannel);
  const stableJoinVoiceChannel = useStableEvent(joinVoiceChannel);
  const stableCreateForumPost = useStableEvent(createForumPost);
  const stableAddForumReply = useStableEvent(addForumReply);
  const stableToggleMicMute = useStableEvent(toggleMicMute);
  const stableToggleSoundMute = useStableEvent(toggleSoundMute);
  const directCallPanelProps = {
    call: directCallState,
    history: directCallHistory,
    isMicMuted,
    isSoundMuted,
    micLevel,
    peerIsSpeaking: directCallPeerIsSpeaking,
    selfName: getDisplayName(user),
    selfAvatar: getUserAvatar(user),
    selfAvatarFrame: getUserAvatarFrame(user),
    audioInputDevices,
    audioOutputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    outputSelectionSupported,
    isScreenShareActive,
    isCameraShareActive,
    isScreenShareSupported,
    isPeerStreamLive: isDirectCallPeerStreamLive,
    isWatchingPeerStream: isWatchingDirectCallPeerStream,
    peerStreamMode: directCallPeerStreamShare?.mode || "",
    onAccept: acceptDirectCall,
    onDecline: declineDirectCall,
    onEnd: endDirectCall,
    onToggleMic: stableToggleMicMute,
    onToggleSound: stableToggleSoundMute,
    onScreenShareAction: stableHandleScreenShareAction,
    onOpenCamera: stableHandleCameraAction,
    onWatchPeerStream: () => stableHandleWatchStream(directCallState.peerUserId),
    onSelectInputDevice: setSelectedInputDeviceId,
    onSelectOutputDevice: setSelectedOutputDeviceId,
    onToggleMiniMode: setDirectCallMiniMode,
    onDismiss: dismissDirectCallOverlay,
    onRetry: retryDirectCall,
    onRedialHistoryItem: stableStartDirectCallWithUser,
  };
  const profilePanelProps = {
    currentVoiceChannel,
    currentVoiceChannelName,
    pingTone,
    pingTooltip,
    isCurrentUserSpeaking,
    isScreenShareActive,
    isCameraShareActive,
    streamResolution: resolution,
    streamFps: fps,
    streamDiagnostics,
    streamSourceTitle: localSharePreview?.sourceTitle || "",
    streamResolutionOptions: STREAM_RESOLUTION_OPTIONS,
    streamFpsOptions,
    isMicMuted,
    isSoundMuted,
    showMicMenu,
    showSoundMenu,
    micMenuRef,
    soundMenuRef,
    avatarInputRef,
    serverIconInputRef,
    user,
    profileCustomization,
    audioInputDevices,
    audioOutputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    outputSelectionAvailable,
    deviceInputLabel,
    deviceOutputLabel,
    noiseProfileOptions,
    noiseSuppressionMode,
    activeNoiseProfile,
    echoCancellationEnabled,
    micVolume,
    audioVolume,
    activeMicMenuBars,
    openSettingsPanel,
    handleScreenShareAction: stableHandleScreenShareAction,
    openCameraModal: stableHandleCameraAction,
    stopCameraShare: stableStopCameraShare,
    openLocalSharePreview,
    handleStreamResolutionChange,
    handleStreamFpsChange,
    leaveVoiceChannel: stableLeaveVoiceChannel,
    leaveCurrentVoiceContext,
    handleAvatarChange,
    handleServerIconChange,
    toggleMicMute: stableToggleMicMute,
    toggleSoundMute: stableToggleSoundMute,
    setShowMicMenu,
    setShowSoundMenu,
    handleInputDeviceChange,
    handleOutputDeviceChange,
    handleNoiseSuppressionModeChange,
    toggleEchoCancellation,
    updateMicVolume,
    updateAudioVolume,
    suppressTooltipOnClick,
    restoreTooltipOnLeave,
    leaveVoiceActionLabel: isDirectCallChannelId(currentVoiceChannel) && directCallState.phase !== "idle" ? "Завершить звонок" : "Отключиться",
    leaveVoiceActionAriaLabel: isDirectCallChannelId(currentVoiceChannel) && directCallState.phase !== "idle" ? "Завершить личный звонок" : "Отключиться от голосового канала",
  };
  const profilePanelElement = useMemo(() => <MenuMainProfilePanelSlot {...profilePanelProps} />, [
    activeMicMenuBars,
    activeNoiseProfile,
    audioInputDevices,
    audioOutputDevices,
    audioVolume,
    currentVoiceChannel,
    currentVoiceChannelName,
    deviceInputLabel,
    deviceOutputLabel,
    directCallState,
    echoCancellationEnabled,
    fps,
    handleStreamFpsChange,
    handleStreamResolutionChange,
    isCameraShareActive,
    isCurrentUserSpeaking,
    isMicMuted,
    isScreenShareActive,
    isSoundMuted,
    localSharePreview?.sourceTitle,
    micVolume,
    noiseProfileOptions,
    noiseSuppressionMode,
    openLocalSharePreview,
    outputSelectionAvailable,
    profileCustomization,
    pingTone,
    pingTooltip,
    resolution,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    showMicMenu,
    showSoundMenu,
    stableStopCameraShare,
    streamDiagnostics,
    streamFpsOptions,
    user,
  ]);
  const renderProfilePanel = () => profilePanelElement;
  const buildFriendProfileStats = (friend, directChannelId = "") => {
    const friendId = String(friend?.id || friend?.userId || "").trim();
    const sharedConversationCount = friendId
      ? conversationTargets.reduce((count, conversation) => {
        const members = Array.isArray(conversation?.members) ? conversation.members : [];
        return members.some((member) => String(member?.id || member?.userId || "") === friendId) ? count + 1 : count;
      }, 0)
      : 0;

    return [
      {
        id: "mutual-friends",
        label: "Общие друзья",
        value: formatCountLabel(friend?.mutualFriendsCount, "Нет общих друзей", "общий друг", "общих друга", "общих друзей"),
      },
      {
        id: "mutual-chats",
        label: "Общие чаты",
        value: formatCountLabel(sharedConversationCount, "Нет общих чатов", "общий чат", "общих чата", "общих чатов"),
      },
      {
        id: "known-since",
        label: "Вы знакомы",
        value: formatKnownSinceLabel(friend?.friendshipCreatedAt || friend?.friendship_created_at),
      },
      {
        id: "last-dialog",
        label: "Последний диалог",
        value: formatLastDialogLabel(getLatestProfileDialogAt(currentUserId, friend, directChannelId)),
      },
    ];
  };
  const openFriendListUserContextMenu = (event, friend) => {
    event.preventDefault();
    event.stopPropagation();

    if (!friend?.id) {
      return;
    }

    const padding = 12;
    const menuWidth = 238;
    const menuHeight = friend.isSelf ? 190 : 290;
    const nextX = Math.max(padding, Math.min(Number(event.clientX || 0), window.innerWidth - menuWidth - padding));
    const nextY = Math.max(padding, Math.min(Number(event.clientY || 0), window.innerHeight - menuHeight - padding));
    const directChannelId = String(friend.directChannelId || buildDirectMessageChannelId(currentUserId, friend.id));
    const hasClearableChat = Boolean(currentUserId && directChannelId && readCachedTextChatMessages(currentUserId, directChannelId).length > 0);
    const friendId = String(friend.id || "");
    const isBlocked = Boolean(friend.isBlocked || blockedFriendIds.has(friendId));
    const blockedYou = Boolean(friend.blockedYou || blockedByFriendIds.has(friendId));
    const isIgnored = Boolean(friend.isIgnored || ignoredFriendIds.has(friendId));

    setFriendListProfileModal(null);
    setFriendListUserContextMenu({
      x: nextX,
      y: nextY,
      userId: friendId,
      username: getDisplayName(friend),
      directChannelId,
      avatarUrl: String(friend.avatar || ""),
      avatarFrame: friend.avatarFrame || null,
      backgroundUrl: String(friend.profileBackgroundUrl || ""),
      backgroundFrame: friend.profileBackgroundFrame || null,
      profileCustomization: friend.profileCustomization || null,
      isOnline: Boolean(friend.isOnline ?? friend.is_online ?? friend.online ?? false),
      lastSeenAt: String(friend.lastSeenAt || friend.last_seen_at || friend.lastSeen || friend.last_seen || ""),
      presence: friend.presence || friend.presenceStatus || friend.presence_status || "",
      isSelf: Boolean(friend.isSelf),
      isFriend: true,
      isBlocked,
      blockedYou,
      isIgnored,
      canOpenDirectChat: !friend.isSelf,
      canInviteToServer: !isBlocked && !blockedYou && canInviteFriendToAnyServer(friendId),
      hasClearableChat,
      socialStats: buildFriendProfileStats(friend, directChannelId),
    });
  };
  const openFriendListProfile = (friend) => {
    if (!friend?.id) {
      return;
    }

    const friendId = String(friend.id || "");
    const isBlocked = Boolean(friend.isBlocked || blockedFriendIds.has(friendId));
    const blockedYou = Boolean(friend.blockedYou || blockedByFriendIds.has(friendId));
    const isIgnored = Boolean(friend.isIgnored || ignoredFriendIds.has(friendId));
    const directChannelId = String(friend.directChannelId || buildDirectMessageChannelId(currentUserId, friend.id));

    setFriendListUserContextMenu(null);
    setFriendListProfileModal({
      userId: friendId,
      username: getDisplayName(friend),
      avatarUrl: String(friend.avatar || ""),
      avatarFrame: friend.avatarFrame || null,
      backgroundUrl: String(friend.profileBackgroundUrl || ""),
      backgroundFrame: friend.profileBackgroundFrame || null,
      profileCustomization: friend.profileCustomization || null,
      isOnline: Boolean(friend.isOnline ?? friend.is_online ?? friend.online ?? false),
      lastSeenAt: String(friend.lastSeenAt || friend.last_seen_at || friend.lastSeen || friend.last_seen || ""),
      presence: friend.presence || friend.presenceStatus || friend.presence_status || "",
      isSelf: Boolean(friend.isSelf),
      isFriend: true,
      isBlocked,
      blockedYou,
      isIgnored,
      canOpenDirectChat: !friend.isSelf,
      socialStats: buildFriendProfileStats(friend, directChannelId),
    });
  };
  const closeFriendListUserContextMenu = () => setFriendListUserContextMenu(null);
  const closeFriendListProfileModal = () => setFriendListProfileModal(null);
  const openFriendListProfileFromMenu = () => {
    if (!friendListUserContextMenu) {
      return;
    }

    const sourceFriend = directConversationTargets.find((friend) => String(friend?.id || "") === String(friendListUserContextMenu.userId || "")) || friendListUserContextMenu;
    setFriendListProfileModal({
      userId: friendListUserContextMenu.userId,
      username: friendListUserContextMenu.username,
      avatarUrl: friendListUserContextMenu.avatarUrl,
      avatarFrame: friendListUserContextMenu.avatarFrame || null,
      backgroundUrl: friendListUserContextMenu.backgroundUrl || "",
      backgroundFrame: friendListUserContextMenu.backgroundFrame || null,
      profileCustomization: friendListUserContextMenu.profileCustomization || sourceFriend?.profileCustomization || null,
      isOnline: friendListUserContextMenu.isOnline,
      lastSeenAt: friendListUserContextMenu.lastSeenAt || "",
      presence: friendListUserContextMenu.presence || "",
      isSelf: friendListUserContextMenu.isSelf,
      isFriend: true,
      isBlocked: friendListUserContextMenu.isBlocked,
      blockedYou: friendListUserContextMenu.blockedYou,
      isIgnored: friendListUserContextMenu.isIgnored,
      canOpenDirectChat: friendListUserContextMenu.canOpenDirectChat,
      socialStats: buildFriendProfileStats(sourceFriend, friendListUserContextMenu.directChannelId),
    });
    setFriendListUserContextMenu(null);
  };
  const handleFriendListDirectChat = (userId, isSelf = false) => {
    if (!userId || isSelf) {
      return;
    }

    openDirectChat(userId);
  };
  const handleCopyFriendListUserId = async (userId) => {
    if (!userId) {
      return;
    }

    try {
      await copyTextToClipboard(String(userId));
    } catch {
      return;
    }
  };
  const handleClearDirectChatForCurrentUser = () => {
    const normalizedChannelId = String(friendListUserContextMenu?.directChannelId || "").trim();
    if (!currentUserId || !normalizedChannelId || !friendListUserContextMenu?.hasClearableChat) {
      return;
    }

    writeTextChatChannelClearedAt(currentUserId, normalizedChannelId, new Date().toISOString());
    clearCachedTextChatMessages(currentUserId, normalizedChannelId);
    setTextChatLocalStateVersion((previous) => previous + 1);
    setFriendsError("");
    setFriendActionStatus(`Чат с ${friendListUserContextMenu?.username || "пользователем"} очищен только у вас.`);
    setFriendListUserContextMenu(null);
  };
  const handleToggleFriendListIgnore = () => {
    const targetUserId = String(friendListUserContextMenu?.userId || "").trim();
    if (!targetUserId || friendListUserContextMenu?.isSelf || friendListUserContextMenu?.isBlocked) {
      return;
    }

    const willIgnore = !friendListUserContextMenu?.isIgnored;
    updateFriendRelation(targetUserId, ({ ignoredIds }) => {
      if (willIgnore) {
        ignoredIds.add(targetUserId);
      } else {
        ignoredIds.delete(targetUserId);
      }
    });

    if (willIgnore && String(activeDirectFriendId || "") === targetUserId) {
      setActiveDirectFriendId("");
    }

    setFriendActionStatus(
      willIgnore
        ? `${friendListUserContextMenu?.username || "Пользователь"} добавлен в игнор.`
        : `${friendListUserContextMenu?.username || "Пользователь"} убран из игнора.`
    );
    setFriendListUserContextMenu(null);
  };
  const handleToggleFriendListBlock = async () => {
    const targetUserId = String(friendListUserContextMenu?.userId || "").trim();
    if (!targetUserId || friendListUserContextMenu?.isSelf) {
      return;
    }

    const willBlock = !friendListUserContextMenu?.isBlocked;
    updateFriendRelation(targetUserId, ({ ignoredIds, blockedIds }) => {
      if (willBlock) {
        blockedIds.add(targetUserId);
        ignoredIds.delete(targetUserId);
      } else {
        blockedIds.delete(targetUserId);
      }
    });
    applyFriendBlockState(targetUserId, {
      isBlocked: willBlock,
      blockedYou: friendListUserContextMenu?.blockedYou,
    });

    try {
      const blockState = await requestFriendBlockState(targetUserId, willBlock);
      applyFriendBlockState(targetUserId, blockState);
      setFriendActionStatus(
        willBlock
          ? `${friendListUserContextMenu?.username || "Пользователь"} заблокирован.`
          : `${friendListUserContextMenu?.username || "Пользователь"} разблокирован.`
      );
      refreshFriends().catch(() => {});
    } catch (error) {
      updateFriendRelation(targetUserId, ({ blockedIds }) => {
        if (willBlock) {
          blockedIds.delete(targetUserId);
        } else {
          blockedIds.add(targetUserId);
        }
      });
      applyFriendBlockState(targetUserId, {
        isBlocked: !willBlock,
        blockedYou: friendListUserContextMenu?.blockedYou,
      });
      setFriendsError(error?.message || "Не удалось обновить блокировку.");
    } finally {
      setFriendListUserContextMenu(null);
    }
  };
  const friendListUserContextMenuSections = [
    [
      {
        id: "profile",
        label: "Профиль",
        icon: "◧",
        disabled: false,
        onClick: openFriendListProfileFromMenu,
      },
      {
        id: "direct-chat",
        label: "Начать чат",
        icon: "✉",
        disabled: !friendListUserContextMenu?.canOpenDirectChat,
        onClick: () => {
          handleFriendListDirectChat(friendListUserContextMenu?.userId, friendListUserContextMenu?.isSelf);
          setFriendListUserContextMenu(null);
        },
      },
      ...(friendListUserContextMenu?.isSelf
        ? []
        : [{
          id: "direct-call",
          label: "Позвонить",
          icon: "☎",
          disabled: Boolean(!friendListUserContextMenu?.userId || friendListUserContextMenu?.isBlocked || friendListUserContextMenu?.blockedYou),
          onClick: () => {
            const targetUserId = friendListUserContextMenu?.userId;
            if (!targetUserId) {
              return;
            }

            setFriendListUserContextMenu(null);
            void startDirectCallIfAllowed(targetUserId);
          },
        }]),
      {
        id: "clear-local-chat",
        label: "Очистить чат у себя",
        icon: "🧹",
        disabled: !friendListUserContextMenu?.directChannelId || !friendListUserContextMenu?.hasClearableChat,
        onClick: handleClearDirectChatForCurrentUser,
      },
    ],
    friendListUserContextMenu?.isSelf ? [] : [
      {
        id: "invite",
        label: "Пригласить на сервер",
        icon: "↗",
        disabled: !friendListUserContextMenu?.canInviteToServer,
        onClick: handleInviteFriendListUserToServer,
      },
      {
        id: "ignore",
        label: friendListUserContextMenu?.isIgnored ? "Убрать из игнора" : "Игнорировать",
        icon: "◦",
        disabled: Boolean(friendListUserContextMenu?.isBlocked),
        onClick: handleToggleFriendListIgnore,
      },
      {
        id: "block",
        label: friendListUserContextMenu?.isBlocked ? "Разблокировать" : "Заблокировать",
        icon: "⊖",
        danger: !friendListUserContextMenu?.isBlocked,
        disabled: false,
        onClick: handleToggleFriendListBlock,
      },
    ],
    [
      {
        id: "copy-id",
        label: "Копировать ID пользователя",
        icon: "ID",
        disabled: !friendListUserContextMenu?.userId,
        onClick: async () => {
          await handleCopyFriendListUserId(friendListUserContextMenu?.userId);
          setFriendListUserContextMenu(null);
        },
      },
    ],
  ].filter((section) => section.length > 0);
  const renderFriendListOverlay = () => (
    <>
      <TextChatUserContextMenu
        menuRef={friendListUserContextMenuRef}
        menu={friendListUserContextMenu}
        sections={friendListUserContextMenuSections}
        onClose={closeFriendListUserContextMenu}
      />
      <TextChatProfileModal
        profile={friendListProfileModal}
        onClose={closeFriendListProfileModal}
        onOpenDirectChat={() => {
          handleFriendListDirectChat(friendListProfileModal?.userId, friendListProfileModal?.isSelf);
          setFriendListProfileModal(null);
        }}
        onStartDirectCall={() => {
          if (!friendListProfileModal?.userId || friendListProfileModal.isSelf || friendListProfileModal.isBlocked || friendListProfileModal.blockedYou) {
            return;
          }

          stableStartDirectCallWithUser(friendListProfileModal.userId);
          setFriendListProfileModal(null);
        }}
        onAddFriend={() => {}}
        onCopyUserId={() => handleCopyFriendListUserId(friendListProfileModal?.userId)}
      />
    </>
  );
  const friendListOverlayElement = useMemo(() => renderFriendListOverlay(), [
    friendListProfileModal,
    friendListUserContextMenu,
    friendListUserContextMenuSections,
    stableStartDirectCallWithUser,
  ]);
  const renderFriendsSidebar = () => (
    <Suspense fallback={friendsWorkspaceFallback}>
      <FriendsSidebar
        query={friendsSidebarQuery}
        navItems={FRIENDS_SIDEBAR_ITEMS}
        friendsPageSection={friendsPageSection}
        incomingFriendRequestCount={incomingFriendRequestCount}
        conversationUnreadThreadCount={conversationUnreadThreadCount}
        filteredFriends={filteredFriends}
        filteredConversations={filteredConversations}
        activeDirectFriendId={activeDirectFriendId}
        activeConversationId={activeConversationId}
        directUnreadCounts={directUnreadCounts}
        chatDraftPresence={chatDraftPresence}
        currentUserId={currentUserId}
        profilePanel={renderProfilePanel()}
        onQueryChange={setFriendsSidebarQuery}
        onOpenFriendsWorkspace={openFriendsWorkspace}
        onOpenServersWorkspace={openServersWorkspace}
        onResetDirect={resetActiveFriendWorkspaceSelection}
        onSetFriendsSection={setFriendsPageSection}
        onOpenDirectChat={stableOpenDirectChat}
        onOpenConversationChat={openConversationChat}
        onOpenUserContextMenu={openFriendListUserContextMenu}
        overlayContent={friendListOverlayElement}
        getDisplayName={getDisplayName}
      />
    </Suspense>
  );
  const renderServersSidebar = (includeProfilePanel = true) => (
    <ServersSidebar
      includeProfilePanel={includeProfilePanel}
      profilePanel={renderProfilePanel()}
      activeServer={activeServer}
      desktopServerPane={desktopServerPane}
      servers={servers}
      serverMembersRef={serverMembersRef}
      memberRoleMenu={memberRoleMenu}
      memberRoleMenuRef={memberRoleMenuRef}
      serverContextMenu={serverContextMenu}
      serverContextMenuRef={serverContextMenuRef}
      voiceParticipantByUserId={voiceParticipantByUserId}
      currentUserId={currentUserId}
      canManageChannels={canManageChannels}
      channelSettingsState={channelSettingsState}
      channelRenameState={channelRenameState}
      serverUnreadCounts={serverUnreadCounts}
      chatDraftPresence={chatDraftPresence}
      currentTextChannel={currentTextChannel}
      selectedVoiceChannel={selectedVoiceChannel}
      currentVoiceChannel={currentVoiceChannel}
      activeVoiceParticipantsMap={activeVoiceParticipantsMap}
      liveUserIds={liveUserIds}
      speakingUserIds={speakingUserIds}
      watchedStreamUserId={selectedStreamUserId}
      joiningVoiceChannelId={joiningVoiceChannelId}
      icons={serverSidebarIcons}
      onOpenServerSettings={openServerSettingsPanel}
      onOpenNotificationSettings={() => openSettingsPanel("notifications")}
      onOpenPersonalProfileSettings={() => openSettingsPanel("personal_profile")}
      onShowServerFeedback={showServerInviteFeedback}
      inviteFriends={directConversationTargets}
      isServerInviteModalOpen={serverInviteModalOpen}
      serverInviteTarget={serverInviteTarget}
      serverInviteTargetChannelName={serverInviteTargetChannelName}
      onOpenServerInviteModal={openServerInviteModal}
      onCloseServerInviteModal={closeServerInviteModal}
      onCreateServerInviteLink={createServerInviteLinkForModal}
      onSendServerInviteToFriend={sendServerInviteToFriend}
      onUpdateMemberNickname={updateMemberNickname}
      onUpdateMemberVoiceState={updateMemberVoiceState}
      onUpdateMemberRole={updateMemberRole}
      onCopyServerInvite={copyServerInviteLink}
      onLeaveServer={handleLeaveServer}
      onDeleteServer={handleDeleteServer}
      onAddServer={stableHandleAddServer}
      onAddTextChannel={addTextChannel}
      onAddVoiceChannel={addVoiceChannel}
      onCreateCategory={createChannelCategory}
      onToggleCategory={toggleChannelCategory}
      onDeleteCategory={deleteChannelCategory}
      onDeleteDefaultCategory={deleteDefaultChannelCategory}
      onReorderCategories={reorderChannelCategories}
      onCreateChannel={createServerChannel}
      onMoveChannel={moveServerChannel}
      onOpenChannelSettings={openChannelSettings}
      onCloseChannelSettings={closeChannelSettings}
      onUpdateChannelSettings={updateChannelSettings}
      onDeleteTextChannel={handleDeleteTextChannel}
      onDeleteVoiceChannel={handleDeleteVoiceChannel}
      onSelectTextChannel={selectServerTextChannel}
      onUpdateChannelRenameValue={updateChannelRenameValue}
      onSubmitChannelRename={submitChannelRename}
      onCancelChannelRename={cancelChannelRename}
      onJoinVoiceChannel={stableJoinVoiceChannel}
      onLeaveVoiceChannel={stableLeaveVoiceChannel}
      onPrewarmVoiceChannel={prewarmVoiceChannel}
      onWatchStream={stableHandleWatchStream}
      canManageTargetMember={canManageTargetMember}
      canAssignRoleToMember={canAssignRoleToMember}
      canInviteToServer={canInviteToServer}
      getChannelDisplayName={getChannelDisplayName}
      getScopedChatChannelId={getScopedChatChannelId}
    />
  );
  const renderFriendsMain = () => (
    <Suspense fallback={friendsWorkspaceFallback}>
      <FriendsMain
        user={user}
        currentDirectFriend={currentDirectFriend}
        currentConversationTarget={currentConversationTarget}
        activeConversationId={activeConversationId}
        currentDirectChannelId={currentDirectChannelId}
        currentConversationChannelId={currentConversationChannelId}
        directConversationTargets={directConversationTargets}
        directSearchQuery={channelSearchQuery}
        textChatLocalStateVersion={textChatLocalStateVersion}
        directCallPanelProps={directCallPanelProps}
        profileCustomization={profileCustomization}
        onProfileCustomizationChange={handleProfileCustomizationChange}
        selectedStreamUserId={selectedStreamUserId}
        selectedStream={selectedStream}
        selectedStreamParticipant={selectedStreamParticipant}
        selectedStreamDebugInfo={selectedStreamDebugInfo}
        friendsPageSection={friendsPageSection}
        friends={friendsWithRelationState}
        incomingFriendRequestCount={incomingFriendRequestCount}
        incomingFriendRequests={incomingFriendRequests}
        friendRequestsError={friendRequestsError}
        friendRequestsLoading={friendRequestsLoading}
        friendRequestActionId={friendRequestActionId}
        friendEmail={friendEmail}
        friendQueryMode={friendQueryMode}
        friendLookupLoading={friendLookupLoading}
        friendLookupResults={friendLookupResults}
        friendLookupPerformed={friendLookupPerformed}
        friendsError={friendsError}
        isAddingFriend={isAddingFriend}
        activeContacts={activeContacts}
        conversations={conversations}
        directUnreadCounts={directUnreadCounts}
        conversationsLoading={conversationsLoading}
        conversationsError={conversationsError}
        conversationActionLoading={conversationActionLoading}
        onResetDirect={resetActiveFriendWorkspaceSelection}
        onSetFriendsSection={setFriendsPageSection}
        onOpenDirectChat={stableOpenDirectChat}
        onOpenConversationChat={openConversationChat}
        onCreateConversation={handleCreateConversation}
        onUploadConversationAvatar={handleUploadConversationAvatar}
        onAddConversationMember={handleAddConversationMember}
        onUpdateConversation={handleUpdateConversation}
        onUpdateConversationMemberRole={handleUpdateConversationMemberRole}
        onRemoveConversationMember={handleRemoveConversationMember}
        onLeaveConversation={async (conversationId) => {
          const result = await handleLeaveConversation(conversationId);
          if (String(activeConversationId || "") === String(conversationId || "")) {
            resetActiveFriendWorkspaceSelection();
            setFriendsPageSection("conversations");
          }
          return result;
        }}
        onDeleteConversation={async (conversationId) => {
          const result = await handleDeleteConversation(conversationId);
          if (String(activeConversationId || "") === String(conversationId || "")) {
            resetActiveFriendWorkspaceSelection();
            setFriendsPageSection("conversations");
          }
          return result;
        }}
        onClearConversationStatus={() => setConversationActionStatus("")}
        onStartDirectCall={stableStartDirectCallWithUser}
        onOpenDirectActions={openFriendListUserContextMenu}
        onOpenDirectProfile={openFriendListProfile}
        onCloseSelectedStream={closeSelectedStream}
        onFriendRequestAction={handleFriendRequestAction}
        onFriendSearchSubmit={handleFriendSearchSubmit}
        onFriendSearchChange={(value) => {
          setFriendEmail(value);
          if (friendsError) {
            setFriendsError("");
          }
          if (friendActionStatus) {
            setFriendActionStatus("");
          }
        }}
        onDirectSearchQueryChange={setChannelSearchQuery}
        onClearDirectSearchQuery={clearChannelSearch}
        onAddFriend={handleAddFriend}
        onOpenServersWorkspace={openServersWorkspace}
        onImportServer={handleImportServer}
        onServerShared={markServerAsShared}
        phoneIcon={PHONE_ICON_URL}
        searchIcon={SEARCH_ICON_URL}
        getDisplayName={getDisplayName}
      />
    </Suspense>
  );
  const renderServerMain = () => (
    <ServerMain
      activeServer={activeServer}
      currentTextChannel={currentTextChannel}
      selectedVoiceChannel={selectedVoiceChannel}
      currentVoiceChannelName={currentVoiceChannelName}
      desktopServerPane={desktopServerPane}
      currentVoiceParticipants={currentVoiceParticipants}
      activeVoiceParticipantsMap={activeVoiceParticipantsMap}
      joiningVoiceChannelId={joiningVoiceChannelId}
      remoteScreenShares={remoteScreenShares}
      activeServerUnreadCount={activeServerUnreadCount}
      hasLocalSharePreview={hasLocalSharePreview}
      isLocalSharePreviewVisible={isLocalSharePreviewVisible}
      localSharePreview={localSharePreview}
      localSharePreviewMeta={localSharePreviewMeta}
      localSharePreviewDebugInfo={localSharePreviewDebugInfo}
      selectedStreamUserId={selectedStreamUserId}
      selectedStream={selectedStream}
      selectedStreamParticipant={selectedStreamParticipant}
      selectedStreamDebugInfo={selectedStreamDebugInfo}
      channelSearchQuery={channelSearchQuery}
      searchIcon={SEARCH_ICON_URL}
      user={user}
      directConversationTargets={directConversationTargets}
      serverMembers={textChatServerMembers}
      serverRoles={activeServer?.roles || EMPTY_ARRAY}
      textChatNavigationRequest={textChatNavigationRequest}
      onTextChatNavigationIndexChange={setTextChatNavigationIndex}
      onOpenDirectChat={stableOpenDirectChat}
      onStartDirectCall={stableStartDirectCallWithUser}
      onOpenLocalSharePreview={stableOpenLocalSharePreview}
      onPreviewStream={stableHandlePreviewStream}
      onWatchStream={stableHandleWatchStream}
      onChannelSearchChange={setChannelSearchQuery}
      onClearChannelSearch={clearChannelSearch}
      onAddServer={stableHandleAddServer}
      onCloseSelectedStream={closeSelectedStream}
      onStopCameraShare={stableStopCameraShare}
      onStopScreenShare={stableStopScreenShare}
      onCloseLocalSharePreview={stableCloseLocalSharePreview}
      isMicMuted={isMicMuted}
      isSoundMuted={isSoundMuted}
      isScreenShareActive={isScreenShareActive}
      isCameraShareActive={isCameraShareActive}
      onToggleMic={stableToggleMicMute}
      onToggleSound={stableToggleSoundMute}
      onOpenTextChat={openDesktopTextChatPane}
      onScreenShareAction={stableHandleScreenShareAction}
      onOpenCamera={stableHandleCameraAction}
      onLeave={stableLeaveVoiceChannel}
      onJoinVoiceChannel={stableJoinVoiceChannel}
      onCreateForumPost={stableCreateForumPost}
      onAddForumReply={stableAddForumReply}
      getChannelDisplayName={getChannelDisplayName}
    />
  );
  const renderDesktopServerRail = () => (
    <DesktopServerRail
      servers={servers}
      workspaceMode={workspaceMode}
      activeServer={activeServer}
      activeDirectCall={directCallState.phase !== "idle" ? directCallState : null}
      participantsMap={participantsMap}
      defaultServerIcon={DEFAULT_SERVER_ICON}
      smsIcon={SMS_ICON_URL}
      onOpenFriendsWorkspace={openFriendsWorkspace}
      onOpenDirectCallChat={(targetUserId) => {
        if (!targetUserId) {
          return;
        }

        openDirectChat(targetUserId);
      }}
      onServerShortcutClick={handleServerShortcutClick}
      onServerContextMenu={openServerContextMenu}
      onServerPointerDown={handleServerShortcutPointerDown}
      onServerPointerUp={handleServerShortcutPointerUp}
      onServerPointerCancel={handleServerShortcutPointerCancel}
      onAddServer={stableHandleAddServer}
      getServerIconFrame={getServerIconFrame}
    />
  );
  const renderMobileServerStrip = () => (
    <MobileServerStrip
      servers={servers}
      workspaceMode={workspaceMode}
      activeServer={activeServer}
      participantsMap={participantsMap}
      defaultServerIcon={DEFAULT_SERVER_ICON}
      onServerShortcutClick={handleServerShortcutClick}
      onServerPointerDown={handleServerShortcutPointerDown}
      onServerPointerUp={handleServerShortcutPointerUp}
      onServerPointerCancel={handleServerShortcutPointerCancel}
      onAddServer={stableHandleAddServer}
      getServerIconFrame={getServerIconFrame}
    />
  );
  const renderMobileDirectChat = () => (
    <MobileDirectChat
      currentDirectFriend={currentConversationTarget || currentDirectFriend}
      currentDirectChannelId={currentConversationTarget ? currentConversationChannelId : currentDirectChannelId}
      textChatLocalStateVersion={textChatLocalStateVersion}
      user={user}
      directConversationTargets={directConversationTargets}
      getDisplayName={getDisplayName}
      textChatNavigationRequest={textChatNavigationRequest}
      onTextChatNavigationIndexChange={setTextChatNavigationIndex}
      onClearChannelSearch={clearChannelSearch}
      onStartDirectCall={stableStartDirectCallWithUser}
    />
  );
  const renderMobileVoiceRoom = () => (
    <Suspense fallback={coldPanelFallback}>
      <MobileVoiceRoom
        stageMode={mobileVoiceStageMode}
        stageCopy={mobileVoiceStageCopy}
        spotlightParticipant={spotlightVoiceParticipant}
        stageShellRef={mobileVoiceStageShellRef}
        stageVideoRef={mobileVoiceStageVideoRef}
        stageImageRef={mobileVoiceStageImageRef}
        selectedStream={selectedStream}
        localSharePreview={localSharePreview}
        participants={currentVoiceParticipants}
        canInvite={canInviteToServer(activeServer)}
        isMicMuted={isMicMuted}
        isSoundMuted={isSoundMuted}
        isScreenShareActive={isScreenShareActive}
        isCameraShareActive={isCameraShareActive}
        icons={{
          ...mobileVoiceStageIcons,
        }}
        onOpenFullscreen={openMobileVoiceStageFullscreen}
        onCloseRemoteStream={closeSelectedStream}
        onCloseLocalPreview={stableCloseLocalSharePreview}
        onStopScreenShare={stableStopScreenShare}
        onStopCameraShare={stableStopCameraShare}
        onWatchStream={stableHandleWatchStream}
        onInvite={handleInvitePeopleToVoice}
        onToggleMic={stableToggleMicMute}
        onToggleSound={stableToggleSoundMute}
        onOpenChat={openMobileServersChatPane}
        onScreenShareAction={stableHandleScreenShareAction}
        onOpenCamera={stableOpenCameraModal}
        onLeave={stableLeaveVoiceChannel}
      />
    </Suspense>
  );
  const renderMobileProfileScreen = () => (
    <Suspense fallback={coldPanelFallback}>
      <MobileProfileScreen
        profileBackgroundSrc={profileBackgroundSrc}
        profileBackgroundFrame={profileDraft.profileBackgroundFrame}
        avatarSrc={getUserAvatar(user)}
        avatarFrame={getUserAvatarFrame(user)}
        displayName={getDisplayName(user)}
        email={user?.email || ""}
        isSpeaking={Boolean(currentVoiceChannel && isCurrentUserSpeaking)}
        currentVoiceChannelName={currentVoiceChannelName}
        onChangeAvatar={() => avatarInputRef.current?.click()}
        onChangeBackground={() => profileBackgroundInputRef.current?.click()}
        onOpenProfileSettings={() => openSettingsPanel("personal_profile")}
        onOpenVoiceSettings={() => openSettingsPanel("voice_video")}
        onOpenNotificationSettings={() => openSettingsPanel("notifications")}
        onLogout={handleLogout}
      />
    </Suspense>
  );
  const desktopTitlebarContext = useMemo(() => {
    if (SHOW_DIRECT_CALL_IN_TITLEBAR && directCallState.phase !== "idle") {
      return {
        title: directCallState.peerName || "Личный звонок",
        iconType: directCallState.peerAvatar ? "image" : "glyph",
        iconSrc: directCallState.peerAvatar || "",
        iconAlt: directCallState.peerName || "Личный звонок",
        iconGlyph: "C",
      };
    }

    if (openSettings) {
      return {
        title: activeSettingsTabMeta?.label || "Настройки",
        iconType: "glyph",
        iconGlyph: "⚙",
      };
    }

    if (workspaceMode === "friends") {
      if (currentDirectFriend) {
        return {
          title: getDisplayName(currentDirectFriend),
          iconType: currentDirectFriend?.avatar ? "image" : "glyph",
          iconSrc: currentDirectFriend?.avatar || "",
          iconAlt: getDisplayName(currentDirectFriend),
          iconGlyph: currentDirectFriend?.isSelf ? "В" : "ЛС",
        };
      }

      if (currentConversationTarget) {
        return {
          title: currentConversationTarget.title || "Беседа",
          iconType: currentConversationTarget?.avatar ? "image" : "glyph",
          iconSrc: currentConversationTarget?.avatar || "",
          iconAlt: currentConversationTarget.title || "Беседа",
          iconGlyph: "#",
        };
      }

      if (friendsPageSection === "conversations") {
        return {
          title: "Беседы",
          iconType: "glyph",
          iconGlyph: "#",
        };
      }

      return {
        title: "Друзья",
        iconType: "image",
        iconSrc: SMS_ICON_URL,
        iconAlt: "Друзья",
      };
    }

    if (activeServer) {
      return {
        title: activeServer.name || "Сервер",
        iconType: activeServer.icon ? "image" : "glyph",
        iconSrc: activeServer.icon ? resolveMediaUrl(activeServer.icon, DEFAULT_SERVER_ICON) : "",
        iconAlt: activeServer.name || "Сервер",
        iconGlyph: String(activeServer.name || "S").trim().charAt(0).toUpperCase() || "S",
      };
    }

    return {
      title: "Tend",
      iconType: "glyph",
      iconGlyph: "T",
    };
  }, [
    activeServer,
    activeSettingsTabMeta?.label,
    currentConversationTarget,
    currentDirectFriend,
    directCallState,
    friendsPageSection,
    getDisplayName,
    openSettings,
    workspaceMode,
  ]);
  const hasDesktopWindowControls = typeof window !== "undefined" && Boolean(window.electronWindowControls?.minimize);
  const handleWindowMinimize = useCallback(() => {
    window.electronWindowControls?.minimize?.().catch?.(() => {});
  }, []);
  const handleWindowToggleMaximize = useCallback(() => {
    window.electronWindowControls?.toggleMaximize?.().catch?.(() => {});
  }, []);
  const handleWindowClose = useCallback(() => {
    window.electronWindowControls?.close?.().catch?.(() => {});
  }, []);
  const renderDesktopTitlebar = () => (
    <div className="desktop-app-topbar">
      <div className="desktop-app-topbar__drag" aria-hidden="true" />
      <div className="desktop-app-topbar__left">
        <button
          type="button"
          className="desktop-app-topbar__nav"
          onClick={navigateHistoryBack}
          disabled={!canNavigateBack}
          aria-label="Назад"
        >
          ←
        </button>
        <button
          type="button"
          className="desktop-app-topbar__nav"
          onClick={navigateHistoryForward}
          disabled={!canNavigateForward}
          aria-label="Вперед"
        >
          →
        </button>
      </div>
      <div className="desktop-app-topbar__center">
        <div className="desktop-app-topbar__title">
          {desktopTitlebarContext.iconType === "image" && desktopTitlebarContext.iconSrc ? (
            <img
              className="desktop-app-topbar__title-icon desktop-app-topbar__title-icon--image"
              src={desktopTitlebarContext.iconSrc}
              alt={desktopTitlebarContext.iconAlt || desktopTitlebarContext.title}
            />
          ) : (
            <span className="desktop-app-topbar__title-icon" aria-hidden="true">
              {desktopTitlebarContext.iconGlyph}
            </span>
          )}
          <div className="desktop-app-topbar__title-copy">
            <strong>{desktopTitlebarContext.title}</strong>
          </div>
        </div>
      </div>
      <div className="desktop-app-topbar__right">
        {hasDesktopWindowControls ? (
          <div className="desktop-app-topbar__window-controls">
            <button
              type="button"
              className="desktop-app-topbar__window-button"
              onClick={handleWindowMinimize}
              aria-label="Свернуть окно"
              title="Свернуть"
            >
              <span className="desktop-app-topbar__window-glyph desktop-app-topbar__window-glyph--minimize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="desktop-app-topbar__window-button"
              onClick={handleWindowToggleMaximize}
              aria-label="Развернуть окно"
              title="Развернуть"
            >
              <span className="desktop-app-topbar__window-glyph desktop-app-topbar__window-glyph--maximize" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="desktop-app-topbar__window-button desktop-app-topbar__window-button--close"
              onClick={handleWindowClose}
              aria-label="Закрыть окно"
              title="Закрыть"
            >
              <span className="desktop-app-topbar__window-glyph desktop-app-topbar__window-glyph--close" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
  const renderMobileShell = () => (
    <MenuMainMobileLayout
      mobileSection={mobileSection}
      setMobileSection={setMobileSection}
      workspaceMode={workspaceMode}
      currentDirectFriend={currentDirectFriend}
      currentConversationTarget={currentConversationTarget}
      setActiveDirectFriendId={setActiveDirectFriendId}
      setActiveConversationId={setActiveConversationId}
      setFriendsPageSection={setFriendsPageSection}
      isLocalSharePreviewVisible={isLocalSharePreviewVisible}
      setIsLocalSharePreviewVisible={setIsLocalSharePreviewVisible}
      currentVoiceChannel={currentVoiceChannel}
      setMobileServersPane={setMobileServersPane}
      selectedStreamUserId={selectedStreamUserId}
      setSelectedStreamUserId={setSelectedStreamUserId}
      mobileServersPane={mobileServersPane}
      user={user}
      totalDirectUnreadCount={totalDirectUnreadCount}
      totalServerUnreadCount={totalServerUnreadCount}
      directUnreadCounts={directUnreadCounts}
      currentDirectChannelId={currentDirectChannelId}
      friendsPageSection={friendsPageSection}
      friends={friendsWithRelationState}
      incomingFriendRequestCount={incomingFriendRequestCount}
      totalFriendsAttentionCount={totalFriendsAttentionCount}
      hasLocalSharePreview={hasLocalSharePreview}
      localSharePreview={localSharePreview}
      activeServerUnreadCount={activeServerUnreadCount}
      activeServer={activeServer}
      selectedStreamParticipant={selectedStreamParticipant}
      currentVoiceChannelName={currentVoiceChannelName}
      currentVoiceParticipants={currentVoiceParticipants}
      currentTextChannel={currentTextChannel}
      openSettingsPanel={openSettingsPanel}
      openServersWorkspace={openServersWorkspace}
      openFriendsWorkspace={openFriendsWorkspace}
      renderMobileProfileScreen={renderMobileProfileScreen}
      renderMobileDirectChat={renderMobileDirectChat}
      renderFriendsMain={renderFriendsMain}
      renderMobileServerStrip={renderMobileServerStrip}
      renderMobileVoiceRoom={renderMobileVoiceRoom}
      renderServerMain={renderServerMain}
      renderServersSidebar={renderServersSidebar}
    />
  );
  const mainContent = isMobileViewport ? (
    renderMobileShell()
  ) : (
    <div className="menu-shell">
      {renderDesktopTitlebar()}
      <div className="menu-shell__content">
        <div className="menu__main">
          {renderDesktopServerRail()}
          {workspaceMode === "friends" ? renderFriendsSidebar() : renderServersSidebar()}
          {workspaceMode === "friends" ? renderFriendsMain() : renderServerMain()}
        </div>
        {workspaceMode === "friends" ? (
          <ServerRailContextLayer
            servers={servers}
            serverContextMenu={serverContextMenu}
            serverContextMenuRef={serverContextMenuRef}
            canInviteToServer={canInviteToServer}
            currentUserId={currentUserId}
            inviteFriends={directConversationTargets}
            isServerInviteModalOpen={serverInviteModalOpen}
            serverInviteTarget={serverInviteTarget}
            serverInviteTargetChannelName={serverInviteTargetChannelName}
            currentTextChannel={currentTextChannel}
            onOpenServerInviteModal={openServerInviteModal}
            onCloseServerInviteModal={closeServerInviteModal}
            onCreateServerInviteLink={createServerInviteLinkForModal}
            onSendServerInviteToFriend={sendServerInviteToFriend}
            onCopyServerInvite={copyServerInviteLink}
            onLeaveServer={handleLeaveServer}
            onDeleteServer={handleDeleteServer}
            getChannelDisplayName={getChannelDisplayName}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <MenuMainOverlayLayer
      avatarInputRef={avatarInputRef}
      profileBackgroundInputRef={profileBackgroundInputRef}
      handleAvatarChange={handleAvatarChange}
      handleProfileBackgroundChange={handleProfileBackgroundChange}
      serverInviteFeedback={serverInviteFeedback}
      isMobileViewport={isMobileViewport}
      openSettings={openSettings}
      popupRef={popupRef}
      user={user}
      settingsNavSections={settingsNavSections}
      settingsTab={settingsTab}
      setOpenSettings={setOpenSettings}
      setSettingsTab={setSettingsTab}
      renderMobileSettingsShell={renderMobileSettingsShell}
      renderSettingsContent={renderSettingsContent}
      showCreateServerModal={showCreateServerModal}
      createServerName={createServerName}
      createServerIcon={createServerIcon}
      createServerIconFrame={createServerIconFrame}
      createServerError={createServerError}
      closeCreateServerModal={closeCreateServerModal}
      handleCreateServerSubmit={handleCreateServerSubmit}
      handleCreateServerIconChange={handleCreateServerIconChange}
      setCreateServerName={setCreateServerName}
      setCreateServerError={setCreateServerError}
      showModal={showModal}
      resolution={resolution}
      fps={fps}
      shareStreamAudio={shareStreamAudio}
      isScreenShareActive={isScreenShareActive}
      isCameraShareActive={isCameraShareActive}
      currentVoiceChannel={currentVoiceChannel}
      isScreenShareSupported={isScreenShareSupported}
      screenShareError={screenShareError}
      setShowModal={setShowModal}
      setScreenShareError={setScreenShareError}
      setResolution={handleStreamResolutionChange}
      setFps={handleStreamFpsChange}
      setShareStreamAudio={setShareStreamAudio}
      startScreenShare={startScreenShare}
      stopScreenShare={stopScreenShare}
      openLocalSharePreview={openLocalSharePreview}
      showCameraModal={showCameraModal}
      cameraDevices={cameraDevices}
      selectedVideoDeviceId={selectedVideoDeviceId}
      cameraPreviewRef={cameraPreviewRef}
      hasCameraPreview={hasCameraPreview}
      cameraError={cameraError}
      closeCameraModal={closeCameraModal}
      handleCameraPreviewDeviceChange={handleCameraPreviewDeviceChange}
      startCameraPreview={startCameraPreview}
      startCameraShare={startCameraShare}
      stopCameraShare={stopCameraShare}
      showQrScannerModal={showQrScannerModal}
      qrScannerDevices={qrScannerDevices}
      selectedQrScannerDeviceId={selectedQrScannerDeviceId}
      qrScannerPreviewRef={qrScannerPreviewRef}
      hasQrScannerPreview={hasQrScannerPreview}
      qrScannerError={qrScannerError}
      qrScannerStatus={qrScannerStatus}
      closeQrScannerModal={closeQrScannerModal}
      handleQrScannerDeviceChange={handleQrScannerDeviceChange}
      startQrScannerPreview={startQrScannerPreview}
      mediaFrameEditorState={mediaFrameEditorState}
      closeMediaFrameEditor={closeMediaFrameEditor}
      handleMediaFrameConfirm={handleMediaFrameConfirm}
      directMessageToasts={directMessageToasts}
      openConversationChat={openConversationChat}
      openDirectChat={openDirectChat}
      dismissDirectToast={dismissDirectToast}
      serverMessageToasts={serverMessageToasts}
      openServerChannelFromToast={openServerChannelFromToast}
      dismissServerToast={dismissServerToast}
      workspaceStatusToasts={workspaceStatusToasts}
      dismissWorkspaceStatusToast={dismissWorkspaceStatusToast}
      quickSwitcherOpen={quickSwitcherOpen}
      quickSwitcherQuery={quickSwitcherQuery}
      quickSwitcherItems={quickSwitcherItems}
      quickSwitcherSelectedIndex={quickSwitcherSelectedIndex}
      setQuickSwitcherSelectedIndex={setQuickSwitcherSelectedIndex}
      setQuickSwitcherQuery={setQuickSwitcherQuery}
      handleQuickSwitcherSelect={handleQuickSwitcherSelect}
      closeQuickSwitcher={closeQuickSwitcher}
      directCallState={directCallState}
      directCallHistory={directCallHistory}
      isMicMuted={isMicMuted}
      isSoundMuted={isSoundMuted}
      micLevel={micLevel}
      directCallPeerIsSpeaking={directCallPeerIsSpeaking}
      isDirectCallPeerStreamLive={isDirectCallPeerStreamLive}
      isWatchingDirectCallPeerStream={isWatchingDirectCallPeerStream}
      directCallPeerStreamMode={directCallPeerStreamShare?.mode || ""}
      audioInputDevices={audioInputDevices}
      audioOutputDevices={audioOutputDevices}
      selectedInputDeviceId={selectedInputDeviceId}
      selectedOutputDeviceId={selectedOutputDeviceId}
      outputSelectionSupported={outputSelectionSupported}
      toggleMicMute={toggleMicMute}
      toggleSoundMute={toggleSoundMute}
      setSelectedInputDeviceId={setSelectedInputDeviceId}
      setSelectedOutputDeviceId={setSelectedOutputDeviceId}
      setDirectCallMiniMode={setDirectCallMiniMode}
      dismissDirectCallOverlay={dismissDirectCallOverlay}
      retryDirectCall={retryDirectCall}
      onDirectCallHistoryRedial={startDirectCallIfAllowed}
      onWatchDirectCallPeerStream={() => handleWatchStream(directCallState.peerUserId)}
      acceptDirectCall={acceptDirectCall}
      declineDirectCall={declineDirectCall}
      endDirectCall={endDirectCall}
    >
      {mainContent}
    </MenuMainOverlayLayer>
  );
}

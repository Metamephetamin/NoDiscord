import { useEffect, useMemo, useRef, useState } from "react";
import VoiceChannelList from "../../components/VoiceChannelList";
import TextChat from "../../components/TextChat";
import MobileProfileScreen from "../../components/MobileProfileScreen";
import MobileVoiceRoom from "../../components/MobileVoiceRoom";
import { FriendsMain, FriendsSidebar } from "../../components/FriendsWorkspace";
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
  isVideoAvatarUrl,
  validateAvatarFile,
  validateProfileBackgroundFile,
  validateServerIconFile,
} from "../../utils/avatarMedia";
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
import { getChatDraftUpdatedEventName, hasChatDraft } from "../../utils/chatDrafts";
import { buildDirectMessageChannelId } from "../../utils/directMessageChannels";
import {
  getDirectMessageReceiveSoundStorageKey,
  getDirectMessageSendSoundStorageKey,
  getDirectMessageSoundEnabledStorageKey,
  getDirectMessageSoundOptions,
} from "../../utils/directMessageSounds";
import { isUserMentioned } from "../../utils/messageMentions";
import {
  areNamesUsingSameScript,
  detectNameScript,
  normalizeSingleWordNameInput,
} from "../../utils/nameScripts";
import { createVoiceRoomClient } from "../../webrtc/voiceRoomClient";
import { SCREEN_SHARE_ALLOWED_FPS } from "../../webrtc/voiceClientUtils";
import useFriendsWorkspaceState from "../../hooks/useFriendsWorkspaceState";
import useServerInviteActions from "../../hooks/useServerInviteActions";
import {
  MenuMainMobileSettingsShell,
  MenuMainSettingsContent,
} from "./MenuMainSettingsRenderer";
import MenuMainProfilePanelSlot from "./MenuMainProfilePanelSlot";
import MenuMainOverlayLayer from "./MenuMainOverlayLayer";
import MenuMainMobileLayout from "./MenuMainMobileLayout";
import {
  DEFAULT_SERVER_ICON,
  resolveMediaUrl,
} from "../../utils/media";
import { getDisplayCaptureSupportInfo } from "../../utils/browserMediaSupport";
import {
  getDefaultMediaFrame,
  normalizeMediaFrame,
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
  getAudioInputDeviceStorageKey,
  getAudioOutputDeviceStorageKey,
  getCanonicalSharedServerId,
  getChannelDisplayName,
  getCurrentUserId,
  getDirectNotificationsStorageKey,
  getDisplayName,
  getEchoCancellationStorageKey,
  getFriendSearchModeForQuery,
  getMeterActiveBars,
  getNoiseSuppressionStorageKey,
  getNotificationSoundCustomDataStorageKey,
  getNotificationSoundCustomNameStorageKey,
  getNotificationSoundEnabledStorageKey,
  getNotificationSoundStorageKey,
  getPingTone,
  getScopedChatChannelId,
  getScopedVoiceChannelId,
  getServerIconFrame,
  getServerNotificationsStorageKey,
  getServersStorageKey,
  getUserAvatar,
  getUserAvatarFrame,
  getUserProfileBackground,
  getUserProfileBackgroundFrame,
  getVideoInputDeviceStorageKey,
  hasServerPermission,
  HEADPHONES_ICON_URL,
  isPersonalDefaultServer,
  isValidProfileName,
  MAX_PROFILE_NAME_LENGTH,
  mergePersistedServers,
  MICROPHONE_ICON_URL,
  MOBILE_VIEWPORT_QUERY,
  MONITOR_ICON_URL,
  normalizeFriend,
  normalizeServers,
  normalizeTextChannelName,
  NOTIFICATION_SOUND_OPTIONS,
  parseServerChatChannelId,
  PENCIL_ICON_URL,
  PHONE_ICON_URL,
  readStoredServers,
  resolveIncomingMessagePreview,
  SEARCH_ICON_URL,
  SETTINGS_ICON_URL,
  SETTINGS_NAV_ITEMS,
  SMS_ICON_URL,
  UI_SOUND_PATHS,
  uiSoundCache,
  VOICE_INPUT_MODES,
} from "../../utils/menuMainModel";
export default function MenuMain({
  user,
  setUser,
  onLogout,
  pendingImportedServer = null,
  onPendingImportedServerHandled,
}) {
  const [servers, setServers] = useState(() => readStoredServers(user));
  const [activeServerId, setActiveServerId] = useState(
    () => localStorage.getItem(getActiveServerStorageKey(user)) || readStoredServers(user)[0]?.id || ""
  );
  const [currentTextChannelId, setCurrentTextChannelId] = useState(() => readStoredServers(user)[0]?.textChannels?.[0]?.id || "");
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState(null);
  const [joiningVoiceChannelId, setJoiningVoiceChannelId] = useState("");
  const [participantsMap, setParticipantsMap] = useState({});
  const [roomVoiceParticipants, setRoomVoiceParticipants] = useState({ channel: "", participants: [] });
  const [openSettings, setOpenSettings] = useState(false);
  const [micVolume, setMicVolume] = useState(70);
  const [audioVolume, setAudioVolume] = useState(100);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState("");
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState("");
  const [outputSelectionSupported, setOutputSelectionSupported] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState("transparent");
  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(true);
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
  const [selectedStreamUserId, setSelectedStreamUserId] = useState(null);
  const [speakingUserIds, setSpeakingUserIds] = useState([]);
  const [showServerMembersPanel, setShowServerMembersPanel] = useState(false);
  const [memberRoleMenu, setMemberRoleMenu] = useState(null);
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [rolesExpanded, setRolesExpanded] = useState(false);
  const [channelRenameState, setChannelRenameState] = useState(null);
  const [activeDirectFriendId, setActiveDirectFriendId] = useState("");
  const [directNotificationsEnabled, setDirectNotificationsEnabled] = useState(true);
  const [directMessageToasts, setDirectMessageToasts] = useState([]);
  const [serverNotificationsEnabled, setServerNotificationsEnabled] = useState(true);
  const [serverMessageToasts, setServerMessageToasts] = useState([]);
  const [directUnreadCounts, setDirectUnreadCounts] = useState({});
  const [serverUnreadCounts, setServerUnreadCounts] = useState({});
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const [notificationSoundId, setNotificationSoundId] = useState(NOTIFICATION_SOUND_OPTIONS[0].id);
  const [customNotificationSoundData, setCustomNotificationSoundData] = useState("");
  const [customNotificationSoundName, setCustomNotificationSoundName] = useState("");
  const [notificationSoundError, setNotificationSoundError] = useState("");
  const [directMessageSoundEnabled, setDirectMessageSoundEnabled] = useState(true);
  const [directMessageSendSoundId, setDirectMessageSendSoundId] = useState(getDirectMessageSoundOptions("send")[0]?.id || "classic");
  const [directMessageReceiveSoundId, setDirectMessageReceiveSoundId] = useState(getDirectMessageSoundOptions("receive")[0]?.id || "classic");
  const [chatDraftPresence, setChatDraftPresence] = useState({});
  const [workspaceMode, setWorkspaceMode] = useState("servers");
  const [friendsPageSection, setFriendsPageSection] = useState("friends");
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
    setFriends,
    setFriendEmail,
    setFriendsError,
    setFriendActionStatus,
    refreshFriends,
    refreshFriendRequests,
    rerunFriendSearch,
    updateFriendProfile,
    resetFriendsState,
    handleFriendSearchSubmit,
    handleAddFriend,
    handleFriendRequestAction,
  } = useFriendsWorkspaceState({
    user,
    apiBaseUrl: API_BASE_URL,
    activeDirectFriendId,
    friendsPageSection,
  });  const [settingsTab, setSettingsTab] = useState("voice_video");
  const [autoInputSensitivity, setAutoInputSensitivity] = useState(true);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [isMicTestActive, setIsMicTestActive] = useState(false);
  const [showSoundMenu, setShowSoundMenu] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [hasCameraPreview, setHasCameraPreview] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState("");
  const [chatSyncTick, setChatSyncTick] = useState(0);
  const [profileDraft, setProfileDraft] = useState({
    firstName: user?.first_name || user?.firstName || "",
    lastName: user?.last_name || user?.lastName || "",
    email: user?.email || "",
    profileBackgroundUrl: getUserProfileBackground(user),
    profileBackgroundFrame: getUserProfileBackgroundFrame(user),
  });
  const [profileStatus, setProfileStatus] = useState("");
  const [mediaFrameEditorState, setMediaFrameEditorState] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  });
  const [mobileSection, setMobileSection] = useState("servers");
  const [mobileServersPane, setMobileServersPane] = useState("channels");

  const popupRef = useRef(null);
  const serverMembersRef = useRef(null);
  const memberRoleMenuRef = useRef(null);
  const serverContextMenuRef = useRef(null);
  const noiseMenuRef = useRef(null);
  const micMenuRef = useRef(null);
  const soundMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const profileBackgroundInputRef = useRef(null);
  const serverIconInputRef = useRef(null);
  const mobileVoiceStageShellRef = useRef(null);
  const mobileVoiceStageVideoRef = useRef(null);
  const mobileVoiceStageImageRef = useRef(null);
  const voiceJoinAttemptRef = useRef(0);
  const voiceJoinInFlightRef = useRef(false);
  const pendingVoiceChannelTargetRef = useRef("");
  const notificationSoundInputRef = useRef(null);
  const cameraPreviewRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const voiceClientRef = useRef(null);
  const previousVoiceChannelRef = useRef(null);
  const previousScreenShareRef = useRef(false);
  const joinedDirectChannelsRef = useRef(new Set());
  const joinedServerNotificationChannelsRef = useRef(new Set());
  const hasBoundChatReconnectHandlerRef = useRef(false);
  const userSessionActiveRef = useRef(false);
  const directToastTimeoutsRef = useRef(new Map());
  const serverToastTimeoutsRef = useRef(new Map());
  const serverLongPressTimeoutRef = useRef(null);
  const serverLongPressTriggeredRef = useRef(false);
  const suppressedServerClickRef = useRef("");
  const appliedInputDeviceRef = useRef("");
  const appliedOutputDeviceRef = useRef("");
  const serversStorageKey = useMemo(() => getServersStorageKey(user), [user?.id, user?.email]);
  const activeServerStorageKey = useMemo(() => getActiveServerStorageKey(user), [user?.id, user?.email]);
  const noiseSuppressionStorageKey = useMemo(() => getNoiseSuppressionStorageKey(user), [user?.id, user?.email]);
  const echoCancellationStorageKey = useMemo(() => getEchoCancellationStorageKey(user), [user?.id, user?.email]);
  const directNotificationsStorageKey = useMemo(() => getDirectNotificationsStorageKey(user), [user?.id, user?.email]);
  const serverNotificationsStorageKey = useMemo(() => getServerNotificationsStorageKey(user), [user?.id, user?.email]);
  const directMessageSoundEnabledStorageKey = useMemo(() => getDirectMessageSoundEnabledStorageKey(user), [user?.id, user?.email]);
  const directMessageSendSoundStorageKey = useMemo(() => getDirectMessageSendSoundStorageKey(user), [user?.id, user?.email]);
  const directMessageReceiveSoundStorageKey = useMemo(() => getDirectMessageReceiveSoundStorageKey(user), [user?.id, user?.email]);
  const notificationSoundEnabledStorageKey = useMemo(() => getNotificationSoundEnabledStorageKey(user), [user?.id, user?.email]);
  const notificationSoundStorageKey = useMemo(() => getNotificationSoundStorageKey(user), [user?.id, user?.email]);
  const notificationSoundCustomDataStorageKey = useMemo(() => getNotificationSoundCustomDataStorageKey(user), [user?.id, user?.email]);
  const notificationSoundCustomNameStorageKey = useMemo(() => getNotificationSoundCustomNameStorageKey(user), [user?.id, user?.email]);
  const audioInputDeviceStorageKey = useMemo(() => getAudioInputDeviceStorageKey(user), [user?.id, user?.email]);
  const audioOutputDeviceStorageKey = useMemo(() => getAudioOutputDeviceStorageKey(user), [user?.id, user?.email]);
  const videoInputDeviceStorageKey = useMemo(() => getVideoInputDeviceStorageKey(user), [user?.id, user?.email]);
  const currentUserId = useMemo(() => getCurrentUserId(user), [user?.id, user?.email]);

  const activeServer = useMemo(() => servers.find((server) => server.id === activeServerId) || servers[0] || null, [servers, activeServerId]);
  const currentTextChannel = useMemo(() => activeServer?.textChannels.find((channel) => channel.id === currentTextChannelId) || activeServer?.textChannels[0] || null, [activeServer, currentTextChannelId]);
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
  const memberRoleColorByUserId = useMemo(
    () =>
      new Map(
        (activeServer?.members || []).map((member) => {
          const role = (activeServer?.roles || []).find((item) => item.id === member.roleId);
          return [String(member.userId), role?.color || "#7b89a8"];
        })
      ),
    [activeServer?.members, activeServer?.roles]
  );
  const currentServerMember = useMemo(() => activeServer?.members?.find((member) => String(member.userId) === String(currentUserId)) || null, [activeServer, currentUserId]);
  const currentServerRole = useMemo(() => activeServer?.roles?.find((role) => role.id === currentServerMember?.roleId) || null, [activeServer, currentServerMember?.roleId]);
  const selfDirectEntry = useMemo(() => {
    if (!user || !currentUserId) {
      return null;
    }

    return normalizeFriend({
      id: currentUserId,
      first_name: user?.first_name || user?.firstName || "",
      last_name: user?.last_name || user?.lastName || "",
      email: user?.email || "",
      avatar_url: user?.avatarUrl || user?.avatar || "",
      directChannelId: buildDirectMessageChannelId(currentUserId, currentUserId),
      isSelf: true,
    });
  }, [currentUserId, user]);
  const directConversationTargets = useMemo(
    () => [selfDirectEntry, ...friends].filter(Boolean),
    [friends, selfDirectEntry]
  );
  const currentDirectFriend = useMemo(
    () => directConversationTargets.find((friend) => String(friend.id) === String(activeDirectFriendId)) || null,
    [directConversationTargets, activeDirectFriendId]
  );
  const currentDirectChannelId = useMemo(
    () => currentDirectFriend?.directChannelId || buildDirectMessageChannelId(currentUserId, currentDirectFriend?.id),
    [currentDirectFriend?.directChannelId, currentDirectFriend?.id, currentUserId]
  );
  useEffect(() => {
    const allowedFps = SCREEN_SHARE_ALLOWED_FPS[resolution] || SCREEN_SHARE_ALLOWED_FPS["1080p"];
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
    if (!isMobileViewport) {
      return;
    }

    setMobileSection((previousSection) => {
      if (previousSection === "profile") {
        return previousSection;
      }

      return workspaceMode === "friends" ? "friends" : "servers";
    });
  }, [isMobileViewport, workspaceMode]);
  useEffect(() => {
    if (!isMobileViewport || currentVoiceChannel || mobileServersPane !== "voice") {
      return;
    }

    setMobileServersPane("channels");
  }, [currentVoiceChannel, isMobileViewport, mobileServersPane]);
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
  const isDefaultServer = useMemo(() => isPersonalDefaultServer(activeServer, user), [activeServer, user]);
  const isServerOwner = useMemo(() => String(activeServer?.ownerId || "") === String(currentUserId), [activeServer?.ownerId, currentUserId]);
  const canManageServer = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_server"), [activeServer, currentUserId]);
  const canManageChannels = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_channels"), [activeServer, currentUserId]);
  const canManageRoles = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_roles"), [activeServer, currentUserId]);
  const canInviteMembers = useMemo(() => hasServerPermission(activeServer, currentUserId, "invite_members"), [activeServer, currentUserId]);
  const canInviteToServer = (server) =>
    Boolean(server) &&
    !isPersonalDefaultServer(server, user) &&
    (hasServerPermission(server, currentUserId, "invite_members") || hasServerPermission(server, currentUserId, "manage_server"));
  const isCurrentUserSpeaking = useMemo(() => speakingUserIds.some((id) => String(id) === String(currentUserId)), [currentUserId, speakingUserIds]);
  const liveUserIds = useMemo(() => Array.from(new Set([...remoteScreenShares.map((item) => item.userId).filter(Boolean), ...announcedLiveUserIds, ...(isSharingScreen && user?.id ? [String(user.id)] : [])])), [remoteScreenShares, announcedLiveUserIds, isSharingScreen, user?.id]);
  const selectedStream = useMemo(() => remoteScreenShares.find((item) => String(item.userId) === String(selectedStreamUserId)) || null, [remoteScreenShares, selectedStreamUserId]);
  const isScreenShareActive = isSharingScreen && localLiveShareMode === "screen";
  const isCameraShareActive = isSharingScreen && localLiveShareMode === "camera";
  const hasLocalSharePreview = Boolean(localSharePreview?.stream);
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
    () => friends.filter((friend) => voiceParticipantByUserId.has(String(friend.id))),
    [friends, voiceParticipantByUserId]
  );
  const totalDirectUnreadCount = useMemo(
    () => Object.values(directUnreadCounts || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0),
    [directUnreadCounts]
  );
  const incomingFriendRequestCount = useMemo(() => incomingFriendRequests.length, [incomingFriendRequests]);
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
        const leftWeight = (left.isSpeaking ? 4 : 0) + (left.isLive ? 2 : 0) + (left.isSelf ? 1 : 0);
        const rightWeight = (right.isSpeaking ? 4 : 0) + (right.isLive ? 2 : 0) + (right.isSelf ? 1 : 0);
        return rightWeight - leftWeight;
      });
  }, [activeVoiceParticipantsMap, currentUserId, currentVoiceChannel, liveUserIds, memberNameByUserId, memberRoleColorByUserId, roomVoiceParticipants, speakingUserIds]);
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
  const notificationSoundOptions = useMemo(() => {
    if (!customNotificationSoundData && notificationSoundId !== "custom") {
      return NOTIFICATION_SOUND_OPTIONS;
    }

    return [
      ...NOTIFICATION_SOUND_OPTIONS,
      {
        id: "custom",
        label: customNotificationSoundName ? `Свой файл: ${customNotificationSoundName}` : "Свой файл",
        path: customNotificationSoundData,
      },
    ];
  }, [customNotificationSoundData, customNotificationSoundName, notificationSoundId]);
  const activeNotificationSound = useMemo(
    () => notificationSoundOptions.find((option) => option.id === notificationSoundId) || notificationSoundOptions[0],
    [notificationSoundId, notificationSoundOptions]
  );
  const directMessageReceiveSoundPath = useMemo(
    () => getDirectMessageSoundOptions("receive").find((option) => option.id === directMessageReceiveSoundId)?.path || "",
    [directMessageReceiveSoundId]
  );

  const playSoundPath = (soundPath, volume = 0.42) => {
    if (!soundPath) {
      return;
    }

    try {
      const audio = new Audio(soundPath);
      audio.volume = volume;
      audio.preload = "auto";
      audio.play().catch(() => {});
    } catch {
      // ignore sound failures
    }
  };

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
  const playNotificationSound = () => {
    if (!notificationSoundEnabled || !activeNotificationSound?.path) {
      return;
    }

    playSoundPath(activeNotificationSound.path);
  };
  const playDirectMessageReceiveSound = () => {
    if (!directMessageSoundEnabled || !directMessageReceiveSoundPath) {
      return;
    }

    playSoundPath(directMessageReceiveSoundPath, 0.4);
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
      if (!previous[channelId]) {
        return previous;
      }

      const next = { ...previous };
      delete next[channelId];
      return next;
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
  const validateCustomNotificationSound = async (file) => {
    const fileName = String(file?.name || "").trim();
    const lowerName = fileName.toLowerCase();
    const fileType = String(file?.type || "").toLowerCase();
    const isSupportedType =
      lowerName.endsWith(".mp3") ||
      lowerName.endsWith(".wav") ||
      fileType === "audio/mpeg" ||
      fileType === "audio/mp3" ||
      fileType === "audio/wav" ||
      fileType === "audio/x-wav";

    if (!isSupportedType) {
      throw new Error("Можно выбрать только MP3 или WAV файл.");
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const durationSeconds = await new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          const duration = Number(audio.duration || 0);
          if (!Number.isFinite(duration) || duration <= 0) {
            reject(new Error("Не удалось определить длительность звука."));
            return;
          }

          resolve(duration);
        };
        audio.onerror = () => reject(new Error("Не удалось прочитать выбранный аудиофайл."));
        audio.src = objectUrl;
      });

      if (durationSeconds > 3) {
        throw new Error("Звук уведомления должен быть не длиннее 3 секунд.");
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось сохранить выбранный аудиофайл."));
      reader.readAsDataURL(file);
    });

    return {
      name: fileName || "custom-notification-sound",
      dataUrl,
    };
  };
  const handleCustomNotificationSoundChange = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setNotificationSoundError("");
      const validatedSound = await validateCustomNotificationSound(file);
      setCustomNotificationSoundData(validatedSound.dataUrl);
      setCustomNotificationSoundName(validatedSound.name);
      setNotificationSoundId("custom");
    } catch (error) {
      setNotificationSoundError(error.message || "Не удалось применить выбранный звук уведомления.");
    }
  };
  const logVoiceHubError = (label, error) => {
    if (isUnauthorizedError(error)) {
      return;
    }

    console.error(label, error);
  };

  const openServersWorkspace = () => {
    setWorkspaceMode("servers");
    setActiveDirectFriendId("");
    setSelectedStreamUserId(null);
    if (isMobileViewport) {
      setMobileSection("servers");
      setMobileServersPane(currentVoiceChannel ? "voice" : "channels");
    }
  };

  const openFriendsWorkspace = () => {
    setWorkspaceMode("friends");
    setSelectedStreamUserId(null);
    if (isMobileViewport) {
      setMobileSection("friends");
    }
  };

  const selectServer = (server) => {
    if (!server) {
      return;
    }

    setWorkspaceMode("servers");
    setActiveServerId(server.id);
    setCurrentTextChannelId(server.textChannels[0]?.id || "");
    setActiveDirectFriendId("");
    setSelectedStreamUserId(null);
    if (isMobileViewport) {
      setMobileSection("servers");
      setMobileServersPane("channels");
    }
  };

  const selectServerTextChannel = (channelId) => {
    setWorkspaceMode("servers");
    setCurrentTextChannelId(channelId);
    setActiveDirectFriendId("");
    if (isMobileViewport) {
      setMobileSection("servers");
      setMobileServersPane("chat");
    }
  };

  const openDirectChat = (friendId) => {
    setActiveDirectFriendId(String(friendId || ""));
    setWorkspaceMode("friends");
    setFriendsPageSection("friends");
    setSelectedStreamUserId(null);
    if (isMobileViewport) {
      setMobileSection("friends");
    }
  };

  const openServerChannelFromToast = (toast) => {
    if (!toast?.serverId || !toast?.channelId) {
      return;
    }

    setWorkspaceMode("servers");
    setActiveDirectFriendId("");
    setActiveServerId(String(toast.serverId));
    setCurrentTextChannelId(String(toast.channelId));
    if (isMobileViewport) {
      setMobileSection("servers");
      setMobileServersPane("chat");
    }
    dismissServerToast(toast.id);
  };

  const dismissDirectToast = (toastId) => {
    const timeoutId = directToastTimeoutsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      directToastTimeoutsRef.current.delete(toastId);
    }

    setDirectMessageToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  };

  const dismissServerToast = (toastId) => {
    const timeoutId = serverToastTimeoutsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      serverToastTimeoutsRef.current.delete(toastId);
    }

    setServerMessageToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  };

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

        setServers(nextServers);
        setActiveServerId(nextActiveServerId);
        setCurrentTextChannelId(nextActiveServer?.textChannels?.[0]?.id || "");
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
  }, [activeServerStorageKey, serversStorageKey, user]);

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
      setDirectMessageToasts([]);
      setServerMessageToasts([]);
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
      const nextAvatar = String(payload?.avatar_url || payload?.avatarUrl || payload?.avatar || "").trim();
      const nextProfileBackground = String(
        payload?.profile_background_url || payload?.profileBackgroundUrl || payload?.profileBackground || ""
      ).trim();
      const nextAvatarFrame = parseMediaFrame(payload?.avatar_frame, payload?.avatarFrame);
      const nextProfileBackgroundFrame = parseMediaFrame(
        payload?.profile_background_frame,
        payload?.profileBackgroundFrame
      );
      const nextEmail = String(payload?.email || "").trim();
      const nextDisplayName = `${nextFirstName} ${nextLastName}`.trim();

      updateFriendProfile(updatedUserId, (friend) => ({
        ...friend,
        firstName: nextFirstName || friend.firstName || "",
        lastName: nextLastName || friend.lastName || "",
        name: nextDisplayName || friend.name || "",
        email: nextEmail || friend.email || "",
        avatar: nextAvatar || friend.avatar || "",
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
                  name: nextDisplayName || toast.friend?.name || "",
                  email: nextEmail || toast.friend?.email || "",
                  avatar: nextAvatar || toast.friend?.avatar || "",
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
        };

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
  }, []);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(serversStorageKey, JSON.stringify(servers));
  }, [servers, serversStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setNoiseSuppressionMode("transparent");
      return;
    }

    try {
      const storedMode = localStorage.getItem(noiseSuppressionStorageKey);
      const normalizedStoredMode = storedMode === "krisp" ? "rnnoise" : storedMode;
      setNoiseSuppressionMode(VOICE_INPUT_MODES.includes(normalizedStoredMode) ? normalizedStoredMode : "broadcast");
    } catch {
      setNoiseSuppressionMode("transparent");
    }
  }, [noiseSuppressionStorageKey, user]);

  useEffect(() => {
    if (!user) return;

    try {
      localStorage.setItem(noiseSuppressionStorageKey, noiseSuppressionMode);
    } catch {
      // ignore storage failures
    }
  }, [noiseSuppressionMode, noiseSuppressionStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setEchoCancellationEnabled(true);
      return;
    }

    try {
      setEchoCancellationEnabled(localStorage.getItem(echoCancellationStorageKey) !== "false");
    } catch {
      setEchoCancellationEnabled(true);
    }
  }, [echoCancellationStorageKey, user]);

  useEffect(() => {
    if (!user) return;

    try {
      localStorage.setItem(echoCancellationStorageKey, echoCancellationEnabled ? "true" : "false");
    } catch {
      // ignore storage failures
    }
  }, [echoCancellationEnabled, echoCancellationStorageKey, user]);

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
      setNotificationSoundEnabled(true);
      return;
    }

    try {
      const storedSetting = localStorage.getItem(notificationSoundEnabledStorageKey);
      setNotificationSoundEnabled(storedSetting !== "false");
    } catch {
      setNotificationSoundEnabled(true);
    }
  }, [notificationSoundEnabledStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setDirectMessageSoundEnabled(true);
      return;
    }

    try {
      const storedSetting = localStorage.getItem(directMessageSoundEnabledStorageKey);
      setDirectMessageSoundEnabled(storedSetting !== "false");
    } catch {
      setDirectMessageSoundEnabled(true);
    }
  }, [directMessageSoundEnabledStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setDirectMessageSendSoundId(getDirectMessageSoundOptions("send")[0]?.id || "classic");
      return;
    }

    try {
      const storedSoundId = localStorage.getItem(directMessageSendSoundStorageKey);
      setDirectMessageSendSoundId(
        getDirectMessageSoundOptions("send").some((option) => option.id === storedSoundId)
          ? storedSoundId
          : getDirectMessageSoundOptions("send")[0]?.id || "classic"
      );
    } catch {
      setDirectMessageSendSoundId(getDirectMessageSoundOptions("send")[0]?.id || "classic");
    }
  }, [directMessageSendSoundStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setDirectMessageReceiveSoundId(getDirectMessageSoundOptions("receive")[0]?.id || "classic");
      return;
    }

    try {
      const storedSoundId = localStorage.getItem(directMessageReceiveSoundStorageKey);
      setDirectMessageReceiveSoundId(
        getDirectMessageSoundOptions("receive").some((option) => option.id === storedSoundId)
          ? storedSoundId
          : getDirectMessageSoundOptions("receive")[0]?.id || "classic"
      );
    } catch {
      setDirectMessageReceiveSoundId(getDirectMessageSoundOptions("receive")[0]?.id || "classic");
    }
  }, [directMessageReceiveSoundStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setNotificationSoundId(NOTIFICATION_SOUND_OPTIONS[0].id);
      return;
    }

    try {
      const storedSoundId = localStorage.getItem(notificationSoundStorageKey);
      setNotificationSoundId(
        storedSoundId === "custom" || NOTIFICATION_SOUND_OPTIONS.some((option) => option.id === storedSoundId)
          ? storedSoundId
          : NOTIFICATION_SOUND_OPTIONS[0].id
      );
    } catch {
      setNotificationSoundId(NOTIFICATION_SOUND_OPTIONS[0].id);
    }
  }, [notificationSoundStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setCustomNotificationSoundData("");
      return;
    }

    try {
      setCustomNotificationSoundData(localStorage.getItem(notificationSoundCustomDataStorageKey) || "");
    } catch {
      setCustomNotificationSoundData("");
    }
  }, [notificationSoundCustomDataStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setCustomNotificationSoundName("");
      return;
    }

    try {
      setCustomNotificationSoundName(localStorage.getItem(notificationSoundCustomNameStorageKey) || "");
    } catch {
      setCustomNotificationSoundName("");
    }
  }, [notificationSoundCustomNameStorageKey, user]);

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
      localStorage.setItem(serverNotificationsStorageKey, String(serverNotificationsEnabled));
    } catch {
      // ignore storage failures
    }
  }, [serverNotificationsEnabled, serverNotificationsStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(notificationSoundEnabledStorageKey, String(notificationSoundEnabled));
    } catch {
      // ignore storage failures
    }
  }, [notificationSoundEnabled, notificationSoundEnabledStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(directMessageSoundEnabledStorageKey, String(directMessageSoundEnabled));
    } catch {
      // ignore storage failures
    }
  }, [directMessageSoundEnabled, directMessageSoundEnabledStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(directMessageSendSoundStorageKey, directMessageSendSoundId);
    } catch {
      // ignore storage failures
    }
  }, [directMessageSendSoundId, directMessageSendSoundStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(directMessageReceiveSoundStorageKey, directMessageReceiveSoundId);
    } catch {
      // ignore storage failures
    }
  }, [directMessageReceiveSoundId, directMessageReceiveSoundStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      localStorage.setItem(notificationSoundStorageKey, notificationSoundId);
    } catch {
      // ignore storage failures
    }
  }, [notificationSoundId, notificationSoundStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      if (customNotificationSoundData) {
        localStorage.setItem(notificationSoundCustomDataStorageKey, customNotificationSoundData);
      } else {
        localStorage.removeItem(notificationSoundCustomDataStorageKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [customNotificationSoundData, notificationSoundCustomDataStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      if (customNotificationSoundName) {
        localStorage.setItem(notificationSoundCustomNameStorageKey, customNotificationSoundName);
      } else {
        localStorage.removeItem(notificationSoundCustomNameStorageKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [customNotificationSoundName, notificationSoundCustomNameStorageKey, user]);

  useEffect(() => {
    if (notificationSoundId === "custom" && !customNotificationSoundData && !user) {
      setNotificationSoundId(NOTIFICATION_SOUND_OPTIONS[0].id);
    }
  }, [customNotificationSoundData, notificationSoundId, user]);

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

    setDirectMessageToasts([]);
    directToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    directToastTimeoutsRef.current.clear();
  }, [directNotificationsEnabled]);

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
    if (workspaceMode !== "servers" || !activeServerId || !currentTextChannelId || activeDirectFriendId) {
      return;
    }

    clearServerUnread(getScopedChatChannelId(activeServerId, currentTextChannelId));
  }, [activeDirectFriendId, activeServerId, currentTextChannelId, workspaceMode]);

  useEffect(() => {
    if (!user) {
      setAudioInputDevices([]);
      setAudioOutputDevices([]);
      setSelectedInputDeviceId("");
      setSelectedOutputDeviceId("");
      setOutputSelectionSupported(false);
      setMicLevel(0);
      setCameraDevices([]);
      setSelectedVideoDeviceId("");
      setCameraError("");
      setHasCameraPreview(false);
      appliedInputDeviceRef.current = "";
      appliedOutputDeviceRef.current = "";
      return;
    }

    try {
      setSelectedInputDeviceId(localStorage.getItem(audioInputDeviceStorageKey) || "");
    } catch {
      setSelectedInputDeviceId("");
    }

    try {
      setSelectedOutputDeviceId(localStorage.getItem(audioOutputDeviceStorageKey) || "");
    } catch {
      setSelectedOutputDeviceId("");
    }
  }, [audioInputDeviceStorageKey, audioOutputDeviceStorageKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      if (selectedInputDeviceId) {
        localStorage.setItem(audioInputDeviceStorageKey, selectedInputDeviceId);
      } else {
        localStorage.removeItem(audioInputDeviceStorageKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [audioInputDeviceStorageKey, selectedInputDeviceId, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      if (selectedOutputDeviceId) {
        localStorage.setItem(audioOutputDeviceStorageKey, selectedOutputDeviceId);
      } else {
        localStorage.removeItem(audioOutputDeviceStorageKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [audioOutputDeviceStorageKey, selectedOutputDeviceId, user]);

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
      directConversationTargets
        .map((friend) => friend.directChannelId || buildDirectMessageChannelId(currentUserId, friend.id))
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
  }, [chatSyncTick, currentUserId, directConversationTargets, user]);

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
        channelId,
        friend,
        preview,
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
    if (!activeServer?.id || !activeServer?.isShared || isDefaultServer || !currentUserId || !canManageServer) return;

    const timeoutId = window.setTimeout(() => {
      syncServerSnapshot(activeServer);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [activeServer, canManageServer, currentUserId, isDefaultServer]);
  useEffect(() => {
    setProfileDraft({
      firstName: user?.first_name || user?.firstName || "",
      lastName: user?.last_name || user?.lastName || "",
      email: user?.email || "",
      profileBackgroundUrl: getUserProfileBackground(user),
      profileBackgroundFrame: getUserProfileBackgroundFrame(user),
    });
  }, [
    user?.email,
    user?.first_name,
    user?.firstName,
    user?.last_name,
    user?.lastName,
    user?.profileBackgroundUrl,
    user?.profile_background_url,
    user?.profileBackground,
    user?.profileBackgroundFrame,
    user?.profile_background_frame,
  ]);
  useEffect(() => {
    if (!activeServer?.id || !activeServer?.isShared || isDefaultServer || workspaceMode !== "servers") return;

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
  }, [activeServer?.id, activeServer?.isShared, isDefaultServer, workspaceMode]);
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
      setCurrentTextChannelId(activeServer.textChannels[0].id);
    }
  }, [activeServer, currentTextChannelId]);
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
      const insideServerPanel = serverMembersRef.current?.contains(target);
      const insideMemberMenu = memberRoleMenuRef.current?.contains(target);
      const insideServerContextMenu = serverContextMenuRef.current?.contains(target);
      const insideNoiseMenu = noiseMenuRef.current?.contains(target);
      const insideMicMenu = micMenuRef.current?.contains(target);
      const insideSoundMenu = soundMenuRef.current?.contains(target);

      if (popupRef.current && !insidePopup) setOpenSettings(false);
      if (serverMembersRef.current && !insideServerPanel && !insideMemberMenu) setShowServerMembersPanel(false);
      if (!insideMemberMenu) setMemberRoleMenu(null);
      if (!insideServerContextMenu) setServerContextMenu(null);
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
    let disposed = false;
    const measurePing = async () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const startedAt = performance.now();
      try {
        await fetch(`${API_URL}/api/ping`, { method: "GET", cache: "no-store" });
        if (!disposed) setPingMs(Math.max(1, Math.round(performance.now() - startedAt)));
      } catch {
        if (!disposed) setPingMs(null);
      }
    };
    measurePing();
    const intervalId = window.setInterval(measurePing, 15000);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    const client = createVoiceRoomClient({
      onParticipantsMapChanged: setParticipantsMap,
      onChannelChanged: (nextChannel) => {
        if (!nextChannel && voiceJoinInFlightRef.current && pendingVoiceChannelTargetRef.current) {
          return;
        }

        setCurrentVoiceChannel(nextChannel);
        setJoiningVoiceChannelId((previous) => (String(previous || "") === String(nextChannel || "") ? "" : previous));
      },
      onRemoteScreenStreamsChanged: setRemoteScreenShares,
      onLocalScreenShareChanged: setIsSharingScreen,
      onLocalLiveShareChanged: ({ mode }) => setLocalLiveShareMode(mode || ""),
      onLocalPreviewStreamChanged: ({ stream, mode }) => {
        setLocalSharePreview({
          stream: stream || null,
          mode: mode || "",
        });
      },
      onLiveUsersChanged: setAnnouncedLiveUserIds,
      onSpeakingUsersChanged: setSpeakingUserIds,
      onRoomParticipantsChanged: ({ channel, participants }) => {
        setRoomVoiceParticipants({
          channel: channel || "",
          participants: Array.isArray(participants) ? participants : [],
        });
      },
      onSelfVoiceStateChanged: ({
        isMicMuted: nextMicMuted,
        isDeafened: nextIsDeafened,
        isMicForced: nextIsMicForced,
        isDeafenedForced: nextIsSoundForced,
      }) => {
        setIsMicMuted(Boolean(nextMicMuted) && !nextIsDeafened);
        setIsSoundMuted(Boolean(nextIsDeafened));
        setIsMicForced(Boolean(nextIsMicForced));
        setIsSoundForced(Boolean(nextIsSoundForced));
      },
      onMicLevelChanged: setMicLevel,
      onAudioDevicesChanged: ({
        inputs,
        outputs,
        selectedInputDeviceId: nextInputDeviceId,
        selectedOutputDeviceId: nextOutputDeviceId,
        outputSelectionSupported: nextOutputSelectionSupported,
      }) => {
        setAudioInputDevices(Array.isArray(inputs) ? inputs : []);
        setAudioOutputDevices(Array.isArray(outputs) ? outputs : []);
        setSelectedInputDeviceId(nextInputDeviceId || "");
        setSelectedOutputDeviceId(nextOutputDeviceId || "");
        setOutputSelectionSupported(Boolean(nextOutputSelectionSupported));
      },
    });
    voiceClientRef.current = client;
    if (selectedInputDeviceId) {
      appliedInputDeviceRef.current = selectedInputDeviceId;
      client.setInputDevice(selectedInputDeviceId).catch((error) => {
        console.error("Ошибка применения устройства ввода:", error);
      });
    }
    if (selectedOutputDeviceId) {
      appliedOutputDeviceRef.current = selectedOutputDeviceId;
      client.setOutputDevice(selectedOutputDeviceId).catch((error) => {
        console.error("Ошибка применения устройства вывода:", error);
      });
    }
    client.setNoiseSuppressionMode(noiseSuppressionMode).catch((error) => {
      console.error("Ошибка применения стартового режима шумоподавления:", error);
    });
    client.setEchoCancellationEnabled(echoCancellationEnabled).catch((error) => {
      console.error("Ошибка применения стартового эхоподавления:", error);
    });
    client.connect(user).catch((error) => logVoiceHubError("Ошибка подключения к голосовому хабу:", error));
    return () => {
      client.disconnect().catch((error) => logVoiceHubError("Ошибка отключения от голосового хаба:", error));
      if (voiceClientRef.current === client) voiceClientRef.current = null;
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user?.id || !voiceClientRef.current) return;
    voiceClientRef.current.connect(user).catch((error) => logVoiceHubError("Ошибка обновления пользователя в голосовом хабе:", error));
  }, [user?.id, user?.firstName, user?.first_name, user?.avatarUrl, user?.avatar]);
  useEffect(() => {
    const effectiveMicVolume = currentVoiceChannel ? (isMicMuted || isSoundMuted ? 0 : micVolume) : micVolume;
    voiceClientRef.current?.setMicrophoneVolume(effectiveMicVolume);
  }, [currentVoiceChannel, micVolume, isMicMuted, isSoundMuted]);
  useEffect(() => {
    voiceClientRef.current?.updateSelfVoiceState({ isMicMuted: isMicMuted || isSoundMuted, isDeafened: isSoundMuted }).catch((error) => {
      console.error("Ошибка обновления состояния микрофона:", error);
    });
  }, [isMicMuted, isSoundMuted]);
  useEffect(() => {
    voiceClientRef.current?.setRemoteVolume(isSoundMuted ? 0 : audioVolume);
  }, [audioVolume, isSoundMuted]);
  useEffect(() => {
    if (!voiceClientRef.current) return;

    voiceClientRef.current.setNoiseSuppressionMode(noiseSuppressionMode).catch((error) => {
      console.error("Ошибка переключения режима шумоподавления:", error);
    });
  }, [noiseSuppressionMode]);
  useEffect(() => {
    if (!voiceClientRef.current) return;

    voiceClientRef.current.setEchoCancellationEnabled(echoCancellationEnabled).catch((error) => {
      console.error("Ошибка переключения эхоподавления:", error);
    });
  }, [echoCancellationEnabled]);
  useEffect(() => {
    if (!voiceClientRef.current || !selectedInputDeviceId) {
      return;
    }

    if (appliedInputDeviceRef.current === selectedInputDeviceId) {
      return;
    }

    appliedInputDeviceRef.current = selectedInputDeviceId;
    voiceClientRef.current.setInputDevice(selectedInputDeviceId).catch((error) => {
      console.error("Ошибка переключения устройства ввода:", error);
    });
  }, [selectedInputDeviceId]);
  useEffect(() => {
    if (!voiceClientRef.current || !selectedOutputDeviceId) {
      return;
    }

    if (appliedOutputDeviceRef.current === selectedOutputDeviceId) {
      return;
    }

    appliedOutputDeviceRef.current = selectedOutputDeviceId;
    voiceClientRef.current.setOutputDevice(selectedOutputDeviceId).catch((error) => {
      console.error("Ошибка переключения устройства вывода:", error);
    });
  }, [selectedOutputDeviceId]);
  useEffect(() => {
    if (!voiceClientRef.current || !user?.id) {
      return;
    }

    const shouldPreviewMicrophone = showMicMenu || isMicTestActive;
    const shouldLoadAudioDevices = shouldPreviewMicrophone || showSoundMenu || (openSettings && settingsTab === "voice_video");

    if (!shouldLoadAudioDevices) {
      voiceClientRef.current.releaseMicrophonePreview().catch((error) => {
        console.error("Ошибка остановки предпросмотра микрофона:", error);
      });
      return;
    }

    if (shouldPreviewMicrophone) {
      voiceClientRef.current.ensureMicrophonePreview().catch((error) => {
        console.error("Ошибка запуска предпросмотра микрофона:", error);
      });
      return;
    }

    voiceClientRef.current.releaseMicrophonePreview().catch((error) => {
      console.error("Ошибка остановки предпросмотра микрофона:", error);
    });
    voiceClientRef.current.getAudioDevices().catch((error) => {
      console.error("Ошибка обновления списка аудио-устройств:", error);
    });
  }, [isMicTestActive, openSettings, settingsTab, showMicMenu, showSoundMenu, user?.id]);
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
    if (!previousChannel && currentVoiceChannel) {
      playUiTone("join");
    } else if (previousChannel && !currentVoiceChannel) {
      playUiTone("leave");
    }
    previousVoiceChannelRef.current = currentVoiceChannel;
  }, [currentVoiceChannel]);
  useEffect(() => {
    if (!previousScreenShareRef.current && isSharingScreen) {
      playUiTone("share");
    }
    previousScreenShareRef.current = isSharingScreen;
  }, [isSharingScreen]);

  const replaceServerSnapshot = (snapshot, { activate = false } = {}) => {
    if (!snapshot) return;

    const normalizedServer = normalizeServers([{ ...snapshot, isShared: true }], user)[0];
    if (!normalizedServer) return;
    setServers((previous) => {
      const existingIndex = previous.findIndex((server) => server.id === normalizedServer.id);
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

    if (activate) {
      setWorkspaceMode("servers");
      setActiveServerId(normalizedServer.id);
      setCurrentTextChannelId(normalizedServer.textChannels?.[0]?.id || "");
    }
  };
  const updateServer = (updater) => setServers((previous) => previous.map((server) => (server.id === activeServerId ? updater(server) : server)));
  const syncServerSnapshot = async (serverSnapshot) => {
    if (!serverSnapshot || !currentUserId || !hasServerPermission(serverSnapshot, currentUserId, "manage_server")) {
      return null;
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
        replaceServerSnapshot(data);
        return data;
      }
    } catch (error) {
      console.error("Ошибка синхронизации сервера:", error);
    }

    return null;
  };
  const refreshServerSnapshot = async (serverId) => {
    if (!serverId) return;

    try {
      const response = await authFetch(`${API_BASE_URL}/server-invites/server/${serverId}`, {
        method: "GET",
        cache: "no-store",
      });

      const snapshot = await parseApiResponse(response);
      if (!response.ok || !snapshot) {
        return;
      }

      replaceServerSnapshot(snapshot);
    } catch (error) {
      console.error("Ошибка обновления сервера:", error);
    }
  };
  const openSettingsPanel = (tab = "voice_video") => {
    setSettingsTab(tab);
    setOpenSettings(true);
    setShowServerMembersPanel(false);
    setShowMicMenu(false);
    setShowSoundMenu(false);
  };
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
  const startChannelRename = (type, channel) => {
    if (!canManageChannels || !channel?.id) return;

    setChannelRenameState({
      type,
      channelId: channel.id,
      value: channel.name || "",
    });
  };
  const cancelChannelRename = () => setChannelRenameState(null);
  const updateChannelRenameValue = (value) => {
    setChannelRenameState((previous) => (previous ? { ...previous, value } : previous));
  };
  const submitChannelRename = () => {
    if (!channelRenameState?.channelId) return;

    const nextName = channelRenameState.value.trim();
    if (!nextName) {
      cancelChannelRename();
      return;
    }

    if (channelRenameState.type === "voice") {
      updateVoiceChannelName(channelRenameState.channelId, nextName);
    } else {
      updateTextChannelName(channelRenameState.channelId, nextName);
    }

    cancelChannelRename();
  };
  const handleAddServer = () => {
    openCreateServerModal();
  };
  const handleCreateServerIconChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const validationError = await validateServerIconFile(file);
      if (validationError) {
        setCreateServerError(validationError);
        return;
      }
    } catch (error) {
      console.error("Ошибка подготовки иконки сервера:", error);
      setCreateServerError(error?.message || "Не удалось загрузить иконку сервера.");
      return;
    }

    openMediaFrameEditor({
      kind: "createServerIcon",
      target: "serverIcon",
      file,
      initialFrame: createServerIconFrame,
      title: "Иконка сервера",
    });
  };
  const handleCreateServerSubmit = (event) => {
    event?.preventDefault?.();
    const nextName = createServerName.trim();
    if (!nextName) {
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
    setActiveDirectFriendId("");
    setShowCreateServerModal(false);
    setCreateServerName("");
    setCreateServerIcon("");
    setCreateServerIconFrame(getDefaultMediaFrame());
    setCreateServerError("");
  };
  const handleDeleteServer = async (serverId) => {
    if (!canManageServer) return;
    const serverToDelete = servers.find((server) => server.id === serverId);
    if (!serverToDelete) return;

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
    const nextServers = servers.filter((server) => server.id !== serverId);
    const nextActiveId = activeServerId === serverId ? nextServers[0]?.id || "" : activeServerId;
    const nextActiveServer = nextServers.find((server) => server.id === nextActiveId) || nextServers[0] || null;
    setServers(nextServers);
    setActiveServerId(nextActiveId);
    setCurrentTextChannelId(nextActiveServer?.textChannels?.[0]?.id || "");
    setSelectedStreamUserId(null);
    setProfileStatus("Сервер удалён.");
  };
  const handleDeleteTextChannel = (channelId) => {
    if (!canManageChannels) return;
    if (!activeServer) return;
    const nextChannels = activeServer.textChannels.filter((channel) => channel.id !== channelId);
    updateServer((server) => ({ ...server, textChannels: nextChannels }));
    if (currentTextChannelId === channelId) setCurrentTextChannelId(nextChannels[0]?.id || "");
  };
  const handleDeleteVoiceChannel = async (channelId) => {
    if (!canManageChannels) return;
    if (!activeServer) return;
    if (currentVoiceChannel === getScopedVoiceChannelId(activeServer.id, channelId)) await leaveVoiceChannel();
    updateServer((server) => ({ ...server, voiceChannels: server.voiceChannels.filter((channel) => channel.id !== channelId) }));
  };
  const addTextChannel = () => {
    if (!canManageChannels || !activeServer) return;
    const channel = { id: createId("text"), name: "новый-канал" };
    updateServer((server) => ({ ...server, textChannels: [...server.textChannels, channel] }));
    setCurrentTextChannelId(channel.id);
    setChannelRenameState({
      type: "text",
      channelId: channel.id,
      value: channel.name,
    });
  };
  const addVoiceChannel = () => {
    if (!canManageChannels || !activeServer) return;
    const channel = { id: createId("voice"), name: "голосовой-канал" };
    updateServer((server) => ({ ...server, voiceChannels: [...server.voiceChannels, channel] }));
    setChannelRenameState({
      type: "voice",
      channelId: channel.id,
      value: channel.name,
    });
  };
  const updateActiveServerName = (value) => {
    if (!canManageServer) return;
    updateServer((server) => ({ ...server, name: value }));
  };
  const updateActiveServerDescription = (value) => {
    if (!canManageServer) return;
    updateServer((server) => ({ ...server, description: String(value || "").slice(0, 280) }));
  };
  const revokeMediaEditorPreviewUrl = (editorState) => {
    const previewUrl = String(editorState?.previewUrl || "");
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
  };
  const closeMediaFrameEditor = () => {
    revokeMediaEditorPreviewUrl(mediaFrameEditorState);
    setMediaFrameEditorState(null);
  };
  const openMediaFrameEditor = ({ kind, target, file, initialFrame, title }) => {
    const previewUrl = URL.createObjectURL(file);
    revokeMediaEditorPreviewUrl(mediaFrameEditorState);
    setMediaFrameEditorState({
      kind,
      target,
      title: title || "",
      file,
      previewUrl,
      frame: normalizeMediaFrame(initialFrame),
      activeServerId: activeServer?.id || "",
    });
  };
  const uploadAvatarWithFrame = async (file, frame) => {
    const formData = new FormData();
    formData.append("avatar", file);
    formData.append("frame", JSON.stringify(serializeMediaFrame(frame)));
    const response = await authFetch(`${API_URL}/api/user/upload-avatar`, { method: "POST", body: formData });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить аватар."));
    }

    const nextAvatarUrl = data?.avatarUrl || data?.avatar_url || "";
    const nextAvatarFrame = parseMediaFrame(data?.avatar_frame, data?.avatarFrame, frame);
    const nextUser = {
      ...user,
      avatarUrl: nextAvatarUrl,
      avatar: nextAvatarUrl,
      avatarFrame: nextAvatarFrame,
      avatar_frame: nextAvatarFrame,
    };
    setUser?.(nextUser);
    await storeSession(nextUser, {
      accessToken: getStoredToken(),
      refreshToken: getStoredRefreshToken(),
      accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
    });
    setProfileStatus("Аватар сохранён.");
  };
  const uploadProfileBackgroundWithFrame = async (file, frame) => {
    const formData = new FormData();
    formData.append("background", file);
    formData.append("frame", JSON.stringify(serializeMediaFrame(frame)));

    const response = await authFetch(`${API_URL}/api/user/upload-profile-background`, { method: "POST", body: formData });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить фон профиля."));
    }

    const nextProfileBackgroundUrl = data?.profileBackgroundUrl || data?.profile_background_url || "";
    const nextProfileBackgroundFrame = parseMediaFrame(
      data?.profile_background_frame,
      data?.profileBackgroundFrame,
      frame
    );
    const nextUser = {
      ...user,
      profileBackgroundUrl: nextProfileBackgroundUrl,
      profile_background_url: nextProfileBackgroundUrl,
      profileBackground: nextProfileBackgroundUrl,
      profileBackgroundFrame: nextProfileBackgroundFrame,
      profile_background_frame: nextProfileBackgroundFrame,
    };
    setUser?.(nextUser);
    setProfileDraft((previous) => ({
      ...previous,
      profileBackgroundUrl: nextProfileBackgroundUrl,
      profileBackgroundFrame: nextProfileBackgroundFrame,
    }));
    await storeSession(nextUser, {
      accessToken: getStoredToken(),
      refreshToken: getStoredRefreshToken(),
      accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
    });
    setProfileStatus("Фон профиля сохранён.");
  };
  const uploadServerIconWithFrame = async (file, frame, { createDraft = false } = {}) => {
    const formData = new FormData();
    formData.append("icon", file);
    const response = await authFetch(`${API_BASE_URL}/server-assets/upload-icon`, {
      method: "POST",
      body: formData,
    });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить иконку сервера."));
    }

    const nextIconUrl = data?.iconUrl || data?.icon_url || "";
    const nextIconFrame = normalizeMediaFrame(frame);
    if (createDraft) {
      setCreateServerIcon(nextIconUrl);
      setCreateServerIconFrame(nextIconFrame);
      setCreateServerError("");
      return;
    }

    updateServer((server) => ({ ...server, icon: nextIconUrl, iconFrame: nextIconFrame }));
    setProfileStatus("Иконка сервера сохранена.");
  };
  const handleMediaFrameConfirm = async (frame) => {
    const editorState = mediaFrameEditorState;
    if (!editorState?.file) {
      closeMediaFrameEditor();
      return;
    }

    try {
      if (editorState.kind === "avatar") {
        await uploadAvatarWithFrame(editorState.file, frame);
      } else if (editorState.kind === "profileBackground") {
        await uploadProfileBackgroundWithFrame(editorState.file, frame);
      } else if (editorState.kind === "serverIcon") {
        await uploadServerIconWithFrame(editorState.file, frame);
      } else if (editorState.kind === "createServerIcon") {
        await uploadServerIconWithFrame(editorState.file, frame, { createDraft: true });
      }
    } catch (error) {
      if (editorState.kind === "createServerIcon") {
        setCreateServerError(error?.message || "Не удалось загрузить иконку сервера.");
      } else {
        setProfileStatus(error?.message || "Не удалось сохранить медиа.");
      }
      console.error("Ошибка сохранения медиа с кадрированием:", error);
    } finally {
      revokeMediaEditorPreviewUrl(editorState);
      setMediaFrameEditorState(null);
    }
  };
  const updateTextChannelName = (channelId, value) => {
    if (!canManageChannels) return;
    updateServer((server) => ({
      ...server,
      textChannels: server.textChannels.map((channel) =>
        channel.id === channelId ? { ...channel, name: normalizeTextChannelName(value) } : channel
      ),
    }));
  };
  const updateVoiceChannelName = (channelId, value) => {
    if (!canManageChannels) return;
    updateServer((server) => ({ ...server, voiceChannels: server.voiceChannels.map((channel) => channel.id === channelId ? { ...channel, name: value } : channel) }));
  };
  const updateMicVolume = (value) => {
    setMicVolume(value);
    const effectiveMicVolume = currentVoiceChannel ? (isMicMuted || isSoundMuted ? 0 : value) : value;
    voiceClientRef.current?.setMicrophoneVolume(effectiveMicVolume);
  };
  const updateAudioVolume = (value) => {
    setAudioVolume(value);
    voiceClientRef.current?.setRemoteVolume(isSoundMuted ? 0 : value);
  };
  const handleInputDeviceChange = (deviceId) => {
    setSelectedInputDeviceId(deviceId || "");
  };
  const handleOutputDeviceChange = (deviceId) => {
    setSelectedOutputDeviceId(deviceId || "");
  };
  const handleNoiseSuppressionModeChange = (mode) => {
    setNoiseSuppressionMode(VOICE_INPUT_MODES.includes(mode) ? mode : "broadcast");
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
  const joinVoiceChannel = async (channel) => {
    if (!voiceClientRef.current || !user?.id || !channel?.id || !activeServer?.id) return;
    const scopedChannelId = getScopedVoiceChannelId(activeServer.id, channel.id);
    if (voiceJoinInFlightRef.current && pendingVoiceChannelTargetRef.current === scopedChannelId) {
      return;
    }

    const joinAttemptId = voiceJoinAttemptRef.current + 1;
    voiceJoinAttemptRef.current = joinAttemptId;
    voiceJoinInFlightRef.current = true;
    pendingVoiceChannelTargetRef.current = scopedChannelId;
    setJoiningVoiceChannelId(scopedChannelId);
    setCurrentVoiceChannel(scopedChannelId);
    try {
      if (isMobileViewport) {
        setMobileSection("servers");
        setMobileServersPane("voice");
      }

      await voiceClientRef.current.joinChannel(scopedChannelId, user);
    } catch (error) {
      if (voiceJoinAttemptRef.current === joinAttemptId) {
        const errorName = String(error?.name || "").trim();
        const isMicrophoneStartError = errorName === "NotReadableError" || errorName === "TrackStartError";
        if (isMicrophoneStartError) {
          const message = error?.message || "Микрофон не удалось запустить. Закройте приложения, которые могут использовать микрофон, или выберите другой вход в настройках голоса.";
          showServerInviteFeedback(message);
          console.error("Ошибка входа в голосовой канал:", error);
          setCurrentVoiceChannel(null);
          setJoiningVoiceChannelId("");
          return;
        }

        try {
          await voiceClientRef.current.leaveChannel();
        } catch {
          // ignore retry cleanup failures
        }

        try {
          await voiceClientRef.current.joinChannel(scopedChannelId, user);
          return;
        } catch (retryError) {
          const message = retryError?.message || error?.message || "Не удалось подключиться к голосовому каналу.";
          showServerInviteFeedback(message);
          console.error("Ошибка входа в голосовой канал:", retryError);
          setCurrentVoiceChannel(null);
          setJoiningVoiceChannelId("");
        }
      }
    } finally {
      if (voiceJoinAttemptRef.current === joinAttemptId) {
        voiceJoinInFlightRef.current = false;
        pendingVoiceChannelTargetRef.current = "";
        setJoiningVoiceChannelId("");
      }
    }
  };
  const leaveVoiceChannel = async () => {
    if (!voiceClientRef.current) return;
    try {
      voiceJoinInFlightRef.current = false;
      pendingVoiceChannelTargetRef.current = "";
      setJoiningVoiceChannelId("");
      await voiceClientRef.current.leaveChannel();
      if (isMobileViewport) {
        setMobileServersPane("channels");
      }
    } catch (error) {
      console.error("Ошибка выхода из голосового канала:", error);
    }
  };
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
  const startScreenShare = async () => {
    if (!voiceClientRef.current) {
      return;
    }

    setScreenShareError("");

    try {
      await voiceClientRef.current.startScreenShare({ resolution, fps, shareAudio: shareStreamAudio });
      setShowModal(false);
      setSelectedStreamUserId(null);
      setIsLocalSharePreviewVisible(true);
    } catch (error) {
      const message = error?.message || "Не удалось запустить трансляцию экрана.";
      setScreenShareError(message);
      showServerInviteFeedback(message);
      throw error;
    }
  };
  const stopScreenShare = async () => {
    if (!voiceClientRef.current) {
      return;
    }

    setScreenShareError("");

    try {
      await voiceClientRef.current.stopScreenShare();
      setShowModal(false);
      setIsLocalSharePreviewVisible(false);
    } catch (error) {
      const message = error?.message || "Не удалось остановить трансляцию экрана.";
      setScreenShareError(message);
      showServerInviteFeedback(message);
      throw error;
    }
  };
  const handleScreenShareAction = async () => {
    if (isScreenShareActive) {
      await stopScreenShare();
      return;
    }

    if (!currentVoiceChannel) {
      showServerInviteFeedback("Сначала подключитесь к голосовому каналу.");
      return;
    }

    if (!isScreenShareSupported) {
      setScreenShareError(displayCaptureSupportInfo.subtitle);
      showServerInviteFeedback(displayCaptureSupportInfo.subtitle);
      return;
    }

    setShowCameraModal(false);
    setScreenShareError("");
    setShowModal(true);
  };
  const openLocalSharePreview = () => {
    if (!hasLocalSharePreview) {
      showServerInviteFeedback("Сначала запустите камеру или стрим.");
      return;
    }

    setSelectedStreamUserId(null);
    setIsLocalSharePreviewVisible(true);
  };
  const closeLocalSharePreview = () => {
    setIsLocalSharePreviewVisible(false);
  };
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
  const startCameraShare = async () => {
    if (!voiceClientRef.current) return;

    setCameraError("");
    stopCameraPreview();

    try {
      await voiceClientRef.current.startCameraShare({
        deviceId: selectedVideoDeviceId,
        resolution,
        fps,
      });
      setShowCameraModal(false);
      setSelectedStreamUserId(null);
      setIsLocalSharePreviewVisible(true);
    } catch (error) {
      setCameraError(error?.message || "Не удалось запустить трансляцию камеры.");
      startCameraPreview(selectedVideoDeviceId).catch(() => {});
    }
  };
  const stopCameraShare = async () => {
    if (!voiceClientRef.current) return;

    setCameraError("");
    try {
      await voiceClientRef.current.stopScreenShare();
      setShowCameraModal(false);
      setIsLocalSharePreviewVisible(false);
      stopCameraPreview();
    } catch (error) {
      setCameraError(error?.message || "Не удалось остановить трансляцию камеры.");
    }
  };
  const stopCameraPreview = () => {
    cameraStreamRef.current?.getTracks?.().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore camera shutdown failures
      }
    });
    cameraStreamRef.current = null;

    if (cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = null;
    }

    setHasCameraPreview(false);
  };
  const loadCameraDevices = async (preferredDeviceId = "") => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraDevices([]);
      return [];
    }

    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        id: device.deviceId || `camera-${index + 1}`,
        label: String(device.label || "").trim() || `Камера ${index + 1}`,
      }));

    setCameraDevices(devices);

    const nextDeviceId =
      devices.find((device) => device.id === preferredDeviceId)?.id ||
      devices.find((device) => device.id === selectedVideoDeviceId)?.id ||
      devices[0]?.id ||
      "";

    if (nextDeviceId && nextDeviceId !== selectedVideoDeviceId) {
      setSelectedVideoDeviceId(nextDeviceId);
    }

    return devices;
  };
  const startCameraPreview = async (deviceId = selectedVideoDeviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Эта система не дала приложению доступ к видеоустройствам.");
      return;
    }

    stopCameraPreview();
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId && !String(deviceId).startsWith("camera-")
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
        audio: false,
      });

      cameraStreamRef.current = stream;

      if (cameraPreviewRef.current) {
        cameraPreviewRef.current.srcObject = stream;
        cameraPreviewRef.current.muted = true;
        cameraPreviewRef.current.play().catch(() => {});
      }
      setHasCameraPreview(true);

      const devices = await loadCameraDevices(deviceId);
      const activeTrack = stream.getVideoTracks?.()[0];
      const activeDeviceId = activeTrack?.getSettings?.().deviceId || deviceId || devices[0]?.id || "";

      if (activeDeviceId && activeDeviceId !== selectedVideoDeviceId) {
        setSelectedVideoDeviceId(activeDeviceId);
      }

      if (!devices.length) {
        setCameraError("Камеры не найдены. Подключите веб-камеру или виртуальную камеру вроде Camo.");
        setHasCameraPreview(false);
      }
    } catch (error) {
      await loadCameraDevices(deviceId).catch(() => {});
      setCameraError("Не удалось открыть камеру. Проверьте доступ к ней и выбранное устройство.");
      setHasCameraPreview(false);
      console.error("Ошибка запуска камеры:", error);
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
  const handleWatchStream = (userId) => {
    const normalizedUserId = String(userId);
    setIsLocalSharePreviewVisible(false);
    if (String(selectedStreamUserId || "") === normalizedUserId && selectedStream) {
      setSelectedStreamUserId(null);
      return;
    }
    setSelectedStreamUserId(normalizedUserId);
    if (isMobileViewport) {
      setMobileServersPane("voice");
    }
    voiceClientRef.current?.requestScreenShare(normalizedUserId).catch((error) => console.error("Ошибка запроса просмотра трансляции:", error));
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
  const toggleMicMute = () => {
    setIsMicMuted((previous) => {
      if (previous && (isMicForced || isSoundForced)) {
        return previous;
      }

      return !previous;
    });
  };
  const toggleSoundMute = () => {
    setIsSoundMuted((previous) => {
      if (previous && isSoundForced) {
        return previous;
      }

      return !previous;
    });
  };
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
  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    const avatarValidationError = await validateAvatarFile(file);
    if (avatarValidationError) {
      setProfileStatus(avatarValidationError);
      return;
    }

    openMediaFrameEditor({
      kind: "avatar",
      target: "avatar",
      file,
      initialFrame: getUserAvatarFrame(user),
      title: "Аватар",
    });
  };
  const handleProfileBackgroundChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    const backgroundValidationError = await validateProfileBackgroundFile(file);
    if (backgroundValidationError) {
      setProfileStatus(backgroundValidationError);
      return;
    }

    openMediaFrameEditor({
      kind: "profileBackground",
      target: "profileBackground",
      file,
      initialFrame: profileDraft.profileBackgroundFrame,
      title: "Фон профиля",
    });
  };
  const handleServerIconChange = async (event) => {
    if (!canManageServer) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeServer) return;
    try {
      const validationError = await validateServerIconFile(file);
      if (validationError) {
        setProfileStatus(validationError);
        return;
      }

      openMediaFrameEditor({
        kind: "serverIcon",
        target: "serverIcon",
        file,
        initialFrame: getServerIconFrame(activeServer),
        title: "Иконка сервера",
      });
    } catch (error) {
      console.error("Ошибка смены иконки сервера:", error);
      setProfileStatus(error?.message || "Не удалось загрузить иконку сервера.");
    }
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
    } else {
      setProfileDraft((previous) => ({ ...previous, [field]: value }));
    }

    if (profileStatus) {
      setProfileStatus("");
    }
  };
  const handleProfileSave = async (event) => {
    event?.preventDefault?.();

    const nextFirstName = profileDraft.firstName.trim();
    const nextLastName = profileDraft.lastName.trim();
    if (!nextFirstName) {
      setProfileStatus("Имя не должно быть пустым.");
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

    setProfileStatus("Сохраняем профиль...");

    try {
      const response = await authFetch(`${API_URL}/api/user/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: nextFirstName,
          lastName: nextLastName,
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
  const settingsNavSections = SETTINGS_NAV_ITEMS.reduce((sections, item) => {
    if (!sections[item.section]) {
      sections[item.section] = [];
    }

    sections[item.section].push(item);
    return sections;
  }, {});
  const mobileSettingsNavItems = SETTINGS_NAV_ITEMS.filter(
    (item) => activeServer || (item.id !== "server" && item.id !== "roles")
  );
  const activeSettingsTabMeta =
    mobileSettingsNavItems.find((item) => item.id === settingsTab) ||
    SETTINGS_NAV_ITEMS.find((item) => item.id === settingsTab) ||
    SETTINGS_NAV_ITEMS[0];
  const deviceInputLabel =
    audioInputDevices.find((device) => device.id === selectedInputDeviceId)?.label ||
    audioInputDevices[0]?.label ||
    "Системный микрофон";
  const deviceOutputLabel =
    audioOutputDevices.find((device) => device.id === selectedOutputDeviceId)?.label ||
    audioOutputDevices[0]?.label ||
    "Системный вывод";
  const activeMicMenuBars = getMeterActiveBars(micLevel, 24);
  const activeMicSettingsBars = getMeterActiveBars(micLevel, 48);
  const outputSelectionAvailable = outputSelectionSupported && audioOutputDevices.length > 0;
  const noiseProfileOptions = [
    {
      id: "broadcast",
      title: "Broadcast",
      description: "Оптимальный режим для звонков: мягкий EQ и компрессия голоса.",
    },
    {
      id: "voice_isolation",
      title: "Изоляция голоса",
      description: "Только ваш голос: фон режется сильнее и речь выходит вперед.",
    },
    {
      id: "rnnoise",
      title: "RNNoise",
      description: "Бесплатное подавление фонового шума и клавиатуры на RNNoise, если Electron/Chromium его поддерживает.",
    },
    {
      id: "transparent",
      title: "Студия",
      description: "Чистый естественный звук с минимальной обработкой.",
    },
  ];
  const activeNoiseProfile =
    noiseProfileOptions.find((option) => option.id === noiseSuppressionMode) || noiseProfileOptions[0];
  const pingTone = getPingTone(pingMs);
  const pingTooltip = Number.isFinite(Number(pingMs)) && Number(pingMs) > 0 ? `Пинг: ${pingMs} мс` : "Пинг недоступен";

  const toggleMicrophoneTestPreview = () => {
    setIsMicTestActive((previous) => !previous);
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
    profileBackgroundSrc,
    profileDraft,
    profileStatus,
    user,
    avatarInputRef,
    profileBackgroundInputRef,
    serverIconInputRef,
    handleProfileSave,
    updateProfileDraft,
    handleLogout,
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

  const renderSettingsContent = () => <MenuMainSettingsContent {...settingsContentProps} />;
  const renderMobileSettingsShell = () => (
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
  );
  const profilePanelProps = {
    currentVoiceChannel,
    currentVoiceChannelName,
    pingTone,
    pingTooltip,
    isCurrentUserSpeaking,
    isScreenShareActive,
    isCameraShareActive,
    isMicMuted,
    isSoundMuted,
    showMicMenu,
    showSoundMenu,
    micMenuRef,
    soundMenuRef,
    avatarInputRef,
    serverIconInputRef,
    user,
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
    handleScreenShareAction,
    openCameraModal,
    leaveVoiceChannel,
    handleAvatarChange,
    handleServerIconChange,
    toggleMicMute,
    toggleSoundMute,
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
  };
  const renderProfilePanel = () => <MenuMainProfilePanelSlot {...profilePanelProps} />;
  const renderFriendsSidebar = () => (
    <FriendsSidebar
      query={friendsSidebarQuery}
      navItems={FRIENDS_SIDEBAR_ITEMS}
      filteredFriends={filteredFriends}
      activeDirectFriendId={activeDirectFriendId}
      directUnreadCounts={directUnreadCounts}
      chatDraftPresence={chatDraftPresence}
      currentUserId={currentUserId}
      profilePanel={renderProfilePanel()}
      onQueryChange={setFriendsSidebarQuery}
      onOpenFriendsWorkspace={openFriendsWorkspace}
      onOpenServersWorkspace={openServersWorkspace}
      onResetDirect={() => setActiveDirectFriendId("")}
      onSetFriendsSection={setFriendsPageSection}
      onOpenDirectChat={openDirectChat}
      getDisplayName={getDisplayName}
    />
  );
  const renderServersSidebar = (includeProfilePanel = true) => (
    <ServersSidebar
      includeProfilePanel={includeProfilePanel}
      profilePanel={renderProfilePanel()}
      activeServer={activeServer}
      servers={servers}
      serverMembersRef={serverMembersRef}
      memberRoleMenu={memberRoleMenu}
      memberRoleMenuRef={memberRoleMenuRef}
      serverContextMenu={serverContextMenu}
      serverContextMenuRef={serverContextMenuRef}
      voiceParticipantByUserId={voiceParticipantByUserId}
      currentUserId={currentUserId}
      canManageChannels={canManageChannels}
      channelRenameState={channelRenameState}
      serverUnreadCounts={serverUnreadCounts}
      chatDraftPresence={chatDraftPresence}
      currentTextChannel={currentTextChannel}
      currentVoiceChannel={currentVoiceChannel}
      activeVoiceParticipantsMap={activeVoiceParticipantsMap}
      liveUserIds={liveUserIds}
      speakingUserIds={speakingUserIds}
      watchedStreamUserId={selectedStreamUserId}
      joiningVoiceChannelId={joiningVoiceChannelId}
      icons={{ pencil: PENCIL_ICON_URL, microphone: MICROPHONE_ICON_URL, headphones: HEADPHONES_ICON_URL, settings: SETTINGS_ICON_URL }}
      onOpenServerSettings={() => openSettingsPanel("server")}
      onUpdateMemberNickname={updateMemberNickname}
      onUpdateMemberVoiceState={updateMemberVoiceState}
      onUpdateMemberRole={updateMemberRole}
      onCopyServerInvite={copyServerInviteLink}
      onAddServer={handleAddServer}
      onAddTextChannel={addTextChannel}
      onAddVoiceChannel={addVoiceChannel}
      onSelectTextChannel={selectServerTextChannel}
      onStartChannelRename={startChannelRename}
      onUpdateChannelRenameValue={updateChannelRenameValue}
      onSubmitChannelRename={submitChannelRename}
      onCancelChannelRename={cancelChannelRename}
      onJoinVoiceChannel={joinVoiceChannel}
      onLeaveVoiceChannel={leaveVoiceChannel}
      onWatchStream={handleWatchStream}
      canManageTargetMember={canManageTargetMember}
      canAssignRoleToMember={canAssignRoleToMember}
      canInviteToServer={canInviteToServer}
      getChannelDisplayName={getChannelDisplayName}
      getScopedChatChannelId={getScopedChatChannelId}
    />
  );
  const renderFriendsMain = () => (
    <FriendsMain
      user={user}
      currentDirectFriend={currentDirectFriend}
      currentDirectChannelId={currentDirectChannelId}
      directConversationTargets={directConversationTargets}
      friendsPageSection={friendsPageSection}
      friends={friends}
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
      friendActionStatus={friendActionStatus}
      isAddingFriend={isAddingFriend}
      activeContacts={activeContacts}
      onResetDirect={() => setActiveDirectFriendId("")}
      onSetFriendsSection={setFriendsPageSection}
      onOpenDirectChat={openDirectChat}
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
      onAddFriend={handleAddFriend}
      onOpenServersWorkspace={openServersWorkspace}
      onImportServer={handleImportServer}
      onServerShared={markServerAsShared}
      getDisplayName={getDisplayName}
    />
  );
  const renderServerMain = () => (
    <ServerMain
      activeServer={activeServer}
      currentTextChannel={currentTextChannel}
      currentVoiceChannelName={currentVoiceChannelName}
      currentVoiceParticipants={currentVoiceParticipants}
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
      serverMembers={activeServer?.members || []}
      onOpenLocalSharePreview={openLocalSharePreview}
      onWatchStream={handleWatchStream}
      onChannelSearchChange={setChannelSearchQuery}
      onAddServer={handleAddServer}
      onCloseSelectedStream={() => setSelectedStreamUserId(null)}
      onStopCameraShare={stopCameraShare}
      onStopScreenShare={stopScreenShare}
      onCloseLocalSharePreview={closeLocalSharePreview}
      getChannelDisplayName={getChannelDisplayName}
    />
  );
  const renderDesktopServerRail = () => (
    <DesktopServerRail
      servers={servers}
      workspaceMode={workspaceMode}
      activeServer={activeServer}
      defaultServerIcon={DEFAULT_SERVER_ICON}
      smsIcon={SMS_ICON_URL}
      onOpenFriendsWorkspace={openFriendsWorkspace}
      onServerShortcutClick={handleServerShortcutClick}
      onServerContextMenu={openServerContextMenu}
      onServerPointerDown={handleServerShortcutPointerDown}
      onServerPointerUp={handleServerShortcutPointerUp}
      onServerPointerCancel={handleServerShortcutPointerCancel}
      onAddServer={handleAddServer}
      getServerIconFrame={getServerIconFrame}
    />
  );
  const renderMobileServerStrip = () => (
    <MobileServerStrip
      servers={servers}
      workspaceMode={workspaceMode}
      activeServer={activeServer}
      defaultServerIcon={DEFAULT_SERVER_ICON}
      onServerShortcutClick={handleServerShortcutClick}
      onServerPointerDown={handleServerShortcutPointerDown}
      onServerPointerUp={handleServerShortcutPointerUp}
      onServerPointerCancel={handleServerShortcutPointerCancel}
      onAddServer={handleAddServer}
      getServerIconFrame={getServerIconFrame}
    />
  );
  const renderMobileDirectChat = () => (
    <MobileDirectChat
      currentDirectFriend={currentDirectFriend}
      currentDirectChannelId={currentDirectChannelId}
      user={user}
      directConversationTargets={directConversationTargets}
      getDisplayName={getDisplayName}
    />
  );
  const renderMobileVoiceRoom = () => (
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
        microphone: MICROPHONE_ICON_URL,
        headphones: HEADPHONES_ICON_URL,
        chat: SMS_ICON_URL,
        monitor: MONITOR_ICON_URL,
        camera: CAMERA_ICON_URL,
        phone: PHONE_ICON_URL,
      }}
      onOpenFullscreen={openMobileVoiceStageFullscreen}
      onCloseRemoteStream={() => setSelectedStreamUserId(null)}
      onCloseLocalPreview={closeLocalSharePreview}
      onStopScreenShare={stopScreenShare}
      onStopCameraShare={stopCameraShare}
      onWatchStream={handleWatchStream}
      onInvite={handleInvitePeopleToVoice}
      onToggleMic={toggleMicMute}
      onToggleSound={toggleSoundMute}
      onOpenChat={() => setMobileServersPane("chat")}
      onScreenShareAction={handleScreenShareAction}
      onOpenCamera={openCameraModal}
      onLeave={leaveVoiceChannel}
    />
  );
  const renderMobileProfileScreen = () => (
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
  );
  const renderMobileShell = () => (
    <MenuMainMobileLayout
      mobileSection={mobileSection}
      setMobileSection={setMobileSection}
      workspaceMode={workspaceMode}
      currentDirectFriend={currentDirectFriend}
      setActiveDirectFriendId={setActiveDirectFriendId}
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
      friends={friends}
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
    <div className="menu__main">
      {renderDesktopServerRail()}
      {workspaceMode === "friends" ? renderFriendsSidebar() : renderServersSidebar()}
      {workspaceMode === "friends" ? renderFriendsMain() : renderServerMain()}
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
      setResolution={setResolution}
      setFps={setFps}
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
      mediaFrameEditorState={mediaFrameEditorState}
      closeMediaFrameEditor={closeMediaFrameEditor}
      handleMediaFrameConfirm={handleMediaFrameConfirm}
      directMessageToasts={directMessageToasts}
      openDirectChat={openDirectChat}
      dismissDirectToast={dismissDirectToast}
      serverMessageToasts={serverMessageToasts}
      openServerChannelFromToast={openServerChannelFromToast}
      dismissServerToast={dismissServerToast}
    >
      {mainContent}
    </MenuMainOverlayLayer>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import VoiceChannelList from "./VoiceChannelList";
import TextChat from "./TextChat";
import ScreenShareButton from "./ScreenShareButton";
import ScreenShareViewer from "./ScreenShareViewer";
import ServerInvitesPanel from "./ServerInvitesPanel";
import chatConnection, { startChatConnection } from "../SignalR/ChatConnect";
import "../css/MenuMain.css";
import "../css/MenuProfile.css";
import "../css/ListChannels.css";
import { API_BASE_URL, API_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, isUnauthorizedError, parseApiResponse } from "../utils/auth";
import { createVoiceRoomClient } from "../webrtc/voiceRoomClient";
import { DEFAULT_AVATAR, DEFAULT_SERVER_ICON, readFileAsDataUrl, resolveMediaUrl } from "../utils/media";

const SERVERS_STORAGE_KEY = "nd_servers_v2";
const ACTIVE_SERVER_STORAGE_KEY = "nd_active_server_id";
const NOISE_SUPPRESSION_STORAGE_KEY = "nd_noise_suppression_mode";
const DIRECT_NOTIFICATIONS_STORAGE_KEY = "nd_direct_notifications";
const AUDIO_INPUT_DEVICE_STORAGE_KEY = "nd_audio_input_device";
const AUDIO_OUTPUT_DEVICE_STORAGE_KEY = "nd_audio_output_device";
const VIDEO_INPUT_DEVICE_STORAGE_KEY = "nd_video_input_device";
const DEFAULT_TEXT_CHANNELS = [
  { id: "1", name: "# general" },
  { id: "2", name: "# gaming" },
  { id: "3", name: "# music-chat" },
  { id: "4", name: "# off-topic" },
];
const DEFAULT_VOICE_CHANNELS = [
  { id: "general_voice", name: "general_voice" },
  { id: "gaming", name: "gaming" },
  { id: "music-chat", name: "music-chat" },
];
const STREAM_RESOLUTION_OPTIONS = [
  { value: "720p", label: "HD", description: "1280x720" },
  { value: "1080p", label: "Full HD", description: "1920x1080" },
  { value: "1440p", label: "2K", description: "2560x1440" },
  { value: "2160p", label: "4K", description: "3840x2160" },
];
const STREAM_FPS_OPTIONS = [
  { value: 30, label: "30 FPS" },
  { value: 60, label: "60 FPS" },
  { value: 120, label: "120 FPS" },
];
const DEFAULT_SERVER_ROLES = [
  {
    id: "owner",
    name: "Owner",
    color: "#f4c95d",
    priority: 400,
    permissions: ["manage_server", "manage_channels", "manage_roles", "manage_messages", "manage_nicknames", "invite_members", "mute_members", "deafen_members", "move_members"],
  },
  {
    id: "admin",
    name: "Admin",
    color: "#ff8a65",
    priority: 300,
    permissions: ["manage_server", "manage_channels", "manage_roles", "manage_messages", "manage_nicknames", "invite_members", "mute_members", "deafen_members", "move_members"],
  },
  {
    id: "moderator",
    name: "Moderator",
    color: "#5dc7b7",
    priority: 200,
    permissions: ["manage_channels", "manage_messages", "manage_nicknames", "mute_members", "deafen_members"],
  },
  {
    id: "member",
    name: "Member",
    color: "#7b89a8",
    priority: 100,
    permissions: [],
  },
];
const ROLE_PERMISSION_LABELS = {
  manage_server: "Управление сервером",
  manage_channels: "Управление каналами",
  manage_roles: "Управление ролями",
  manage_messages: "Управление сообщениями",
  manage_nicknames: "Управление никами",
  invite_members: "Приглашение участников",
};

ROLE_PERMISSION_LABELS.mute_members = "Управление микрофоном";
ROLE_PERMISSION_LABELS.deafen_members = "Отключение звука участникам";
ROLE_PERMISSION_LABELS.move_members = "Перемещение участников";
const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const getDisplayName = (user) =>
  user?.firstName || user?.first_name || user?.name || user?.email || "User";
const getUserAvatar = (user) => user?.avatarUrl || user?.avatar || DEFAULT_AVATAR;
const getCurrentUserId = (user) => String(user?.id || user?.email || "");
const getScopedVoiceChannelId = (serverId, channelId) => (serverId && channelId ? `${serverId}::${channelId}` : channelId);
const getUserStorageScope = (user) => String(user?.id || user?.email || "guest");
const sanitizeScopeFragment = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "guest";
const isReservedDefaultServerId = (serverId) => /^server-main(?:-|$)/.test(String(serverId || ""));
const getScopedDefaultServerId = (user) =>
  `server-main-${sanitizeScopeFragment(getUserStorageScope(user))}`;
const getScopedPrivateServerId = (serverId, user) => {
  const scope = sanitizeScopeFragment(getUserStorageScope(user));
  const normalizedServerId = String(serverId || "").trim();
  const currentPrefix = `server-${scope}-`;
  if (normalizedServerId.toLowerCase().startsWith(currentPrefix.toLowerCase())) {
    return normalizedServerId;
  }

  const rawSuffix = String(serverId || createId("server"))
    .replace(/^server-main-?/i, "")
    .replace(/^server-?/i, "");
  const suffix = sanitizeScopeFragment(rawSuffix);
  return `server-${scope}-${suffix}`;
};
const getNoiseSuppressionStorageKey = (user) => `${NOISE_SUPPRESSION_STORAGE_KEY}:${getUserStorageScope(user)}`;
const getDirectNotificationsStorageKey = (user) => `${DIRECT_NOTIFICATIONS_STORAGE_KEY}:${getUserStorageScope(user)}`;
const getAudioInputDeviceStorageKey = (user) => `${AUDIO_INPUT_DEVICE_STORAGE_KEY}:${getUserStorageScope(user)}`;
const getAudioOutputDeviceStorageKey = (user) => `${AUDIO_OUTPUT_DEVICE_STORAGE_KEY}:${getUserStorageScope(user)}`;
const getVideoInputDeviceStorageKey = (user) => `${VIDEO_INPUT_DEVICE_STORAGE_KEY}:${getUserStorageScope(user)}`;
const createDirectToastId = () => `dm-toast-${Math.random().toString(36).slice(2, 10)}`;
const getMeterActiveBars = (level, total) => {
  const normalizedLevel = Math.max(0, Math.min(1, Number(level) || 0));
  return Math.max(0, Math.min(total, Math.round(normalizedLevel * total)));
};
const isPersonalDefaultServer = (server, user) => {
  if (!server) {
    return false;
  }

  return String(server.id || "") === getScopedDefaultServerId(user) || (!server.isShared && isReservedDefaultServerId(server.id));
};
const readSessionUser = () => {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const createDefaultRoles = () => DEFAULT_SERVER_ROLES.map((role) => ({ ...role, permissions: [...role.permissions] }));
const createServerMember = (user, roleId = "owner") => ({
  userId: getCurrentUserId(user),
  name: getDisplayName(user),
  avatar: getUserAvatar(user),
  roleId,
});
const normalizeRoles = (roles) => {
  if (!Array.isArray(roles) || roles.length === 0) {
    return createDefaultRoles();
  }

  return roles.map((role, index) => {
    const fallbackRole = DEFAULT_SERVER_ROLES[index] || DEFAULT_SERVER_ROLES[DEFAULT_SERVER_ROLES.length - 1];
    return {
      id: String(role?.id || fallbackRole.id || createId("role")),
      name: String(role?.name || fallbackRole.name || "Role"),
      color: String(role?.color || fallbackRole.color || "#7b89a8"),
      priority: Number(role?.priority ?? fallbackRole.priority ?? 100),
      permissions: Array.isArray(role?.permissions) ? role.permissions.map(String) : [...(fallbackRole.permissions || [])],
    };
  });
};
const normalizeMembers = (members, fallbackUser) => {
  const normalizedMembers = Array.isArray(members)
    ? members
        .filter(Boolean)
        .map((member) => ({
          userId: String(member?.userId || member?.UserId || ""),
          name: String(member?.name || member?.Name || member?.email || "User"),
          avatar: member?.avatar || member?.Avatar || "",
          roleId: String(member?.roleId || member?.RoleId || "member"),
        }))
        .filter((member) => member.userId)
    : [];

  if (!normalizedMembers.length && fallbackUser) {
    return [createServerMember(fallbackUser, "owner")];
  }

  return normalizedMembers;
};
const getRolePermissions = (server, roleId) => {
  const role = server?.roles?.find((item) => item.id === roleId);
  return Array.isArray(role?.permissions) ? role.permissions : [];
};
const getRolePriority = (server, roleId) => {
  const role = server?.roles?.find((item) => item.id === roleId);
  return Number(role?.priority ?? 0);
};
const hasServerPermission = (server, userId, permission) => {
  if (!server || !userId) {
    return false;
  }

  if (String(server.ownerId || "") === String(userId)) {
    return true;
  }

  const member = server.members?.find((item) => String(item.userId) === String(userId));
  if (!member) {
    return false;
  }

  return getRolePermissions(server, member.roleId).includes(permission);
};
const canManageTargetMember = (server, actorUserId, targetUserId, permission) => {
  if (!server || !actorUserId || !targetUserId || String(actorUserId) === String(targetUserId)) {
    return false;
  }

  if (String(server.ownerId || "") === String(actorUserId)) {
    return String(server.ownerId || "") !== String(targetUserId);
  }

  const actorMember = server.members?.find((item) => String(item.userId) === String(actorUserId));
  const targetMember = server.members?.find((item) => String(item.userId) === String(targetUserId));
  if (!actorMember || !targetMember) {
    return false;
  }

  const actorPermissions = getRolePermissions(server, actorMember.roleId);
  if (!actorPermissions.includes(permission)) {
    return false;
  }

  return getRolePriority(server, actorMember.roleId) > getRolePriority(server, targetMember.roleId);
};
const canAssignRoleToMember = (server, actorUserId, targetUserId, nextRoleId) => {
  if (!canManageTargetMember(server, actorUserId, targetUserId, "manage_roles")) {
    return false;
  }

  if (!nextRoleId || nextRoleId === "owner") {
    return false;
  }

  if (String(server?.ownerId || "") === String(actorUserId)) {
    return true;
  }

  const actorMember = server?.members?.find((item) => String(item.userId) === String(actorUserId));
  if (!actorMember) {
    return false;
  }

  return getRolePriority(server, actorMember.roleId) > getRolePriority(server, nextRoleId);
};
const createDefaultServer = (user) => {
  const ownerUser = user || readSessionUser();
  const ownerId = getCurrentUserId(ownerUser) || "local-owner";
  const ownerMember = ownerUser
    ? createServerMember(ownerUser, "owner")
    : { userId: ownerId, name: "Owner", avatar: "", roleId: "owner" };

  return {
  id: getScopedDefaultServerId(ownerUser),
  name: "Основной сервер",
  icon: DEFAULT_SERVER_ICON,
  isDefault: true,
  isShared: false,
  ownerId,
  roles: createDefaultRoles(),
  members: [ownerMember],
  textChannels: DEFAULT_TEXT_CHANNELS.map((channel) => ({ ...channel })),
  voiceChannels: DEFAULT_VOICE_CHANNELS.map((channel) => ({ ...channel })),
  };
};
const createServer = (name, user) => {
  const ownerUser = user || readSessionUser();
  const ownerId = getCurrentUserId(ownerUser) || createId("owner");
  const ownerMember = ownerUser
    ? createServerMember(ownerUser, "owner")
    : { userId: ownerId, name: "Owner", avatar: "", roleId: "owner" };

  return {
  id: getScopedPrivateServerId(createId("server"), ownerUser),
  name: name?.trim() || "Новый сервер",
  icon: "",
  isDefault: false,
  isShared: false,
  ownerId,
  roles: createDefaultRoles(),
  members: [ownerMember],
  textChannels: [{ id: createId("text"), name: "# general" }],
  voiceChannels: [{ id: createId("voice"), name: "general_voice" }],
  };
};
const normalizeChannels = (channels, type) => {
  const fallback = type === "text" ? DEFAULT_TEXT_CHANNELS : DEFAULT_VOICE_CHANNELS;
  if (!Array.isArray(channels) || channels.length === 0) return fallback.map((channel) => ({ ...channel }));
  return channels.map((channel, index) => ({
    id: String(channel?.id || fallback[index]?.id || createId(type)),
    name:
      String(channel?.name || fallback[index]?.name || (type === "text" ? "# new-channel" : "voice-channel")).trim() ||
      (type === "text" ? "# new-channel" : "voice-channel"),
  }));
};
const normalizeServers = (value, currentUser) => {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.map((server, index) => ({
    isDefault: isPersonalDefaultServer(server, currentUser),
    id: String(
      isPersonalDefaultServer(server, currentUser) || (!server?.isShared && (!server?.id || server.id === "server-main"))
        ? getScopedDefaultServerId(currentUser)
        : !server?.isShared && currentUser
          ? getScopedPrivateServerId(server?.id || createId("server"), currentUser)
        : server?.id || (index === 0 ? getScopedDefaultServerId(currentUser) : createId("server"))
    ),
    name: String(server?.name || `Сервер ${index + 1}`),
    icon: server?.icon ?? (index === 0 ? DEFAULT_SERVER_ICON : ""),
    isShared: isPersonalDefaultServer(server, currentUser) ? false : Boolean(server?.isShared),
    ownerId: String(server?.ownerId || server?.owner_id || getCurrentUserId(currentUser) || createId("owner")),
    roles: normalizeRoles(server?.roles),
    members: (() => {
      const nextOwnerId = String(server?.ownerId || server?.owner_id || getCurrentUserId(currentUser) || createId("owner"));
      const nextMembers = normalizeMembers(server?.members, currentUser);
      return nextMembers.some((member) => String(member.userId) === nextOwnerId)
        ? nextMembers
        : [
            ...nextMembers,
            currentUser && nextOwnerId === getCurrentUserId(currentUser)
              ? createServerMember(currentUser, "owner")
              : { userId: nextOwnerId, name: "Owner", avatar: "", roleId: "owner" },
          ];
    })(),
    textChannels: normalizeChannels(server?.textChannels, "text"),
    voiceChannels: normalizeChannels(server?.voiceChannels, "voice"),
  }));
};
const getServersStorageKey = (user) => `${SERVERS_STORAGE_KEY}:${getUserStorageScope(user)}`;
const getActiveServerStorageKey = (user) => `${ACTIVE_SERVER_STORAGE_KEY}:${getUserStorageScope(user)}`;
const readStoredServers = (user) => {
  try {
    const raw = localStorage.getItem(getServersStorageKey(user));
    return raw ? normalizeServers(JSON.parse(raw), user) : [];
  } catch {
    return [];
  }
};
const getChannelDisplayName = (name, type) => (type === "text" && !name.startsWith("#") ? `# ${name}` : name);
const getDirectMessageChannelId = (firstUserId, secondUserId) => {
  const [lowId, highId] = [String(firstUserId || ""), String(secondUserId || "")]
    .filter(Boolean)
    .sort((left, right) => Number(left) - Number(right));

  return lowId && highId ? `dm:${lowId}:${highId}` : "";
};
const normalizeFriend = (friend) => ({
  id: String(friend?.id || ""),
  firstName: String(friend?.first_name || friend?.firstName || ""),
  lastName: String(friend?.last_name || friend?.lastName || ""),
  name:
    `${String(friend?.first_name || friend?.firstName || "").trim()} ${String(friend?.last_name || friend?.lastName || "").trim()}`.trim(),
  email: String(friend?.email || ""),
  directChannelId: String(friend?.directChannelId || ""),
});
const UI_SOUND_PATHS = {
  join: "/sounds/join.mp3",
  leave: "/sounds/leave.mp3",
  share: "/sounds/share.mp3",
};
const FRIENDS_SIDEBAR_ITEMS = [
  { id: "friends", label: "Друзья", icon: "👥" },
  { id: "discover", label: "Магазин", icon: "◻" },
  { id: "tasks", label: "Задания", icon: "◎" },
];
const SETTINGS_NAV_ITEMS = [
  { id: "notifications", label: "Уведомления", section: "Пользователь" },
  { id: "voice_video", label: "Голос и видео", section: "Приложение" },
  { id: "server", label: "Сервер", section: "Текущий сервер" },
  { id: "roles", label: "Роли и участники", section: "Текущий сервер" },
];
const uiSoundCache = new Map();

export default function MenuMain({ user, setUser, onLogout }) {
  const [servers, setServers] = useState(() => readStoredServers(user));
  const [activeServerId, setActiveServerId] = useState(
    () => localStorage.getItem(getActiveServerStorageKey(user)) || readStoredServers(user)[0]?.id || ""
  );
  const [currentTextChannelId, setCurrentTextChannelId] = useState(() => readStoredServers(user)[0]?.textChannels?.[0]?.id || "");
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState(null);
  const [participantsMap, setParticipantsMap] = useState({});
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
  const [showNoiseMenu, setShowNoiseMenu] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [resolution, setResolution] = useState("1080p");
  const [fps, setFps] = useState(60);
  const [shareStreamAudio, setShareStreamAudio] = useState(false);
  const [remoteScreenShares, setRemoteScreenShares] = useState([]);
  const [announcedLiveUserIds, setAnnouncedLiveUserIds] = useState([]);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [localLiveShareMode, setLocalLiveShareMode] = useState("");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [isMicForced, setIsMicForced] = useState(false);
  const [isSoundForced, setIsSoundForced] = useState(false);
  const [pingMs, setPingMs] = useState(null);
  const [selectedStreamUserId, setSelectedStreamUserId] = useState(null);
  const [speakingUserIds, setSpeakingUserIds] = useState([]);
  const [showServerMembersPanel, setShowServerMembersPanel] = useState(false);
  const [memberRoleMenu, setMemberRoleMenu] = useState(null);
  const [rolesExpanded, setRolesExpanded] = useState(false);
  const [channelRenameState, setChannelRenameState] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendEmail, setFriendEmail] = useState("");
  const [friendsError, setFriendsError] = useState("");
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [activeDirectFriendId, setActiveDirectFriendId] = useState("");
  const [directNotificationsEnabled, setDirectNotificationsEnabled] = useState(true);
  const [directMessageToasts, setDirectMessageToasts] = useState([]);
  const [workspaceMode, setWorkspaceMode] = useState("servers");
  const [friendsPageSection, setFriendsPageSection] = useState("add");
  const [settingsTab, setSettingsTab] = useState("voice_video");
  const [autoInputSensitivity, setAutoInputSensitivity] = useState(true);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [showSoundMenu, setShowSoundMenu] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [hasCameraPreview, setHasCameraPreview] = useState(false);

  const popupRef = useRef(null);
  const serverMembersRef = useRef(null);
  const memberRoleMenuRef = useRef(null);
  const noiseMenuRef = useRef(null);
  const micMenuRef = useRef(null);
  const soundMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const serverIconInputRef = useRef(null);
  const cameraPreviewRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const voiceClientRef = useRef(null);
  const previousVoiceChannelRef = useRef(null);
  const previousScreenShareRef = useRef(false);
  const joinedDirectChannelsRef = useRef(new Set());
  const directToastTimeoutsRef = useRef(new Map());
  const appliedInputDeviceRef = useRef("");
  const appliedOutputDeviceRef = useRef("");
  const serversStorageKey = useMemo(() => getServersStorageKey(user), [user?.id, user?.email]);
  const activeServerStorageKey = useMemo(() => getActiveServerStorageKey(user), [user?.id, user?.email]);
  const noiseSuppressionStorageKey = useMemo(() => getNoiseSuppressionStorageKey(user), [user?.id, user?.email]);
  const directNotificationsStorageKey = useMemo(() => getDirectNotificationsStorageKey(user), [user?.id, user?.email]);
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

    const hasScopedVoiceChannels = Object.keys(participantsMap || {}).some((channelId) => channelId.includes("::"));
    if (!hasScopedVoiceChannels) {
      return participantsMap || {};
    }

    return Object.fromEntries(
      Object.entries(participantsMap || {}).flatMap(([channelId, participants]) => {
        const prefix = `${activeServer.id}::`;
        if (!channelId.startsWith(prefix)) {
          return [];
        }

        return [[channelId.slice(prefix.length), participants]];
      })
    );
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
  const currentServerMember = useMemo(() => activeServer?.members?.find((member) => String(member.userId) === String(currentUserId)) || null, [activeServer, currentUserId]);
  const currentServerRole = useMemo(() => activeServer?.roles?.find((role) => role.id === currentServerMember?.roleId) || null, [activeServer, currentServerMember?.roleId]);
  const currentDirectFriend = useMemo(
    () => friends.find((friend) => String(friend.id) === String(activeDirectFriendId)) || null,
    [friends, activeDirectFriendId]
  );
  const currentDirectChannelId = useMemo(
    () => currentDirectFriend?.directChannelId || getDirectMessageChannelId(currentUserId, currentDirectFriend?.id),
    [currentDirectFriend?.directChannelId, currentDirectFriend?.id, currentUserId]
  );
  const directChannelFriendMap = useMemo(
    () =>
      new Map(
        friends
          .map((friend) => {
            const channelId = friend.directChannelId || getDirectMessageChannelId(currentUserId, friend.id);
            return channelId ? [channelId, friend] : null;
          })
          .filter(Boolean)
      ),
    [friends, currentUserId]
  );
  const isDefaultServer = useMemo(() => isPersonalDefaultServer(activeServer, user), [activeServer, user]);
  const isServerOwner = useMemo(() => String(activeServer?.ownerId || "") === String(currentUserId), [activeServer?.ownerId, currentUserId]);
  const canManageServer = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_server"), [activeServer, currentUserId]);
  const canManageChannels = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_channels"), [activeServer, currentUserId]);
  const canManageRoles = useMemo(() => hasServerPermission(activeServer, currentUserId, "manage_roles"), [activeServer, currentUserId]);
  const canInviteMembers = useMemo(() => hasServerPermission(activeServer, currentUserId, "invite_members"), [activeServer, currentUserId]);
  const isCurrentUserSpeaking = useMemo(() => speakingUserIds.some((id) => String(id) === String(currentUserId)), [currentUserId, speakingUserIds]);
  const selectedResolutionOption = useMemo(() => STREAM_RESOLUTION_OPTIONS.find((option) => option.value === resolution) || STREAM_RESOLUTION_OPTIONS[1], [resolution]);
  const liveUserIds = useMemo(() => Array.from(new Set([...remoteScreenShares.map((item) => item.userId).filter(Boolean), ...announcedLiveUserIds, ...(isSharingScreen && user?.id ? [String(user.id)] : [])])), [remoteScreenShares, announcedLiveUserIds, isSharingScreen, user?.id]);
  const selectedStream = useMemo(() => remoteScreenShares.find((item) => String(item.userId) === String(selectedStreamUserId)) || null, [remoteScreenShares, selectedStreamUserId]);
  const isScreenShareActive = isSharingScreen && localLiveShareMode === "screen";
  const isCameraShareActive = isSharingScreen && localLiveShareMode === "camera";
  const selectedStreamParticipant = useMemo(() => Object.values(participantsMap).flat().find((item) => String(item.userId) === String(selectedStreamUserId)) || null, [participantsMap, selectedStreamUserId]);
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
  const logVoiceHubError = (label, error) => {
    if (isUnauthorizedError(error)) {
      return;
    }

    console.error(label, error);
  };

  const loadFriends = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/friends`, { method: "GET" });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить список друзей."));
      }

      setFriends(
        Array.isArray(data)
          ? data
              .map(normalizeFriend)
              .filter((friend) => friend.id)
              .sort((left, right) => getDisplayName(left).localeCompare(getDisplayName(right), "ru", { sensitivity: "base" }))
          : []
      );
      setFriendsError("");
    } catch (error) {
      console.error("Ошибка загрузки друзей:", error);
      setFriendsError(error.message || "Не удалось загрузить список друзей.");
    }
  };

  const handleAddFriend = async (event) => {
    event.preventDefault();

    const email = friendEmail.trim().toLowerCase();
    if (!email) {
      setFriendsError("Введите email друга.");
      return;
    }

    try {
      setIsAddingFriend(true);
      setFriendsError("");

      const response = await authFetch(`${API_BASE_URL}/friends/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось добавить друга."));
      }

      const nextFriend = normalizeFriend(data);
      setFriends((previous) => {
        const exists = previous.some((friend) => friend.id === nextFriend.id);
        const nextFriends = exists
          ? previous.map((friend) => (friend.id === nextFriend.id ? nextFriend : friend))
          : [nextFriend, ...previous];

        return nextFriends.sort((left, right) =>
          getDisplayName(left).localeCompare(getDisplayName(right), "ru", { sensitivity: "base" })
        );
      });
      setFriendEmail("");
    } catch (error) {
      setFriendsError(error.message || "Не удалось добавить друга.");
    } finally {
      setIsAddingFriend(false);
    }
  };

  const openDirectChat = (friendId) => {
    setActiveDirectFriendId(String(friendId || ""));
    setWorkspaceMode("friends");
    setFriendsPageSection("friends");
    setSelectedStreamUserId(null);
  };

  const dismissDirectToast = (toastId) => {
    const timeoutId = directToastTimeoutsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      directToastTimeoutsRef.current.delete(toastId);
    }

    setDirectMessageToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  };

  const pushDirectToast = (toast) => {
    setDirectMessageToasts((previous) => {
      const nextToasts = [toast, ...previous.filter((item) => item.channelId !== toast.channelId)];
      return nextToasts.slice(0, 4);
    });

    const timeoutId = window.setTimeout(() => {
      dismissDirectToast(toast.id);
    }, 6500);

    directToastTimeoutsRef.current.set(toast.id, timeoutId);
  };

  useEffect(() => {
    if (!user) return;

    try {
      const existingScopedValue = localStorage.getItem(serversStorageKey);
      const nextServers = existingScopedValue
        ? normalizeServers(JSON.parse(existingScopedValue), user)
        : [];
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
      setServers([]);
      setActiveServerId("");
      setCurrentTextChannelId("");
    }
  }, [activeServerStorageKey, serversStorageKey, user]);

  useEffect(() => {
    if (!user) {
      setFriends([]);
      setActiveDirectFriendId("");
      setFriendEmail("");
      setFriendsError("");
      setDirectMessageToasts([]);
      joinedDirectChannelsRef.current.clear();
      directToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      directToastTimeoutsRef.current.clear();
      return;
    }

    loadFriends().catch(() => {});
  }, [user?.id, user?.email]);

  useEffect(() => () => {
    directToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    directToastTimeoutsRef.current.clear();
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
      setNoiseSuppressionMode(storedMode === "voice_isolation" ? "voice_isolation" : "transparent");
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
      return;
    }

    try {
      localStorage.setItem(directNotificationsStorageKey, String(directNotificationsEnabled));
    } catch {
      // ignore storage failures
    }
  }, [directNotificationsEnabled, directNotificationsStorageKey, user]);

  useEffect(() => {
    if (directNotificationsEnabled) {
      return;
    }

    setDirectMessageToasts([]);
    directToastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    directToastTimeoutsRef.current.clear();
  }, [directNotificationsEnabled]);

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
      friends
        .map((friend) => friend.directChannelId || getDirectMessageChannelId(currentUserId, friend.id))
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
  }, [friends, currentUserId, user]);

  useEffect(() => {
    if (!user || !currentUserId) {
      return undefined;
    }

    const handleReceiveDirectMessage = (messageItem) => {
      const channelId = String(messageItem?.channelId || "");
      if (!channelId.startsWith("dm:")) {
        return;
      }

      if (String(messageItem?.authorUserId || "") === String(currentUserId)) {
        return;
      }

      if (!directNotificationsEnabled || channelId === currentDirectChannelId) {
        return;
      }

      const friend = directChannelFriendMap.get(channelId);
      if (!friend) {
        return;
      }

      const preview = String(messageItem?.message || "").trim() || "Новое сообщение в личном чате";
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
    if (!activeServer?.id || isDefaultServer || !currentUserId || !canManageServer) return;

    const timeoutId = window.setTimeout(() => {
      syncServerSnapshot(activeServer);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [activeServer, canManageServer, currentUserId, isDefaultServer]);
  useEffect(() => {
    if (!activeServer?.id || !activeServer?.isShared || isDefaultServer) return;

    refreshServerSnapshot(activeServer.id);
    const intervalId = window.setInterval(() => {
      refreshServerSnapshot(activeServer.id);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeServer?.id, activeServer?.isShared, isDefaultServer]);
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
    cancelChannelRename();
  }, [activeServerId]);
  useEffect(() => {
    if (!selectedStreamUserId) return;
    const isStillLive = liveUserIds.some((id) => String(id) === String(selectedStreamUserId));
    if (!isStillLive && !selectedStream) setSelectedStreamUserId(null);
  }, [liveUserIds, selectedStream, selectedStreamUserId]);
  useEffect(() => {
    const handleClick = (event) => {
      const target = event.target;
      const insidePopup = popupRef.current?.contains(target);
      const insideServerPanel = serverMembersRef.current?.contains(target);
      const insideMemberMenu = memberRoleMenuRef.current?.contains(target);
      const insideNoiseMenu = noiseMenuRef.current?.contains(target);
      const insideMicMenu = micMenuRef.current?.contains(target);
      const insideSoundMenu = soundMenuRef.current?.contains(target);

      if (popupRef.current && !insidePopup) setOpenSettings(false);
      if (serverMembersRef.current && !insideServerPanel && !insideMemberMenu) setShowServerMembersPanel(false);
      if (!insideMemberMenu) setMemberRoleMenu(null);
      if (!insideNoiseMenu) setShowNoiseMenu(false);
      if (!insideMicMenu) setShowMicMenu(false);
      if (!insideSoundMenu) setShowSoundMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  useEffect(() => {
    setShowServerMembersPanel(false);
  }, [activeServerId]);
  useEffect(() => {
    let disposed = false;
    const measurePing = async () => {
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
      onChannelChanged: setCurrentVoiceChannel,
      onRemoteScreenStreamsChanged: setRemoteScreenShares,
      onLocalScreenShareChanged: setIsSharingScreen,
      onLocalLiveShareChanged: ({ mode }) => setLocalLiveShareMode(mode || ""),
      onLiveUsersChanged: setAnnouncedLiveUserIds,
      onSpeakingUsersChanged: setSpeakingUserIds,
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

    const shouldPreviewMicrophone = showMicMenu || (openSettings && settingsTab === "voice_video");
    const shouldLoadAudioDevices = shouldPreviewMicrophone || showSoundMenu;

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
  }, [openSettings, settingsTab, showMicMenu, showSoundMenu, user?.id]);
  useEffect(() => {
    if (!showCameraModal) {
      stopCameraPreview();
      return;
    }

    if (isCameraShareActive) {
      stopCameraPreview();
      return;
    }

    startCameraPreview(selectedVideoDeviceId).catch((error) => {
      console.error("Ошибка обновления предпросмотра камеры:", error);
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

    const normalizedServer = normalizeServers([snapshot], user)[0];
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
      setActiveServerId(normalizedServer.id);
      setCurrentTextChannelId(normalizedServer.textChannels?.[0]?.id || "");
    }
  };
  const updateServer = (updater) => setServers((previous) => previous.map((server) => (server.id === activeServerId ? updater(server) : server)));
  const syncServerSnapshot = async (serverSnapshot) => {
    if (!serverSnapshot || !currentUserId || !canManageServer) return;

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
        return;
      }
    } catch (error) {
      console.error("Ошибка синхронизации сервера:", error);
    }
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
    setShowMicMenu(false);
    setShowSoundMenu(false);
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
    const server = createServer(`Сервер ${servers.length + 1}`, user);
    setServers((previous) => [...previous, server]);
    setActiveServerId(server.id);
    setCurrentTextChannelId(server.textChannels[0]?.id || "");
    setOpenSettings(true);
  };
  const handleDeleteServer = async (serverId) => {
    if (!canManageServer) return;
    const serverToDelete = servers.find((server) => server.id === serverId);
    if (!serverToDelete) return;
    if (serverToDelete.voiceChannels.some((channel) => getScopedVoiceChannelId(serverToDelete.id, channel.id) === currentVoiceChannel)) await leaveVoiceChannel();
    const nextServers = servers.filter((server) => server.id !== serverId);
    const nextActiveId = activeServerId === serverId ? nextServers[0]?.id || "" : activeServerId;
    const nextActiveServer = nextServers.find((server) => server.id === nextActiveId) || nextServers[0] || null;
    setServers(nextServers);
    setActiveServerId(nextActiveId);
    setCurrentTextChannelId(nextActiveServer?.textChannels?.[0]?.id || "");
    setSelectedStreamUserId(null);
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
    if (!canManageChannels) return;
    const channel = { id: createId("text"), name: `# channel-${(activeServer?.textChannels.length || 0) + 1}` };
    updateServer((server) => ({ ...server, textChannels: [...server.textChannels, channel] }));
    setCurrentTextChannelId(channel.id);
    setOpenSettings(true);
  };
  const addVoiceChannel = () => {
    if (!canManageChannels) return;
    const channel = { id: createId("voice"), name: `voice-${(activeServer?.voiceChannels.length || 0) + 1}` };
    updateServer((server) => ({ ...server, voiceChannels: [...server.voiceChannels, channel] }));
    setOpenSettings(true);
  };
  const updateActiveServerName = (value) => {
    if (!canManageServer) return;
    updateServer((server) => ({ ...server, name: value }));
  };
  const updateTextChannelName = (channelId, value) => {
    if (!canManageChannels) return;
    updateServer((server) => ({ ...server, textChannels: server.textChannels.map((channel) => channel.id === channelId ? { ...channel, name: value } : channel) }));
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
    setNoiseSuppressionMode(mode === "voice_isolation" ? "voice_isolation" : "transparent");
    setShowNoiseMenu(false);
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
      previous.map((server) =>
        server.id === serverId && !isPersonalDefaultServer(server, user) ? { ...server, isShared: true } : server
      )
    );
  };
  const joinVoiceChannel = async (channel) => {
    if (!voiceClientRef.current || !user?.id || !channel?.id || !activeServer?.id) return;
    try {
      await voiceClientRef.current.joinChannel(getScopedVoiceChannelId(activeServer.id, channel.id), user);
    } catch (error) {
      console.error("Ошибка входа в голосовой канал:", error);
    }
  };
  const leaveVoiceChannel = async () => {
    if (!voiceClientRef.current) return;
    try { await voiceClientRef.current.leaveChannel(); } catch (error) { console.error("Ошибка выхода из голосового канала:", error); }
  };
  const handleLogout = async () => {
    try { await voiceClientRef.current?.disconnect(); } catch (error) { console.error("Ошибка при отключении перед выходом:", error); }
    finally {
      setOpenSettings(false);
      setShowModal(false);
      setShowCameraModal(false);
      stopCameraPreview();
      onLogout?.();
    }
  };
  const startScreenShare = async () => {
    if (!voiceClientRef.current) return;
    await voiceClientRef.current.startScreenShare({ resolution, fps, shareAudio: shareStreamAudio });
    setShowModal(false);
  };
  const stopScreenShare = async () => {
    if (!voiceClientRef.current) return;
    await voiceClientRef.current.stopScreenShare();
    setShowModal(false);
  };
  const handleScreenShareAction = async () => {
    if (isScreenShareActive) {
      await stopScreenShare();
      return;
    }

    setShowCameraModal(false);
    setShowModal(true);
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
    if (String(selectedStreamUserId || "") === normalizedUserId) {
      setSelectedStreamUserId(null);
      return;
    }
    setSelectedStreamUserId(normalizedUserId);
    voiceClientRef.current?.requestScreenShare(normalizedUserId).catch((error) => console.error("Ошибка запроса просмотра трансляции:", error));
  };
  const handleImportServer = (snapshot) => {
    if (!snapshot) return;
    replaceServerSnapshot(snapshot, { activate: true });
    setOpenSettings(false);
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
  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;
    const formData = new FormData();
    formData.append("avatar", file);
    try {
      const response = await authFetch(`${API_URL}/api/user/upload-avatar`, { method: "POST", body: formData });
      const data = await parseApiResponse(response);
      if (!response.ok) throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить аватар."));
      setUser?.((previous) => ({ ...previous, avatarUrl: data.avatarUrl, avatar: data.avatarUrl }));
    } catch (error) {
      console.error("Ошибка смены аватара:", error);
    }
  };
  const handleServerIconChange = async (event) => {
    if (!canManageServer) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeServer) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateServer((server) => ({ ...server, icon: dataUrl }));
    } catch (error) {
      console.error("Ошибка смены иконки сервера:", error);
    }
  };

  if (!user) return <div className="menu-loading">Загрузка пользователя...</div>;

  const activeStreamCount = remoteScreenShares.length + (isSharingScreen ? 1 : 0);
  const avatarSrc = resolveMediaUrl(user?.avatarUrl || user?.avatar, DEFAULT_AVATAR);
  const settingsNavSections = SETTINGS_NAV_ITEMS.reduce((sections, item) => {
    if (!sections[item.section]) {
      sections[item.section] = [];
    }

    sections[item.section].push(item);
    return sections;
  }, {});
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
      id: "voice_isolation",
      title: "Изоляция голоса",
      description: "Только ваш голос: фон режется сильнее и речь выходит вперед.",
    },
    {
      id: "transparent",
      title: "Студия",
      description: "Чистый естественный звук с минимальной обработкой.",
    },
  ];
  const activeNoiseProfile =
    noiseProfileOptions.find((option) => option.id === noiseSuppressionMode) || noiseProfileOptions[0];

  const renderVoiceSettingsPanel = () => (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Голос и видео</h2>
          <p>Настройте микрофон, вывод и профиль обработки так, как в вашем макете.</p>
        </div>
      </div>

      <section className="voice-settings-card">
        <div className="voice-settings-card__title">Голос</div>
        <div className="voice-settings-grid">
          <label className="voice-settings-field">
            <span>Микрофон</span>
            <select
              className="voice-settings-select voice-settings-select--native"
              value={selectedInputDeviceId}
              onChange={(event) => handleInputDeviceChange(event.target.value)}
            >
              {audioInputDevices.length > 0 ? (
                audioInputDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))
              ) : (
                <option value="">Системный микрофон</option>
              )}
            </select>
            <span className="voice-settings-caption">Выбранное устройство ввода будет использоваться в звонке и при проверке.</span>
          </label>
          <label className="voice-settings-field">
            <span>Динамик</span>
            <select
              className="voice-settings-select voice-settings-select--native"
              value={selectedOutputDeviceId}
              onChange={(event) => handleOutputDeviceChange(event.target.value)}
              disabled={!outputSelectionAvailable}
            >
              {audioOutputDevices.length > 0 ? (
                audioOutputDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))
              ) : (
                <option value="">Системный вывод</option>
              )}
            </select>
            <span className="voice-settings-caption">
              {outputSelectionAvailable
                ? "Выход звука можно переключать прямо отсюда."
                : "Эта система пока не дает приложению переключать устройство вывода напрямую."}
            </span>
          </label>
          <label className="voice-settings-field">
            <span>Громкость микрофона</span>
            <input type="range" min="0" max="100" value={micVolume} onChange={(event) => updateMicVolume(Number(event.target.value))} />
          </label>
          <label className="voice-settings-field">
            <span>Громкость динамика</span>
            <input type="range" min="0" max="100" value={audioVolume} onChange={(event) => updateAudioVolume(Number(event.target.value))} />
          </label>
        </div>

        <div className="voice-settings-meter">
          <button type="button" className="voice-settings-meter__button">Проверка микрофона</button>
          <div className="voice-settings-meter__bars" aria-hidden="true">
            {Array.from({ length: 48 }).map((_, index) => (
              <span key={index} className={index < activeMicSettingsBars ? "is-active" : ""} />
            ))}
          </div>
        </div>

        <div className="voice-settings-help">
          Нужна помощь? Здесь собраны все быстрые настройки голоса, чтобы не вылезать из звонка.
        </div>
      </section>

      <section className="voice-settings-card">
        <div className="voice-settings-card__title">Профиль ввода</div>
        <div className="voice-profile-list">
          {noiseProfileOptions.map((option) => (
            <label key={option.id} className="voice-profile-option">
              <input
                type="radio"
                name="noiseProfile"
                checked={noiseSuppressionMode === option.id}
                onChange={() => handleNoiseSuppressionModeChange(option.id)}
              />
              <span className="voice-profile-option__copy">
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="voice-toggle-row">
          <div>
            <strong>Автоматически определять чувствительность ввода</strong>
            <span>Система сама подстраивает порог срабатывания микрофона под текущий шум.</span>
          </div>
          <button
            type="button"
            className={`voice-switch ${autoInputSensitivity ? "voice-switch--active" : ""}`}
            onClick={() => setAutoInputSensitivity((previous) => !previous)}
            aria-pressed={autoInputSensitivity}
          >
            <span />
          </button>
        </div>

        <div className="voice-settings-field voice-settings-field--stacked">
          <span>Шумоподавление</span>
          <select
            className="voice-settings-select voice-settings-select--native voice-settings-select--compact"
            value={noiseSuppressionMode}
            onChange={(event) => handleNoiseSuppressionModeChange(event.target.value)}
          >
            {noiseProfileOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
          <span className="voice-settings-caption">{activeNoiseProfile.description}</span>
        </div>
      </section>
    </div>
  );

  const renderNotificationsSettings = () => (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Уведомления</h2>
          <p>Тонкая настройка того, как приложение будет тревожить вас в личных чатах.</p>
        </div>
      </div>

      <section className="voice-settings-card">
        <div className="voice-toggle-row">
          <div>
            <strong>Личные чаты</strong>
            <span>Показывать всплывающие уведомления, когда личный чат не открыт.</span>
          </div>
          <button
            type="button"
            className={`voice-switch ${directNotificationsEnabled ? "voice-switch--active" : ""}`}
            onClick={() => setDirectNotificationsEnabled((previous) => !previous)}
            aria-pressed={directNotificationsEnabled}
          >
            <span />
          </button>
        </div>
      </section>
    </div>
  );

  const renderServerSettings = () => (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Сервер</h2>
          <p>Быстрые настройки сервера без отдельного всплывающего окна на каждое действие.</p>
        </div>
      </div>

      <section className="voice-settings-card">
        <div className="settings-server-card settings-server-card--shell">
          {activeServer?.icon ? (
            <img
              className="settings-server-card__icon"
              src={resolveMediaUrl(activeServer.icon, DEFAULT_SERVER_ICON)}
              alt={activeServer?.name || "Без названия"}
            />
          ) : (
            <div className="settings-server-card__icon settings-server-card__icon--empty" aria-hidden="true" />
          )}
          <label className="voice-settings-field voice-settings-field--stacked voice-settings-field--grow">
            <span>Название сервера</span>
            <input className="settings-input" type="text" value={activeServer?.name || ""} onChange={(event) => updateActiveServerName(event.target.value)} disabled={!canManageServer} />
          </label>
        </div>
        <div className="settings-shell__actions">
          <button type="button" className="settings-inline-button" onClick={() => serverIconInputRef.current?.click()}>Сменить картинку</button>
          <button type="button" className="settings-inline-button settings-inline-button--danger" onClick={() => handleDeleteServer(activeServer?.id)} disabled={!canManageServer}>Удалить сервер</button>
        </div>
      </section>
    </div>
  );

  const renderRolesSettings = () => (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Роли и участники</h2>
          <p>Иерархия ролей, участники сервера и быстрый обзор прав без длинных полотен текста.</p>
        </div>
      </div>

      <section className="voice-settings-card">
        <div className="settings-section__header">
          <h4>Роли</h4>
          <span className="settings-role-current">{currentServerRole?.name || "Member"}</span>
        </div>
        <div className="settings-list">
          {(activeServer?.roles || []).map((role) => (
            <div key={role.id} className="settings-list__row settings-list__row--stacked">
              <div className="settings-role-meta">
                <span className="settings-role-badge" style={{ backgroundColor: role.color || "#7b89a8" }}>{role.name}</span>
                <span className="settings-role-description">
                  {(role.permissions || []).length
                    ? role.permissions.map((permission) => ROLE_PERMISSION_LABELS[permission] || permission).join(", ")
                    : "Базовый доступ"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="voice-settings-card">
        <div className="settings-section__header">
          <h4>Участники</h4>
          <span className="settings-role-current">{activeServer?.members?.length || 0}</span>
        </div>
        <div className="settings-list">
          {(activeServer?.members || []).map((member) => {
            const memberRole = activeServer?.roles?.find((role) => role.id === member.roleId);
            return (
              <div key={member.userId} className="settings-list__row settings-list__row--stacked">
                <div className="settings-role-meta">
                  <span className="settings-member-name">{member.name}</span>
                  <span className="settings-role-description">{memberRole?.name || member.roleId || "Member"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  const renderSettingsContent = () => {
    switch (settingsTab) {
      case "notifications":
        return renderNotificationsSettings();
      case "server":
        return renderServerSettings();
      case "roles":
        return renderRolesSettings();
      case "voice_video":
      default:
        return renderVoiceSettingsPanel();
    }
  };
  const renderMicMenuPanel = () => (
    <div className="device-menu__panel">
      <div className="device-menu__group">
        <label className="device-menu__field">
          <span className="device-menu__label">Устройство ввода</span>
          <select
            className="device-menu__select"
            value={selectedInputDeviceId}
            onChange={(event) => handleInputDeviceChange(event.target.value)}
          >
            {audioInputDevices.length > 0 ? (
              audioInputDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))
            ) : (
              <option value="">Системный микрофон</option>
            )}
          </select>
          <span className="device-menu__value">{deviceInputLabel}</span>
        </label>
        <label className="device-menu__field">
          <span className="device-menu__label">Профиль ввода</span>
          <select
            className="device-menu__select"
            value={noiseSuppressionMode}
            onChange={(event) => handleNoiseSuppressionModeChange(event.target.value)}
          >
            {noiseProfileOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
          <span className="device-menu__value">{activeNoiseProfile.description}</span>
        </label>
      </div>
      <div className="device-menu__slider">
        <span>Громкость микрофона</span>
        <input type="range" min="0" max="100" value={micVolume} onChange={(event) => updateMicVolume(Number(event.target.value))} />
        <div className="device-menu__meter" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, index) => (
            <span key={index} className={index < activeMicMenuBars ? "is-active" : ""} />
          ))}
        </div>
      </div>
      <button type="button" className="device-menu__settings" onClick={() => openSettingsPanel("voice_video")}>
        <span>Настройки голоса</span>
        <img src="/icons/settings.png" alt="" />
      </button>
    </div>
  );
  const renderSoundMenuPanel = () => (
    <div className="device-menu__panel">
      <div className="device-menu__group">
        <label className="device-menu__field">
          <span className="device-menu__label">Устройство вывода</span>
          <select
            className="device-menu__select"
            value={selectedOutputDeviceId}
            onChange={(event) => handleOutputDeviceChange(event.target.value)}
            disabled={!outputSelectionAvailable}
          >
            {audioOutputDevices.length > 0 ? (
              audioOutputDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))
            ) : (
              <option value="">Системный вывод</option>
            )}
          </select>
          <span className="device-menu__value">
            {outputSelectionAvailable ? deviceOutputLabel : "Переключение вывода недоступно в этой среде"}
          </span>
        </label>
      </div>
      <div className="device-menu__slider">
        <span>Громкость звука</span>
        <input type="range" min="0" max="100" value={audioVolume} onChange={(event) => updateAudioVolume(Number(event.target.value))} />
      </div>
      <button type="button" className="device-menu__settings" onClick={() => openSettingsPanel("voice_video")}>
        <span>Настройки голоса</span>
        <img src="/icons/settings.png" alt="" />
      </button>
    </div>
  );
  const renderProfilePanel = () => (
    <div className="menu__profile-wrapper">
      <div className="menu__profile menu__profile--discordish">
        {currentVoiceChannelName ? (
          <div className="profile__connection-card">
            <div className="profile__connection-copy">
              <span className="profile__connection-state">Подключено к</span>
              <span className="profile__connection-subtitle">{`${currentVoiceChannelName} / ${activeServer?.name || "Сервер"}`}</span>
            </div>
            <div className="profile__connection-icons">
              <span className="profile__waveform profile__waveform--live" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        ) : null}

        <div className="profile__quick-actions">
          <button type="button" className="profile__quick-button profile__quick-button--settings" onClick={() => openSettingsPanel("voice_video")}>
            <span className="profile__quick-glyph profile__quick-glyph--settings" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`profile__quick-button ${isScreenShareActive ? "profile__quick-button--active" : ""}`}
            onClick={handleScreenShareAction}
          >
            <span
              className={`profile__quick-glyph ${isScreenShareActive ? "profile__quick-glyph--close" : "profile__quick-glyph--monitor"}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className={`profile__quick-button ${isCameraShareActive ? "profile__quick-button--active" : ""}`}
            onClick={openCameraModal}
          >
            <span className="profile__quick-glyph profile__quick-glyph--camera" aria-hidden="true" />
          </button>
          <button type="button" className="profile__quick-button profile__quick-button--active noise-toggle--active" onClick={() => setShowNoiseMenu((previous) => !previous)}>
            <span className="noise-toggle__bars" aria-hidden="true">
              <span className="noise-toggle__bar noise-toggle__bar--1" />
              <span className="noise-toggle__bar noise-toggle__bar--2" />
              <span className="noise-toggle__bar noise-toggle__bar--3" />
            </span>
          </button>
          {showNoiseMenu && (
            <div className="noise-menu__panel noise-menu__panel--bottom">
              <button
                type="button"
                className={`noise-menu__option ${noiseSuppressionMode === "transparent" ? "noise-menu__option--active" : ""}`}
                onClick={() => handleNoiseSuppressionModeChange("transparent")}
              >
                <span className="noise-menu__title">Прозрачный</span>
                <span className="noise-menu__description">Обычный режим без шумодава</span>
              </button>
              <button
                type="button"
                className={`noise-menu__option ${noiseSuppressionMode === "voice_isolation" ? "noise-menu__option--active" : ""}`}
                onClick={() => handleNoiseSuppressionModeChange("voice_isolation")}
              >
                <span className="noise-menu__title">Изоляция голоса</span>
                <span className="noise-menu__description">Подавляет фон и вытягивает речь вперед</span>
              </button>
            </div>
          )}
        </div>

        <div className="profile__identity-row">
          <div className="profile__identity">
            <img className={`avatar ${isCurrentUserSpeaking ? "avatar--speaking" : ""}`} src={avatarSrc} alt="avatar" onClick={() => avatarInputRef.current?.click()} />
            <input type="file" accept="image/*" ref={avatarInputRef} className="hidden-input" onChange={handleAvatarChange} />
            <input ref={serverIconInputRef} type="file" accept="image/*" className="hidden-input" onChange={handleServerIconChange} />
            <div className="profile__names">
              <span className="profile__username">{getDisplayName(user)}</span>
              <div className="status__profile">
                <span>{currentVoiceChannelName ? "В голосовом чате" : currentServerRole?.name || "Member"}</span>
                <span className="status__role-dot" style={{ backgroundColor: currentVoiceChannelName ? "#3ba55d" : currentServerRole?.color || "#7b89a8" }} aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="profile__identity-controls">
            <div className="device-menu" ref={micMenuRef}>
              <button type="button" className={`profile__mini-icon ${isMicMuted ? "profile__mini-icon--slashed" : ""}`} onClick={toggleMicMute}>
                <img src="/icons/microphone.png" alt="" />
              </button>
              <button type="button" className="profile__mini-arrow" onClick={() => setShowMicMenu((previous) => !previous)}>▾</button>
              {showMicMenu && renderMicMenuPanel()}
            </div>

            <div className="device-menu" ref={soundMenuRef}>
              <button type="button" className={`profile__mini-icon ${isSoundMuted ? "profile__mini-icon--slashed" : ""}`} onClick={toggleSoundMute}>
                <img src="/icons/headphones.png" alt="" />
              </button>
              <button type="button" className="profile__mini-arrow" onClick={() => setShowSoundMenu((previous) => !previous)}>▾</button>
              {showSoundMenu && renderSoundMenuPanel()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const renderFriendsSidebar = () => (
    <aside className="sidebar__channels sidebar__channels--friends">
      <div className="channels__top">
        <input className="friends-search-input" type="text" placeholder="Найти или начать беседу" />

        <div className="friends-nav">
          {FRIENDS_SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`friends-nav__item ${item.id === "friends" ? "friends-nav__item--active" : ""}`}
              onClick={() => setFriendsPageSection(item.id === "friends" ? "add" : "friends")}
            >
              <span className="friends-nav__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="friends-directs">
          <div className="friends-directs__header">
            <span>Личные сообщения</span>
            <button type="button" onClick={() => setFriendsPageSection("add")}>+</button>
          </div>
          <div className="friends-directs__list">
            {friends.length ? (
              friends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  className={`friends-directs__item ${String(activeDirectFriendId) === String(friend.id) ? "friends-directs__item--active" : ""}`}
                  onClick={() => openDirectChat(friend.id)}
                >
                  <img src={resolveMediaUrl(friend.avatar || "", DEFAULT_AVATAR)} alt={getDisplayName(friend)} />
                  <span>{getDisplayName(friend)}</span>
                </button>
              ))
            ) : (
              Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="friends-directs__skeleton" aria-hidden="true" />
              ))
            )}
          </div>
        </div>
      </div>

      {renderProfilePanel()}
    </aside>
  );
  const renderServersSidebar = () => (
    <aside className="sidebar__channels sidebar__channels--servers">
      <div className="channels__top">
        {activeServer ? (
          <div className="server-summary-wrap" ref={serverMembersRef}>
            <button type="button" className="server-summary server-summary--discordish" onClick={() => setShowServerMembersPanel((previous) => !previous)}>
              <div className="server-summary__content">
                <div className="server-summary__name">{activeServer.name || "Server"}</div>
                <div className="server-summary__subtitle">Сервер</div>
              </div>
              <span className="server-summary__caret">▾</span>
            </button>

            {showServerMembersPanel && (
              <div className="server-members-panel">
                <div className="server-members-panel__header">
                  <h3>Участники сервера</h3>
                  <span>{activeServer?.members?.length || 0}</span>
                </div>
                <div className="server-members-panel__list">
                  {(activeServer?.members || []).map((member) => {
                    const memberRole = activeServer?.roles?.find((role) => role.id === member.roleId);
                    const memberVoiceState = voiceParticipantByUserId.get(String(member.userId));
                    const canRenameMember = canManageTargetMember(activeServer, currentUserId, member.userId, "manage_nicknames");
                    const canMuteMember = canManageTargetMember(activeServer, currentUserId, member.userId, "mute_members");
                    const canDeafenMember = canManageTargetMember(activeServer, currentUserId, member.userId, "deafen_members");
                    const canManageMemberRoles = (activeServer?.roles || []).some((role) =>
                      canAssignRoleToMember(activeServer, currentUserId, member.userId, role.id)
                    );
                    const canOpenMemberMenu = canRenameMember || canMuteMember || canDeafenMember || canManageMemberRoles;

                    return (
                      <div key={member.userId} className="server-members-panel__item">
                        <img className="server-members-panel__avatar" src={resolveMediaUrl(member.avatar, DEFAULT_AVATAR)} alt={member.name} />
                        <div className="server-members-panel__meta">
                          <span className="server-members-panel__name">
                            <span className="server-members-panel__role-dot" style={{ backgroundColor: memberRole?.color || "#7b89a8" }} aria-hidden="true" />
                            {member.name}
                          </span>
                          <span className="server-members-panel__role">{memberRole?.name || "Member"}</span>
                        </div>
                        <div className="server-members-panel__indicators">
                          {memberVoiceState?.isMicMuted && (
                            <span className="server-members-panel__voice-flag server-members-panel__voice-flag--slashed" title="Микрофон выключен">
                              <img src="/icons/microphone.png" alt="" />
                            </span>
                          )}
                          {memberVoiceState?.isDeafened && (
                            <span className="server-members-panel__voice-flag server-members-panel__voice-flag--slashed" title="Не слышит участников">
                              <img src="/icons/headphones.png" alt="" />
                            </span>
                          )}
                          {canOpenMemberMenu && (
                            <button
                              type="button"
                              className="server-members-panel__gear"
                              aria-label={`Управление участником ${member.name}`}
                              onClick={(event) => openMemberActionsMenu(event, member)}
                            >
                              <img src="/icons/settings.png" alt="" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <ServerInvitesPanel activeServer={activeServer} user={user} canInvite={canInviteMembers && !isDefaultServer} onImportServer={handleImportServer} onServerShared={markServerAsShared} />
              </div>
            )}
            {memberRoleMenu && (
              <div ref={memberRoleMenuRef} className="member-role-menu" style={{ left: memberRoleMenu.x, top: memberRoleMenu.y }}>
                {(() => {
                  const targetMember = activeServer?.members?.find((member) => String(member.userId) === String(memberRoleMenu.memberUserId));
                  const targetVoiceState = voiceParticipantByUserId.get(String(memberRoleMenu.memberUserId));
                  const canRenameMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "manage_nicknames");
                  const canMuteMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "mute_members");
                  const canDeafenMember = canManageTargetMember(activeServer, currentUserId, memberRoleMenu.memberUserId, "deafen_members");
                  const assignableRoles = (activeServer?.roles || []).filter((role) =>
                    canAssignRoleToMember(activeServer, currentUserId, memberRoleMenu.memberUserId, role.id)
                  );

                  return (
                    <>
                      {targetMember && (
                        <div className="member-role-menu__title">{targetMember.name}</div>
                      )}
                      {canRenameMember && (
                        <button type="button" className="member-role-menu__item" onClick={() => updateMemberNickname(memberRoleMenu.memberUserId)}>
                          <img src="/icons/pencil.svg" alt="" className="member-role-menu__icon" />
                          Сменить ник
                        </button>
                      )}
                      {canMuteMember && (
                        <button
                          type="button"
                          className="member-role-menu__item"
                          onClick={() =>
                            updateMemberVoiceState(memberRoleMenu.memberUserId, {
                              isMicMuted: !targetVoiceState?.isMicMuted,
                              isDeafened: Boolean(targetVoiceState?.isDeafened),
                            })
                          }
                        >
                          <img src="/icons/microphone.png" alt="" className="member-role-menu__icon" />
                          {targetVoiceState?.isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
                        </button>
                      )}
                      {canDeafenMember && (
                        <button
                          type="button"
                          className="member-role-menu__item"
                          onClick={() =>
                            updateMemberVoiceState(memberRoleMenu.memberUserId, {
                              isMicMuted: targetVoiceState?.isDeafened ? Boolean(targetVoiceState?.isMicMuted) : true,
                              isDeafened: !targetVoiceState?.isDeafened,
                            })
                          }
                        >
                          <img src="/icons/headphones.png" alt="" className="member-role-menu__icon" />
                          {targetVoiceState?.isDeafened ? "Вернуть звук" : "Отключить звук"}
                        </button>
                      )}
                      {assignableRoles.length > 0 && (
                        <>
                          <div className="member-role-menu__separator" />
                          <div className="member-role-menu__subtitle">Роль</div>
                          {assignableRoles.map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              className={`member-role-menu__item ${targetMember?.roleId === role.id ? "member-role-menu__item--active" : ""}`}
                              onClick={() => updateMemberRole(memberRoleMenu.memberUserId, role.id)}
                            >
                              <span className="member-role-menu__dot" style={{ backgroundColor: role.color || "#7b89a8" }} aria-hidden="true" />
                              {role.name}
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          <div className="servers-empty-sidebar">
            <h3>Серверов пока нет</h3>
            <p>Создайте первый сервер, и здесь появятся каналы, участники и настройки.</p>
            <button type="button" className="servers-empty-sidebar__button" onClick={handleAddServer}>Создать сервер</button>
          </div>
        )}

        {activeServer && (
          <>
            <div className="server-panel__section">
              <div className="server-panel__header">
                <span>Текстовые каналы</span>
                <button type="button" onClick={addTextChannel} disabled={!canManageChannels}>+</button>
              </div>
              <ul className="channel-list">
                {(activeServer?.textChannels || []).map((channel) => {
                  const isEditing = channelRenameState?.type === "text" && channelRenameState.channelId === channel.id;
                  return (
                    <li key={channel.id} className={`channel-item ${currentTextChannel?.id === channel.id ? "active-channel" : ""} ${isEditing ? "channel-item--editing" : ""}`}>
                      {isEditing ? (
                        <input
                          className="channel-inline-input"
                          type="text"
                          value={channelRenameState.value}
                          autoFocus
                          onChange={(event) => updateChannelRenameValue(event.target.value)}
                          onBlur={submitChannelRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submitChannelRename();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelChannelRename();
                            }
                          }}
                        />
                      ) : (
                        <button type="button" className="channel-item__button" onClick={() => { setWorkspaceMode("servers"); setCurrentTextChannelId(channel.id); setActiveDirectFriendId(""); }}>
                          {getChannelDisplayName(channel.name, "text")}
                        </button>
                      )}
                      <button type="button" className="channel-edit-button" onClick={() => startChannelRename("text", channel)} aria-label="Переименовать канал" disabled={!canManageChannels}>
                        <img src="/icons/settings.png" alt="" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="server-panel__section">
              <div className="server-panel__header">
                <span>Голосовые каналы</span>
                <button type="button" onClick={addVoiceChannel} disabled={!canManageChannels}>+</button>
              </div>
              <VoiceChannelList channels={activeServer?.voiceChannels || []} activeChannelId={currentVoiceChannel} participantsMap={activeVoiceParticipantsMap} serverId={activeServer?.id || ""} serverMembers={activeServer?.members || []} serverRoles={activeServer?.roles || []} onJoinChannel={joinVoiceChannel} onLeaveChannel={leaveVoiceChannel} onRenameChannel={startChannelRename} liveUserIds={liveUserIds} speakingUserIds={speakingUserIds} watchedStreamUserId={selectedStreamUserId} onWatchStream={handleWatchStream} canManageChannels={canManageChannels} editingChannelId={channelRenameState?.type === "voice" ? channelRenameState.channelId : ""} editingChannelValue={channelRenameState?.type === "voice" ? channelRenameState.value : ""} onRenameValueChange={updateChannelRenameValue} onRenameSubmit={submitChannelRename} onRenameCancel={cancelChannelRename} />
            </div>
          </>
        )}
      </div>

      {renderProfilePanel()}
    </aside>
  );
  const renderFriendsMain = () => (
    <main className="chat__wrapper chat__wrapper--friends">
      <div className="friends-layout">
        <section className="friends-main">
          <div className="friends-main__toolbar">
            <div className="friends-main__tabs">
              <button type="button" className={`friends-main__tab ${!activeDirectFriendId ? "friends-main__tab--active" : ""}`} onClick={() => { setActiveDirectFriendId(""); setFriendsPageSection("friends"); }}>
                Друзья
              </button>
              <button type="button" className={`friends-main__tab ${friendsPageSection === "add" && !activeDirectFriendId ? "friends-main__tab--accent" : ""}`} onClick={() => { setActiveDirectFriendId(""); setFriendsPageSection("add"); }}>
                Добавить в друзья
              </button>
            </div>
          </div>

          {currentDirectFriend ? (
            <div className="friends-main__chat">
              <div className="chat__header chat__header--friends">
                <h1>{getDisplayName(currentDirectFriend)}</h1>
                <span className="chat__subtitle">Личный чат между двумя пользователями</span>
              </div>
              <TextChat resolvedChannelId={currentDirectChannelId} user={user} />
            </div>
          ) : (
            <div className="friends-main__content">
              <div className="friends-hero">
                <h1>Добавить в друзья</h1>
                <p>Вы можете добавить друзей по email или открыть личный чат с уже добавленными контактами.</p>
                <form className="friends-hero__form" onSubmit={handleAddFriend}>
                  <input type="email" placeholder="Введите email друга" value={friendEmail} onChange={(event) => setFriendEmail(event.target.value)} />
                  <button type="submit" disabled={isAddingFriend}>{isAddingFriend ? "Отправляем..." : "Отправить запрос дружбы"}</button>
                </form>
                {friendsError ? <div className="friends-panel__error">{friendsError}</div> : null}
              </div>

              <div className="friends-discovery">
                <h2>Где ещё можно завести друзей</h2>
                <p>Если пока не с кем переписываться, можно открыть свои серверы или пригласить туда новых людей.</p>
                <button type="button" className="friends-discovery__card" onClick={() => setWorkspaceMode("servers")}>
                  <span className="friends-discovery__icon">◉</span>
                  <span>Исследуйте доступные серверы</span>
                  <span className="friends-discovery__arrow">›</span>
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="friends-contacts">
          <h3>Активные контакты</h3>
          {activeContacts.length ? (
            <div className="friends-contacts__list">
              {activeContacts.map((friend) => (
                <button key={friend.id} type="button" className="friends-contacts__item" onClick={() => openDirectChat(friend.id)}>
                  <img src={resolveMediaUrl(friend.avatar || "", DEFAULT_AVATAR)} alt={getDisplayName(friend)} />
                  <span>{getDisplayName(friend)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="friends-contacts__empty">
              <strong>Пока что тут тихо...</strong>
              <span>Когда друзья зайдут в голосовой чат или начнут активничать, они появятся здесь.</span>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
  const renderServerMain = () => (
    <main className="chat__wrapper chat__wrapper--servers">
      <div className="chat__box chat__box--servers">
        {activeServer ? (
          <div className="chat__topbar">
            <div className="chat__topbar-title">
              <span>#</span>
              <strong>{getChannelDisplayName(currentTextChannel?.name || "# channel", "text")}</strong>
            </div>
            <div className="chat__topbar-actions">
              <button type="button" className="chat__topbar-icon" onClick={() => setShowServerMembersPanel((previous) => !previous)}>👥</button>
              <button type="button" className="chat__topbar-icon" onClick={() => openSettingsPanel("server")}>⚙</button>
              <input className="chat__topbar-search" type="text" placeholder={`Искать «${activeServer?.name || "сервер"}»`} />
            </div>
          </div>
        ) : null}

        {!activeServer ? (
          <div className="server-empty-state">
            <div className="server-empty-state__badge">Серверы</div>
            <h1>У вас пока нет серверов</h1>
            <p>После регистрации список пустой. Создайте свой первый сервер вручную, и здесь появятся каналы и чат.</p>
            <button type="button" className="server-empty-state__button" onClick={handleAddServer}>Создать первый сервер</button>
          </div>
        ) : selectedStreamUserId ? (
          <ScreenShareViewer stream={selectedStream?.stream || null} videoSrc={selectedStream?.videoSrc || ""} imageSrc={selectedStream?.imageSrc || ""} hasAudio={Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length)} title={`Трансляция ${selectedStreamParticipant?.name || "участника"}`} subtitle="Просмотр видеопотока участника" onClose={() => setSelectedStreamUserId(null)} debugInfo={selectedStreamDebugInfo} />
        ) : (
          <>
            {currentTextChannel && <TextChat serverId={activeServer?.id} channelId={currentTextChannel.id} user={user} />}
          </>
        )}
      </div>
    </main>
  );

  return (
    <div className="menu__main">
      <aside className="sidebar__servers">
        <button type="button" className={`workspace-switch ${workspaceMode === "friends" ? "workspace-switch--active" : ""}`} onClick={() => setWorkspaceMode("friends")} title="Друзья">
          <img src="/icons/sms.svg" alt="" />
          <span>Друзья</span>
        </button>
        <button type="button" className={`workspace-logo ${workspaceMode === "servers" ? "workspace-logo--active" : ""}`} title="MAX" onClick={() => setWorkspaceMode("servers")}>
          <span className="workspace-logo__mark" aria-hidden="true">MAX</span>
        </button>
        {workspaceMode === "servers" && servers.map((server) => (
          <button key={server.id} type="button" className={`btn__server ${server.id === activeServer?.id ? "btn__server--active" : ""}`} onClick={() => { setWorkspaceMode("servers"); setActiveServerId(server.id); setCurrentTextChannelId(server.textChannels[0]?.id || ""); setActiveDirectFriendId(""); }} title={server.name || "Без названия"}>
            {server.icon ? <img src={resolveMediaUrl(server.icon, DEFAULT_SERVER_ICON)} alt={server.name || "Без названия"} /> : <span className="btn__server-empty" aria-hidden="true" />}
          </button>
        ))}
        <button type="button" className="btn__create-server" aria-label="Создать сервер" onClick={handleAddServer}>+</button>
        <button type="button" className="logout" aria-label="Выйти" onClick={handleLogout}><img src="/icons/logout.png" alt="logout" /></button>
      </aside>
      {workspaceMode === "friends" ? renderFriendsSidebar() : renderServersSidebar()}
      {workspaceMode === "friends" ? renderFriendsMain() : renderServerMain()}

      {openSettings && (
        <div className="settings-backdrop" onClick={() => setOpenSettings(false)}>
          <div ref={popupRef} className="settings-popup settings-popup--shell" onClick={(event) => event.stopPropagation()}>
            <aside className="settings-shell__sidebar">
              <div className="settings-shell__profile">
                <img src={avatarSrc} alt={getDisplayName(user)} />
                <div>
                  <strong>{getDisplayName(user)}</strong>
                  <span>Редактировать профиль...</span>
                </div>
              </div>
              <input className="settings-shell__search" type="text" placeholder="Поиск" />

              {Object.entries(settingsNavSections).map(([section, items]) => (
                <div key={section} className="settings-shell__nav-group">
                  <span className="settings-shell__nav-label">{section}</span>
                  <div className="settings-shell__nav-list">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`settings-shell__nav-item ${settingsTab === item.id ? "settings-shell__nav-item--active" : ""}`}
                        onClick={() => setSettingsTab(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </aside>

            <div className="settings-shell__main">
              <div className="settings-shell__closebar">
                <button type="button" className="settings-popup__close" onClick={() => setOpenSettings(false)}>×</button>
              </div>
              {renderSettingsContent()}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="stream-modal" onClick={(event) => event.stopPropagation()}>
            <div className="stream-modal__header">
              <h3>Настройки трансляции</h3>
              <button type="button" className="stream-modal__close" onClick={() => setShowModal(false)}>x</button>
            </div>
            <label className="stream-modal__field">
              <span>Разрешение</span>
              <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
                {STREAM_RESOLUTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{`${option.label} | ${option.description}`}</option>
                ))}
              </select>
            </label>
            <label className="stream-modal__field">
              <span>FPS</span>
              <select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
                {STREAM_FPS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="stream-modal__check">
              <input type="checkbox" checked={shareStreamAudio} onChange={(event) => setShareStreamAudio(event.target.checked)} />
              <span>Передавать звук экрана, если система это поддерживает</span>
            </label>
            <div className="stream-modal__hint">
              {`${selectedResolutionOption.label} | ${selectedResolutionOption.description} | ${fps} FPS`}
            </div>
            <ScreenShareButton onStart={startScreenShare} onStop={stopScreenShare} isActive={isScreenShareActive} disabled={!currentVoiceChannel} />
            <div className="stream-modal__status">{activeStreamCount > 0 ? `Активных трансляций: ${activeStreamCount}` : "Сейчас трансляций нет"}</div>
            {!currentVoiceChannel && <div className="stream-modal__hint">Сначала подключитесь к голосовому каналу.</div>}
            {isCameraShareActive ? <div className="stream-modal__hint">Сейчас у вас уже идет трансляция камеры. Запуск экрана заменит ее.</div> : null}
          </div>
        </div>
      )}

      {showCameraModal && (
        <div className="modal-backdrop" onClick={closeCameraModal}>
          <div className="camera-modal" onClick={(event) => event.stopPropagation()}>
            <div className="camera-modal__header">
              <div>
                <h3>Камера</h3>
                <p>Выберите веб-камеру или виртуальную камеру. Если установлен Camo, он появится здесь как обычное устройство.</p>
              </div>
              <button type="button" className="stream-modal__close" onClick={closeCameraModal}>
                x
              </button>
            </div>

            <label className="camera-modal__field">
              <span>Устройство камеры</span>
              <select value={selectedVideoDeviceId} onChange={(event) => setSelectedVideoDeviceId(event.target.value)}>
                {cameraDevices.length > 0 ? (
                  cameraDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))
                ) : (
                  <option value="">Камера не найдена</option>
                )}
              </select>
            </label>

            <div className="camera-modal__preview">
              <video ref={cameraPreviewRef} className="camera-modal__video" autoPlay playsInline muted />
              {!hasCameraPreview && (
                <div className="camera-modal__placeholder">
                  <span>
                    {isCameraShareActive
                      ? "Камера уже транслируется в голосовой канал. Здесь можно выбрать другое устройство или остановить эфир."
                      : "Предпросмотр появится здесь после выбора камеры."}
                  </span>
                </div>
              )}
            </div>

            {cameraError ? <div className="camera-modal__error">{cameraError}</div> : null}

            <div className="camera-modal__actions">
              <button type="button" className="stream-modal__action" onClick={() => startCameraPreview(selectedVideoDeviceId)}>
                Обновить предпросмотр
              </button>
              <button
                type="button"
                className={`stream-modal__action ${isCameraShareActive ? "stream-modal__action--danger" : ""}`}
                onClick={isCameraShareActive ? stopCameraShare : startCameraShare}
                disabled={!currentVoiceChannel || (!hasCameraPreview && !isCameraShareActive)}
              >
                {isCameraShareActive ? "Остановить трансляцию камеры" : "Начать трансляцию камеры"}
              </button>
            </div>

            <div className="stream-modal__status">
              {isCameraShareActive
                ? "Камера уже идет в эфир и видна участникам голосового канала."
                : currentVoiceChannel
                  ? "После запуска камера появится в голосовом канале как обычная LIVE-трансляция."
                  : "Сначала подключитесь к голосовому каналу."}
            </div>
            {isScreenShareActive ? (
              <div className="stream-modal__hint">Запуск камеры заменит текущую трансляцию экрана.</div>
            ) : null}
          </div>
        </div>
      )}

      {directMessageToasts.length > 0 && (
        <div className="direct-toast-stack">
          {directMessageToasts.map((toast) => (
            <div key={toast.id} className="direct-toast">
              <button
                type="button"
                className="direct-toast__main"
                onClick={() => {
                  openDirectChat(toast.friend.id);
                  dismissDirectToast(toast.id);
                }}
              >
                <img
                  className="direct-toast__avatar"
                  src={resolveMediaUrl(getUserAvatar(toast.friend), DEFAULT_AVATAR)}
                  alt={getDisplayName(toast.friend)}
                />
                <span className="direct-toast__content">
                  <span className="direct-toast__title">{getDisplayName(toast.friend)}</span>
                  <span className="direct-toast__text">{toast.preview}</span>
                </span>
              </button>
              <button
                type="button"
                className="direct-toast__close"
                onClick={() => dismissDirectToast(toast.id)}
                aria-label="Закрыть уведомление"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}





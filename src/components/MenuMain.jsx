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
const createDirectToastId = () => `dm-toast-${Math.random().toString(36).slice(2, 10)}`;
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
  if (!Array.isArray(value) || value.length === 0) return [createDefaultServer(currentUser)];
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
    return raw ? normalizeServers(JSON.parse(raw), user) : [createDefaultServer(user)];
  } catch {
    return [createDefaultServer(user)];
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
const uiSoundCache = new Map();

export default function MenuMain({ user, setUser, onLogout }) {
  const [servers, setServers] = useState(() => readStoredServers(user));
  const [activeServerId, setActiveServerId] = useState(
    () => localStorage.getItem(getActiveServerStorageKey(user)) || readStoredServers(user)[0]?.id || "server-main"
  );
  const [currentTextChannelId, setCurrentTextChannelId] = useState(() => readStoredServers(user)[0]?.textChannels?.[0]?.id || "1");
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState(null);
  const [participantsMap, setParticipantsMap] = useState({});
  const [openSettings, setOpenSettings] = useState(false);
  const [micVolume, setMicVolume] = useState(70);
  const [audioVolume, setAudioVolume] = useState(100);
  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState("transparent");
  const [showNoiseMenu, setShowNoiseMenu] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [resolution, setResolution] = useState("1080p");
  const [fps, setFps] = useState(60);
  const [shareStreamAudio, setShareStreamAudio] = useState(false);
  const [remoteScreenShares, setRemoteScreenShares] = useState([]);
  const [announcedLiveUserIds, setAnnouncedLiveUserIds] = useState([]);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
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

  const popupRef = useRef(null);
  const serverMembersRef = useRef(null);
  const memberRoleMenuRef = useRef(null);
  const noiseMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const serverIconInputRef = useRef(null);
  const voiceClientRef = useRef(null);
  const previousVoiceChannelRef = useRef(null);
  const previousScreenShareRef = useRef(false);
  const joinedDirectChannelsRef = useRef(new Set());
  const directToastTimeoutsRef = useRef(new Map());
  const serversStorageKey = useMemo(() => getServersStorageKey(user), [user?.id, user?.email]);
  const activeServerStorageKey = useMemo(() => getActiveServerStorageKey(user), [user?.id, user?.email]);
  const noiseSuppressionStorageKey = useMemo(() => getNoiseSuppressionStorageKey(user), [user?.id, user?.email]);
  const directNotificationsStorageKey = useMemo(() => getDirectNotificationsStorageKey(user), [user?.id, user?.email]);
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
        : [createDefaultServer(user)];
      const nextActiveServerId =
        localStorage.getItem(activeServerStorageKey) ||
        nextServers[0]?.id ||
        "server-main";
      const nextActiveServer = nextServers.find((server) => server.id === nextActiveServerId) || nextServers[0];

      setServers(nextServers);
      setActiveServerId(nextActiveServerId);
      setCurrentTextChannelId(nextActiveServer?.textChannels?.[0]?.id || "1");
    } catch (error) {
      console.error("Ошибка загрузки пользовательских серверов:", error);
      const fallback = [createDefaultServer(user)];
      setServers(fallback);
      setActiveServerId(fallback[0].id);
      setCurrentTextChannelId(fallback[0]?.textChannels?.[0]?.id || "1");
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
    if (!user || !activeServerId) return;
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
      const fallback = createDefaultServer(user);
      setServers([fallback]);
      setActiveServerId(fallback.id);
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

      if (popupRef.current && !insidePopup) setOpenSettings(false);
      if (serverMembersRef.current && !insideServerPanel && !insideMemberMenu) setShowServerMembersPanel(false);
      if (!insideMemberMenu) setMemberRoleMenu(null);
      if (!insideNoiseMenu) setShowNoiseMenu(false);
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
    });
    voiceClientRef.current = client;
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
    voiceClientRef.current?.setMicrophoneVolume(isMicMuted || isSoundMuted ? 0 : micVolume);
  }, [micVolume, isMicMuted, isSoundMuted]);
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
  const openSettingsPanel = () => setOpenSettings(true);
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
    const fallbackServers = nextServers.length ? nextServers : [createDefaultServer(user)];
    const nextActiveId = activeServerId === serverId ? fallbackServers[0].id : activeServerId;
    const nextActiveServer = fallbackServers.find((server) => server.id === nextActiveId) || fallbackServers[0];
    setServers(fallbackServers);
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
    voiceClientRef.current?.setMicrophoneVolume(isMicMuted || isSoundMuted ? 0 : value);
  };
  const updateAudioVolume = (value) => {
    setAudioVolume(value);
    voiceClientRef.current?.setRemoteVolume(isSoundMuted ? 0 : value);
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
    if (!voiceClientRef.current || !user?.id || !channel?.id) return;
    try { await voiceClientRef.current.joinChannel(channel.id, user); } catch (error) { console.error("Ошибка входа в голосовой канал:", error); }
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
    if (isSharingScreen) {
      await stopScreenShare();
      return;
    }

    setShowModal(true);
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

  return (
    <div className="menu__main">
      <aside className="sidebar__servers">
        {servers.map((server) => (
          <button key={server.id} type="button" className={`btn__server ${server.id === activeServer?.id ? "btn__server--active" : ""}`} onClick={() => { setActiveServerId(server.id); setCurrentTextChannelId(server.textChannels[0]?.id || ""); setActiveDirectFriendId(""); }} title={server.name || "Без названия"}>
            {server.icon ? <img src={resolveMediaUrl(server.icon, DEFAULT_SERVER_ICON)} alt={server.name || "Без названия"} /> : <span className="btn__server-empty" aria-hidden="true" />}
          </button>
        ))}
        <button type="button" className="btn__create-server" aria-label="Создать сервер" onClick={handleAddServer}>+</button>
        <button type="button" className="logout" aria-label="Выйти" onClick={handleLogout}><img src="/icons/logout.png" alt="logout" /></button>
      </aside>

      <aside className="sidebar__channels">
        <div className="channels__top">
          {activeServer && (
            <div className="server-summary-wrap" ref={serverMembersRef}>
              <button type="button" className="server-summary" onClick={() => setShowServerMembersPanel((previous) => !previous)}>
                {activeServer.icon ? <img className="server-summary__icon" src={resolveMediaUrl(activeServer.icon, DEFAULT_SERVER_ICON)} alt={activeServer.name || "Server"} /> : <div className="server-summary__icon server-summary__icon--empty" aria-hidden="true" />}
                <div className="server-summary__content">
                  <div className="server-summary__name">{activeServer.name || "Server"}</div>
                  <div className="server-summary__subtitle">Активный сервер</div>
                </div>
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
                              <span className="server-members-panel__voice-flag" title="Микрофон выключен">
                                <img src="/icons/microphone.png" alt="" />
                              </span>
                            )}
                            {memberVoiceState?.isDeafened && (
                              <span className="server-members-panel__voice-flag" title="Не слышит участников">
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
                          <button
                            type="button"
                            className="member-role-menu__item"
                            onClick={() => updateMemberNickname(memberRoleMenu.memberUserId)}
                          >
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
          )}

          <div className="friends-panel">
            <div className="channel-heading">
              <h2>Друзья</h2>
              <span className="friends-panel__count">{friends.length}</span>
            </div>

            <form className="friends-panel__form" onSubmit={handleAddFriend}>
              <input
                className="friends-panel__input"
                type="email"
                placeholder="Email друга"
                value={friendEmail}
                onChange={(event) => setFriendEmail(event.target.value)}
              />
              <button type="submit" className="friends-panel__add" disabled={isAddingFriend}>
                {isAddingFriend ? "..." : "+"}
              </button>
            </form>

            {friendsError ? <div className="friends-panel__error">{friendsError}</div> : null}

            <div className="friends-panel__list">
              {friends.length ? (
                friends.map((friend) => {
                  const isDirectActive = String(activeDirectFriendId) === String(friend.id);
                  return (
                    <div key={friend.id} className={`friends-panel__item ${isDirectActive ? "friends-panel__item--active" : ""}`}>
                      <button type="button" className="friends-panel__main" onClick={() => openDirectChat(friend.id)}>
                        <img
                          className="friends-panel__avatar"
                          src={resolveMediaUrl(friend.avatar || "", DEFAULT_AVATAR)}
                          alt={getDisplayName(friend)}
                        />
                        <span className="friends-panel__meta">
                          <span className="friends-panel__name">{getDisplayName(friend)}</span>
                          <span className="friends-panel__email">{friend.email}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="friends-panel__chat"
                        onClick={() => openDirectChat(friend.id)}
                        aria-label={`Личный чат с ${getDisplayName(friend)}`}
                        title="Личный чат"
                      >
                        <img src="/icons/sms.svg" alt="" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="friends-panel__empty">Добавьте первого друга по email.</div>
              )}
            </div>
          </div>

          <div className="text__channel">
            <h1>Каналы</h1>
            <div className="channel-heading">
              <h2>Текстовые каналы</h2>
              <button type="button" className="channel-add-button" onClick={addTextChannel} disabled={!canManageChannels}>+</button>
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
                      <button type="button" className="channel-item__button" onClick={() => { setCurrentTextChannelId(channel.id); setActiveDirectFriendId(""); }}>
                        {getChannelDisplayName(channel.name, "text")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="channel-edit-button"
                      onClick={() => startChannelRename("text", channel)}
                      aria-label="Переименовать канал"
                      disabled={!canManageChannels}
                    >
                      <img src="/icons/settings.png" alt="" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="voice__channels">
            <div className="channel-heading">
              <h2>Голосовые каналы</h2>
              <button type="button" className="channel-add-button" onClick={addVoiceChannel} disabled={!canManageChannels}>+</button>
            </div>
            <VoiceChannelList channels={activeServer?.voiceChannels || []} activeChannelId={currentVoiceChannel} participantsMap={activeVoiceParticipantsMap} serverId={activeServer?.id || ""} serverMembers={activeServer?.members || []} serverRoles={activeServer?.roles || []} onJoinChannel={joinVoiceChannel} onLeaveChannel={leaveVoiceChannel} onRenameChannel={startChannelRename} liveUserIds={liveUserIds} speakingUserIds={speakingUserIds} watchedStreamUserId={selectedStreamUserId} onWatchStream={handleWatchStream} canManageChannels={canManageChannels} editingChannelId={channelRenameState?.type === "voice" ? channelRenameState.channelId : ""} editingChannelValue={channelRenameState?.type === "voice" ? channelRenameState.value : ""} onRenameValueChange={updateChannelRenameValue} onRenameSubmit={submitChannelRename} onRenameCancel={cancelChannelRename} />
          </div>
        </div>

        <div className="menu__profile-wrapper">
          <div className="menu__profile">
            <div className="profile__top">
              <div className="profile__monitoring">
                <div className="wrap__wifi ping-indicator">
                  <img className="wifi" src="/icons/wifi.png" alt="wifi" />
                  <div className="wifi-tooltip">{pingMs !== null ? `Пинг: ${pingMs} ms` : "Сервер недоступен"}</div>
                </div>
                <div className="wrap__connect"><span className="voice__monitoring">{currentVoiceChannelName ? `Подключено к: ${currentVoiceChannelName}` : "Не подключено"}</span></div>
              </div>

              <div className="profile__icons">
                <button type="button" className="wrap__icon" onClick={() => setOpenSettings((previous) => !previous)}><img src="/icons/settings.png" alt="settings" className="icon__settings" /></button>
                <button
                  type="button"
                  className={`wrap__icon ${isMicMuted || isSoundMuted ? "wrap__icon--danger wrap__icon--slashed" : ""}`}
                  onClick={toggleMicMute}
                  disabled={(isMicMuted && (isMicForced || isSoundForced)) || (isSoundMuted && isSoundForced)}
                  title={(isMicMuted && (isMicForced || isSoundForced)) || (isSoundMuted && isSoundForced) ? "Микрофон отключён администратором" : "Микрофон"}
                >
                  <img src="/icons/microphone.png" alt="microphone" className="icon__phone" />
                </button>
                <button
                  type="button"
                  className={`wrap__icon ${isSoundMuted ? "wrap__icon--danger wrap__icon--slashed" : ""}`}
                  onClick={toggleSoundMute}
                  disabled={isSoundMuted && isSoundForced}
                  title={isSoundMuted && isSoundForced ? "Звук отключён администратором" : "Звук"}
                >
                  <img src="/icons/volumespeacker.png" alt="volume" className="icon__volumespeacker" />
                </button>
                <button type="button" className={`wrap__icon ${isSharingScreen ? "wrap__icon--danger" : ""}`} onClick={handleScreenShareAction}><img src={isSharingScreen ? "/icons/close.svg" : "/icons/monitor.svg"} alt={isSharingScreen ? "stop stream" : "start stream"} className="icon__camera" /></button>
              </div>
            </div>

            <div className="profile__bottom">
              <div className="profile__user">
                <img className={`avatar ${isCurrentUserSpeaking ? "avatar--speaking" : ""}`} src={avatarSrc} alt="avatar" onClick={() => avatarInputRef.current?.click()} />
                <input type="file" accept="image/*" ref={avatarInputRef} className="hidden-input" onChange={handleAvatarChange} />
                <input ref={serverIconInputRef} type="file" accept="image/*" className="hidden-input" onChange={handleServerIconChange} />
                <div className="profile__names">
                  <span className="profile__username">{getDisplayName(user)}</span>
                  <div className="status__profile">
                    <span>{currentServerRole?.name || "Member"}</span>
                    <span
                      className="status__role-dot"
                      style={{ backgroundColor: currentServerRole?.color || "#7b89a8" }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>
              <div className="profile__bottom-actions">
                <div className="noise-menu noise-menu--profile" ref={noiseMenuRef}>
                  <button
                    type="button"
                    className={`wrap__icon noise-toggle ${noiseSuppressionMode === "voice_isolation" ? "noise-toggle--active" : ""}`}
                    onClick={() => setShowNoiseMenu((previous) => !previous)}
                    title={noiseSuppressionMode === "voice_isolation" ? "Изоляция голоса" : "Прозрачный режим"}
                    aria-label="Шумоподавление"
                    aria-expanded={showNoiseMenu}
                  >
                    <span className="noise-toggle__bars" aria-hidden="true">
                      <span className="noise-toggle__bar noise-toggle__bar--1" />
                      <span className="noise-toggle__bar noise-toggle__bar--2" />
                      <span className="noise-toggle__bar noise-toggle__bar--3" />
                    </span>
                  </button>
                  {showNoiseMenu && (
                    <div className="noise-menu__panel">
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
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="chat__wrapper">
        <div className="chat__box">
          {selectedStreamUserId ? (
            <ScreenShareViewer stream={selectedStream?.stream || null} videoSrc={selectedStream?.videoSrc || ""} imageSrc={selectedStream?.imageSrc || ""} hasAudio={Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length)} title={`Трансляция ${selectedStreamParticipant?.name || "участника"}`} subtitle="Просмотр экрана участника" onClose={() => setSelectedStreamUserId(null)} debugInfo={selectedStreamDebugInfo} />
          ) : currentDirectFriend ? (
            <>
              <div className="chat__header">
                <h1>{getDisplayName(currentDirectFriend)}</h1>
                <span className="chat__subtitle">Личный чат между двумя пользователями</span>
              </div>
              <TextChat resolvedChannelId={currentDirectChannelId} user={user} />
            </>
          ) : (
            <>
              <div className="chat__header">
                <h1>{getChannelDisplayName(currentTextChannel?.name || "# channel", "text")}</h1>
                <span className="chat__subtitle">Общий чат сервера</span>
              </div>
              {currentTextChannel && <TextChat serverId={activeServer?.id} channelId={currentTextChannel.id} user={user} />}
            </>
          )}
        </div>
      </main>

      {openSettings && (
        <div className="settings-backdrop" onClick={() => setOpenSettings(false)}>
        <div ref={popupRef} className="settings-popup settings-popup--expanded" onClick={(event) => event.stopPropagation()}>
          <div className="settings-popup__header">
            <h3>Настройки</h3>
            <button type="button" className="settings-popup__close" onClick={() => setOpenSettings(false)}>x</button>
          </div>

          <div className="settings-section">
            <div className="settings-section__header">
              <h4>Роли и доступ</h4>
              <div className="settings-section__actions">
                <span className="settings-role-current">{currentServerRole?.name || "Member"}</span>
                <button type="button" className="settings-inline-button" onClick={() => setRolesExpanded((previous) => !previous)}>
                  {rolesExpanded ? "Свернуть" : "Развернуть"}
                </button>
              </div>
            </div>
            {rolesExpanded && (
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
            )}
            <div className="settings-helper">
              Иерархия ролей: owner {">"} admin {">"} moderator {">"} member.
            </div>
          </div>

          <ServerInvitesPanel
            activeServer={activeServer}
            user={user}
            canInvite={canInviteMembers && !isDefaultServer}
            onImportServer={handleImportServer}
            onServerShared={markServerAsShared}
          />

          <div className="settings-section">
            <div className="settings-section__header">
              <h4>Участники</h4>
              <span className="settings-role-current">{activeServer?.members?.length || 0}</span>
            </div>
            <div className="settings-list">
              {(activeServer?.members || []).map((member) => {
                const memberRole = activeServer?.roles?.find((role) => role.id === member.roleId);
                const canMuteMember = canManageTargetMember(activeServer, currentUserId, member.userId, "mute_members");
                const canDeafenMember = canManageTargetMember(activeServer, currentUserId, member.userId, "deafen_members");
                return (
                  <div key={member.userId} className="settings-list__row settings-list__row--stacked">
                    <div className="settings-role-meta">
                      <span className="settings-member-name">{member.name}</span>
                      <span className="settings-role-description">{memberRole?.name || member.roleId || "Member"}</span>
                      {(canMuteMember || canDeafenMember) && (
                        <span className="settings-helper">
                          {[
                            canMuteMember ? "mute" : null,
                            canDeafenMember ? "deafen" : null,
                          ]
                            .filter(Boolean)
                            .join(" | ")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="settings-section">
            <h4>Звук</h4>
            <label className="settings-field">
              <span>Громкость микрофона: {micVolume}%</span>
              <input type="range" min="0" max="100" value={micVolume} onChange={(event) => updateMicVolume(Number(event.target.value))} />
            </label>
            <label className="settings-field">
              <span>Общая громкость: {audioVolume}%</span>
              <input type="range" min="0" max="100" value={audioVolume} onChange={(event) => updateAudioVolume(Number(event.target.value))} />
            </label>
          </div>

          <div className="settings-section">
            <div className="settings-section__header">
              <h4>Уведомления</h4>
              <span className="settings-role-current">{directNotificationsEnabled ? "Вкл" : "Выкл"}</span>
            </div>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={directNotificationsEnabled}
                onChange={(event) => setDirectNotificationsEnabled(event.target.checked)}
              />
              <span>Личные чаты</span>
            </label>
            <div className="settings-helper">
              Уведомления показываются только для новых сообщений в личных чатах, которые сейчас не открыты.
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section__header">
              <h4>Сервер</h4>
              <button type="button" className="settings-inline-button" onClick={() => serverIconInputRef.current?.click()}>Сменить картинку</button>
            </div>
            <div className="settings-server-card">
              {activeServer?.icon ? <img className="settings-server-card__icon" src={resolveMediaUrl(activeServer.icon, DEFAULT_SERVER_ICON)} alt={activeServer?.name || "Без названия"} /> : <div className="settings-server-card__icon settings-server-card__icon--empty" aria-hidden="true" />}
              <label className="settings-field settings-field--tight">
                <span>Название сервера</span>
                <input className="settings-input" type="text" value={activeServer?.name || ""} onChange={(event) => updateActiveServerName(event.target.value)} disabled={!canManageServer} />
              </label>
              <div className="settings-server-card__actions">
                <button type="button" className="settings-inline-button settings-inline-button--danger" onClick={() => handleDeleteServer(activeServer?.id)}>Удалить сервер</button>
              </div>
            </div>
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
            <ScreenShareButton onStart={startScreenShare} onStop={stopScreenShare} isActive={isSharingScreen} disabled={!currentVoiceChannel} />
            <div className="stream-modal__status">{activeStreamCount > 0 ? `Активных трансляций: ${activeStreamCount}` : "Сейчас трансляций нет"}</div>
            {!currentVoiceChannel && <div className="stream-modal__hint">Сначала подключитесь к голосовому каналу.</div>}
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





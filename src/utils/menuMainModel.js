import { DEFAULT_SERVER_ICON, resolveStaticAssetUrl } from "./media";
import { normalizeMediaFrame, parseMediaFrame } from "./mediaFrames";
import { getStoredUser } from "./auth";
export const SERVERS_STORAGE_KEY = "nd_servers_v2";
export const ACTIVE_SERVER_STORAGE_KEY = "nd_active_server_id";
export const NOISE_SUPPRESSION_STORAGE_KEY = "nd_noise_suppression_mode";
export const ECHO_CANCELLATION_STORAGE_KEY = "nd_echo_cancellation_enabled";
export const DIRECT_NOTIFICATIONS_STORAGE_KEY = "nd_direct_notifications";
export const SERVER_NOTIFICATIONS_STORAGE_KEY = "nd_server_notifications";
export const NOTIFICATION_SOUND_ENABLED_STORAGE_KEY = "nd_notification_sound_enabled";
export const NOTIFICATION_SOUND_STORAGE_KEY = "nd_notification_sound";
export const NOTIFICATION_SOUND_CUSTOM_DATA_STORAGE_KEY = "nd_notification_sound_custom_data";
export const NOTIFICATION_SOUND_CUSTOM_NAME_STORAGE_KEY = "nd_notification_sound_custom_name";
export const AUDIO_INPUT_DEVICE_STORAGE_KEY = "nd_audio_input_device";
export const AUDIO_OUTPUT_DEVICE_STORAGE_KEY = "nd_audio_output_device";
export const VIDEO_INPUT_DEVICE_STORAGE_KEY = "nd_video_input_device";
export const MAX_PROFILE_NAME_LENGTH = 32;
export const VOICE_INPUT_MODES = ["broadcast", "voice_isolation", "rnnoise", "hard_gate", "transparent"];
export const DEFAULT_TEXT_CHANNELS = [
  { id: "1", name: "general" },
  { id: "2", name: "gaming" },
  { id: "3", name: "music-chat" },
  { id: "4", name: "off-topic" },
];
export const DEFAULT_VOICE_CHANNELS = [
  { id: "general_voice", name: "general_voice" },
  { id: "gaming", name: "gaming" },
  { id: "music-chat", name: "music-chat" },
];
export const STREAM_RESOLUTION_OPTIONS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "1440p", label: "1440p" },
  { value: "2160p", label: "2160p" },
];
export const STREAM_FPS_OPTIONS = [
  { value: 30, label: "30 FPS" },
  { value: 60, label: "60 FPS" },
];
export const NOTIFICATION_SOUND_OPTIONS = [
  { id: "soft", label: "Мягкий", path: resolveStaticAssetUrl("/sounds/notification-soft.ogg") },
  { id: "pulse", label: "Пульс", path: resolveStaticAssetUrl("/sounds/notification-pulse.ogg") },
  { id: "minimal", label: "Минимал", path: resolveStaticAssetUrl("/sounds/notification-minimal.ogg") },
];
export const DEFAULT_SERVER_ROLES = [
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
export const ROLE_PERMISSION_LABELS = {
  manage_server: "Управление сервером",
  manage_channels: "Управление каналами",
  manage_roles: "Управление ролями",
  manage_messages: "Управление сообщениями",
  manage_nicknames: "Управление никами",
  invite_members: "Приглашение участников",
};
export const MOBILE_VIEWPORT_QUERY = "(max-width: 900px)";

ROLE_PERMISSION_LABELS.mute_members = "Управление микрофоном";
ROLE_PERMISSION_LABELS.deafen_members = "Отключение звука участникам";
ROLE_PERMISSION_LABELS.move_members = "Перемещение участников";
export const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
export const getDisplayName = (user) => {
  if (user?.isSelf) {
    return "Избранное";
  }

  const nickname = String(user?.nickname || user?.nick_name || "").trim();
  if (nickname) {
    return nickname;
  }

  const firstName = String(user?.firstName || user?.first_name || "").trim();
  const lastName = String(user?.lastName || user?.last_name || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || user?.name || user?.email || "User";
};
export const getUserAvatar = (user) => user?.avatarUrl || user?.avatar || "";
export const getUserAvatarFrame = (user) =>
  parseMediaFrame(user?.avatarFrame, user?.avatar_frame, user?.avatarFrameJson, user?.avatar_frame_json);
export const getUserProfileBackground = (user) =>
  user?.profileBackgroundUrl || user?.profile_background_url || user?.profileBackground || "";
export const getUserProfileBackgroundFrame = (user) =>
  parseMediaFrame(
    user?.profileBackgroundFrame,
    user?.profile_background_frame,
    user?.profileBackgroundFrameJson,
    user?.profile_background_frame_json
  );
export const getServerIconFrame = (server) =>
  parseMediaFrame(server?.iconFrame, server?.icon_frame, server?.iconFrameJson, server?.icon_frame_json);
export const getCurrentUserId = (user) => String(user?.id || user?.email || "");
export const getScopedChatChannelId = (serverId, channelId) =>
  serverId && channelId ? `server:${serverId}::channel:${channelId}` : "";
export const getScopedVoiceChannelId = (serverId, channelId) => (serverId && channelId ? `${serverId}::${channelId}` : channelId);
export const isValidProfileName = (value) => /^[\p{L}\p{M}'-]+$/u.test(value);
export const getFriendSearchModeForQuery = (value) =>
  String(value || "").includes("@") ? "email" : "name";
export const parseFriendSearchInput = (value) => {
  const rawValue = String(value || "");
  const trimmedValue = rawValue.trim();
  const mode = getFriendSearchModeForQuery(trimmedValue);
  const normalizedQuery =
    mode === "email"
      ? trimmedValue.replace(/^@+/, "").trim().toLowerCase()
      : trimmedValue;

  return { mode, normalizedQuery };
};
export const getUserStorageScope = (user) => String(user?.id || user?.email || "guest");
export const sanitizeScopeFragment = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "guest";
export const isReservedDefaultServerId = (serverId) => /^server-main(?:-|$)/.test(String(serverId || ""));
export const getScopedDefaultServerId = (user) =>
  `server-main-${sanitizeScopeFragment(getUserStorageScope(user))}`;
export const getScopedPrivateServerId = (serverId, user) => {
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
export const normalizeTextChannelName = (value, fallback = "new-channel") => {
  const normalizedValue = String(value || "")
    .replace(/^#+\s*/, "")
    .trim();
  return normalizedValue || fallback;
};
export const getCanonicalSharedServerId = (serverId, ownerUserId) => {
  const normalizedServerId = String(serverId || "").trim();
  const normalizedOwnerScope = sanitizeScopeFragment(ownerUserId);
  const scopedPrefix = `server-${normalizedOwnerScope}-`;

  if (!normalizedOwnerScope || normalizedServerId.startsWith("server-main-")) {
    return normalizedServerId;
  }

  if (!normalizedServerId.toLowerCase().startsWith(scopedPrefix.toLowerCase())) {
    return normalizedServerId;
  }

  const suffix = normalizedServerId.slice(scopedPrefix.length).trim();
  return suffix ? `server-${suffix}` : normalizedServerId;
};
export const getNoiseSuppressionStorageKey = (user) => `${NOISE_SUPPRESSION_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getEchoCancellationStorageKey = (user) => `${ECHO_CANCELLATION_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getDirectNotificationsStorageKey = (user) => `${DIRECT_NOTIFICATIONS_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getServerNotificationsStorageKey = (user) => `${SERVER_NOTIFICATIONS_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getNotificationSoundEnabledStorageKey = (user) => `${NOTIFICATION_SOUND_ENABLED_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getNotificationSoundStorageKey = (user) => `${NOTIFICATION_SOUND_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getNotificationSoundCustomDataStorageKey = (user) => `${NOTIFICATION_SOUND_CUSTOM_DATA_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getNotificationSoundCustomNameStorageKey = (user) => `${NOTIFICATION_SOUND_CUSTOM_NAME_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getAudioInputDeviceStorageKey = (user) => `${AUDIO_INPUT_DEVICE_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getAudioOutputDeviceStorageKey = (user) => `${AUDIO_OUTPUT_DEVICE_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getVideoInputDeviceStorageKey = (user) => `${VIDEO_INPUT_DEVICE_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const createDirectToastId = () => `dm-toast-${Math.random().toString(36).slice(2, 10)}`;
export const createServerToastId = () => `server-toast-${Math.random().toString(36).slice(2, 10)}`;
export const getMeterActiveBars = (level, total) => {
  const normalizedLevel = Math.max(0, Math.min(1, Number(level) || 0));
  return Math.max(0, Math.min(total, Math.round(normalizedLevel * total)));
};
export const getPingTone = (pingMs) => {
  const normalizedPing = Number(pingMs);
  if (!Number.isFinite(normalizedPing) || normalizedPing <= 0) {
    return "unknown";
  }

  if (normalizedPing <= 70) {
    return "good";
  }

  if (normalizedPing <= 150) {
    return "medium";
  }

  return "poor";
};
export const isPersonalDefaultServer = (server, user) => {
  if (!server) {
    return false;
  }

  return String(server.id || "") === getScopedDefaultServerId(user) || (!server.isShared && isReservedDefaultServerId(server.id));
};
export const readSessionUser = () => {
  return getStoredUser();
};
export const createDefaultRoles = () => DEFAULT_SERVER_ROLES.map((role) => ({ ...role, permissions: [...role.permissions] }));
export const createServerMember = (user, roleId = "owner") => ({
  userId: getCurrentUserId(user),
  name: getDisplayName(user),
  avatar: getUserAvatar(user),
  roleId,
});
export const normalizeRoles = (roles) => {
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
export const normalizeMembers = (members, fallbackUser) => {
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
export const inferSharedServer = (server, currentUser) => {
  if (server?.isShared === true || server?.IsShared === true) {
    return true;
  }

  const currentUserId = getCurrentUserId(currentUser);
  const normalizedOwnerId = String(server?.ownerId || server?.owner_id || server?.OwnerId || "");
  const normalizedMembers = Array.isArray(server?.members)
    ? server.members
        .map((member) => String(member?.userId || member?.UserId || ""))
        .filter(Boolean)
    : [];
  const uniqueMemberIds = new Set(normalizedMembers);

  if (normalizedOwnerId && currentUserId && normalizedOwnerId !== currentUserId) {
    return true;
  }

  if (uniqueMemberIds.size > 1) {
    return true;
  }

  return false;
};
export const getRolePermissions = (server, roleId) => {
  const role = server?.roles?.find((item) => item.id === roleId);
  return Array.isArray(role?.permissions) ? role.permissions : [];
};
export const getRolePriority = (server, roleId) => {
  const role = server?.roles?.find((item) => item.id === roleId);
  return Number(role?.priority ?? 0);
};
export const hasServerPermission = (server, userId, permission) => {
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
export const canManageTargetMember = (server, actorUserId, targetUserId, permission) => {
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
export const canAssignRoleToMember = (server, actorUserId, targetUserId, nextRoleId) => {
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
export const createServer = (name, user, options = {}) => {
  const ownerUser = user || readSessionUser();
  const ownerId = getCurrentUserId(ownerUser) || createId("owner");
  const ownerMember = ownerUser
    ? createServerMember(ownerUser, "owner")
    : { userId: ownerId, name: "Owner", avatar: "", roleId: "owner" };

  return {
  id: getScopedPrivateServerId(createId("server"), ownerUser),
  name: name?.trim() || "Новый сервер",
  description: String(options?.description || "").trim().slice(0, 280),
  icon: String(options?.icon || DEFAULT_SERVER_ICON),
  iconFrame: normalizeMediaFrame(options?.iconFrame, { allowNull: false }),
  isDefault: false,
  isShared: false,
  ownerId,
  roles: createDefaultRoles(),
  members: [ownerMember],
  textChannels: [{ id: createId("text"), name: "general" }],
  voiceChannels: [{ id: createId("voice"), name: "general_voice" }],
  };
};
export const normalizeChannels = (channels, type) => {
  const fallback = type === "text" ? DEFAULT_TEXT_CHANNELS : DEFAULT_VOICE_CHANNELS;
  if (!Array.isArray(channels) || channels.length === 0) return fallback.map((channel) => ({ ...channel }));
  return channels.map((channel, index) => ({
    id: String(channel?.id || fallback[index]?.id || createId(type)),
    name:
      type === "text"
        ? normalizeTextChannelName(channel?.name || fallback[index]?.name || "new-channel")
        : String(channel?.name || fallback[index]?.name || "voice-channel").trim() || "voice-channel",
  }));
};
export const normalizeServers = (value, currentUser) => {
  if (!Array.isArray(value) || value.length === 0) return [];
  const seenIds = new Set();

  return value.reduce((normalizedServers, server, index) => {
    if (!server || isPersonalDefaultServer(server, currentUser) || isReservedDefaultServerId(server?.id)) {
      return normalizedServers;
    }

    const isSharedServer = inferSharedServer(server, currentUser);
    const nextId = String(
      isSharedServer
        ? getCanonicalSharedServerId(server?.id || createId("server"), server?.ownerId || server?.owner_id || server?.OwnerId || "")
        : currentUser
          ? getScopedPrivateServerId(server?.id || createId("server"), currentUser)
          : server?.id || createId("server")
    );

    if (seenIds.has(nextId)) {
      return normalizedServers;
    }
    seenIds.add(nextId);

    const nextOwnerId = String(server?.ownerId || server?.owner_id || getCurrentUserId(currentUser) || createId("owner"));
    const nextMembers = normalizeMembers(server?.members, currentUser);

    normalizedServers.push({
      isDefault: false,
      id: nextId,
      name: String(server?.name || `Сервер ${index + 1}`),
      description: String(server?.description || server?.Description || "").trim().slice(0, 280),
      icon: server?.icon ?? "",
      iconFrame: getServerIconFrame(server),
      isShared: isSharedServer,
      ownerId: nextOwnerId,
      roles: normalizeRoles(server?.roles),
      members: nextMembers.some((member) => String(member.userId) === nextOwnerId)
        ? nextMembers
        : [
            ...nextMembers,
            currentUser && nextOwnerId === getCurrentUserId(currentUser)
              ? createServerMember(currentUser, "owner")
              : { userId: nextOwnerId, name: "Owner", avatar: "", roleId: "owner" },
          ],
      textChannels: normalizeChannels(server?.textChannels, "text"),
      voiceChannels: normalizeChannels(server?.voiceChannels, "voice"),
    });

    return normalizedServers;
  }, []);
};
export const getServersStorageKey = (user) => `${SERVERS_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const getActiveServerStorageKey = (user) => `${ACTIVE_SERVER_STORAGE_KEY}:${getUserStorageScope(user)}`;
export const readStoredServers = (user) => {
  try {
    const raw = localStorage.getItem(getServersStorageKey(user));
    return raw ? normalizeServers(JSON.parse(raw), user) : [];
  } catch {
    return [];
  }
};
export const mergePersistedServers = (localServers, remoteServers, currentUser) => {
  const getServerMergeKey = (server) => {
    const normalizedServerId = String(server?.id || "").trim();
    if (!normalizedServerId) {
      return normalizedServerId;
    }

    return getCanonicalSharedServerId(normalizedServerId, server?.ownerId || "");
  };

  const mergedByKey = new Map();
  normalizeServers(remoteServers, currentUser).forEach((server) => {
    mergedByKey.set(getServerMergeKey(server), server);
  });
  normalizeServers(localServers, currentUser).forEach((server) => {
    const mergeKey = getServerMergeKey(server);
    if (!mergedByKey.has(mergeKey)) {
      mergedByKey.set(mergeKey, server);
    }
  });
  return Array.from(mergedByKey.values());
};
export const getChannelDisplayName = (name, type) =>
  type === "text" ? normalizeTextChannelName(name, "channel") : String(name || "").trim();
export const parseServerChatChannelId = (channelId) => {
  const normalizedChannelId = String(channelId || "").trim();
  const match = /^server:(.+?)::channel:(.+)$/.exec(normalizedChannelId);
  if (!match) {
    return null;
  }

  return {
    serverId: match[1],
    channelId: match[2],
  };
};
export const trimNotificationPreview = (value, limit = 180) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text.length > limit ? `${text.slice(0, limit - 3).trimEnd()}...` : text;
};

export const getIncomingMessagePreview = (messageItem, fallbackText = "Новое сообщение") => {
  const textCandidates = [
    messageItem?.message,
    messageItem?.text,
    messageItem?.preview,
    messageItem?.Preview,
    messageItem?.plainText,
    messageItem?.PlainText,
    messageItem?.decryptedText,
    messageItem?.content,
  ];
  const resolvedText = textCandidates
    .map((value) => trimNotificationPreview(value))
    .find((value) => value && value !== "[Encrypted message unavailable]");
  if (resolvedText) {
    return resolvedText;
  }

  if (messageItem?.voiceMessage || messageItem?.VoiceMessage) {
    return "Голосовое сообщение";
  }

  const contentType = String(messageItem?.attachmentContentType || "").toLowerCase();
  if (contentType.startsWith("image/")) {
    return "Отправил изображение";
  }
  if (contentType.startsWith("video/")) {
    return "Отправил видео";
  }
  if (messageItem?.attachmentName) {
    return `Отправил файл: ${messageItem.attachmentName}`;
  }

  return fallbackText;
};

export const resolveIncomingMessagePreview = async (
  messageItem,
  user,
  { fallbackText = "Новое сообщение" } = {}
) => {
  const preview = getIncomingMessagePreview(messageItem, "");
  if (preview) {
    return preview;
  }

  if (messageItem?.encryption || messageItem?.Encryption) {
    return "Сообщение из старого защищённого формата";
  }

  return getIncomingMessagePreview(messageItem, fallbackText);
};
export const normalizeFriend = (friend) => ({
  id: String(friend?.id || ""),
  firstName: String(friend?.first_name || friend?.firstName || ""),
  lastName: String(friend?.last_name || friend?.lastName || ""),
  nickname: String(friend?.nickname || friend?.nick_name || ""),
  name:
    String(friend?.nickname || friend?.nick_name || "").trim()
    || `${String(friend?.first_name || friend?.firstName || "").trim()} ${String(friend?.last_name || friend?.lastName || "").trim()}`.trim(),
  email: String(friend?.email || ""),
  avatar: String(friend?.avatar_url || friend?.avatarUrl || friend?.avatar || ""),
  avatarFrame: parseMediaFrame(friend?.avatarFrame, friend?.avatar_frame, friend?.avatarFrameJson, friend?.avatar_frame_json),
  profileBackgroundUrl: String(friend?.profile_background_url || friend?.profileBackgroundUrl || friend?.profileBackground || ""),
  profileBackgroundFrame: parseMediaFrame(
    friend?.profileBackgroundFrame,
    friend?.profile_background_frame,
    friend?.profileBackgroundFrameJson,
    friend?.profile_background_frame_json
  ),
  directChannelId: String(friend?.directChannelId || ""),
  isSelf: Boolean(friend?.isSelf),
});
export const normalizeFriendRequest = (request) => ({
  id: Number(request?.id || 0),
  status: String(request?.status || "pending"),
  createdAt: String(request?.created_at || request?.createdAt || ""),
  sender: normalizeFriend(request?.sender || {}),
});
export const UI_SOUND_PATHS = {
  join: resolveStaticAssetUrl("/sounds/voice-input.wav"),
  leave: resolveStaticAssetUrl("/sounds/voice-output.wav"),
  share: resolveStaticAssetUrl("/sounds/screen-share.wav"),
};
export const SETTINGS_ICON_URL = resolveStaticAssetUrl("/icons/settings.png");
export const MICROPHONE_ICON_URL = resolveStaticAssetUrl("/icons/microphone.png");
export const HEADPHONES_ICON_URL = resolveStaticAssetUrl("/icons/headphones-simple.svg");
export const MONITOR_ICON_URL = resolveStaticAssetUrl("/icons/monitor.svg");
export const CAMERA_ICON_URL = resolveStaticAssetUrl("/icons/camera.png");
export const PHONE_ICON_URL = resolveStaticAssetUrl("/icons/phone.png");
export const PENCIL_ICON_URL = resolveStaticAssetUrl("/icons/pencil.svg");
export const SEARCH_ICON_URL = resolveStaticAssetUrl("/icons/search.svg");
export const SMS_ICON_URL = resolveStaticAssetUrl("/icons/sms.svg");
export const FRIENDS_SIDEBAR_ITEMS = [
  { id: "friends", label: "Друзья", icon: "??" },
];
export const SETTINGS_NAV_ITEMS = [
  { id: "personal_profile", label: "Личный профиль", section: "Пользователь" },
  { id: "notifications", label: "Уведомления", section: "Пользователь" },
  { id: "voice_video", label: "Голос и видео", section: "Приложение" },
  { id: "server", label: "Сервер", section: "Текущий сервер" },
  { id: "roles", label: "Роли и участники", section: "Текущий сервер" },
];
export const uiSoundCache = new Map();



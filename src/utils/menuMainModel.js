import { DEFAULT_SERVER_ICON, resolveStaticAssetUrl } from "./media";
import { normalizeMediaFrame, parseMediaFrame } from "./mediaFrames";
import { API_URL } from "../config/runtime";
import { getStoredUser } from "./auth";
export const SERVERS_STORAGE_KEY = "nd_servers_v2";
export const ACTIVE_SERVER_STORAGE_KEY = "nd_active_server_id";
export const ACTIVE_TEXT_CHANNEL_STORAGE_KEY = "nd_active_text_channel_by_server";
export const NOISE_SUPPRESSION_STORAGE_KEY = "nd_noise_suppression_mode";
export const ECHO_CANCELLATION_STORAGE_KEY = "nd_echo_cancellation_enabled";
export const DIRECT_NOTIFICATIONS_STORAGE_KEY = "nd_direct_notifications";
export const CONVERSATION_NOTIFICATIONS_STORAGE_KEY = "nd_conversation_notifications";
export const SERVER_NOTIFICATIONS_STORAGE_KEY = "nd_server_notifications";
export const NOTIFICATION_SOUND_ENABLED_STORAGE_KEY = "nd_notification_sound_enabled";
export const NOTIFICATION_SOUND_STORAGE_KEY = "nd_notification_sound";
export const NOTIFICATION_SOUND_CUSTOM_DATA_STORAGE_KEY = "nd_notification_sound_custom_data";
export const NOTIFICATION_SOUND_CUSTOM_NAME_STORAGE_KEY = "nd_notification_sound_custom_name";
export const AUDIO_INPUT_DEVICE_STORAGE_KEY = "nd_audio_input_device";
export const AUDIO_OUTPUT_DEVICE_STORAGE_KEY = "nd_audio_output_device";
export const VIDEO_INPUT_DEVICE_STORAGE_KEY = "nd_video_input_device";
export const MAX_PROFILE_NAME_LENGTH = 32;
export const VOICE_INPUT_MODES = ["transparent", "broadcast", "ai_noise_suppression", "hard_gate"];
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
  { id: "classic", label: "iPhone Classic", path: resolveStaticAssetUrl("/sounds/iphone-receive-w.mp3") },
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
const parseBooleanLike = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalizedValue = String(value ?? "").trim().toLowerCase();
  if (!normalizedValue) {
    return false;
  }

  return normalizedValue === "true"
    || normalizedValue === "1"
    || normalizedValue === "yes"
    || normalizedValue === "online"
    || normalizedValue === "active"
    || normalizedValue === "available";
};
export const isUserCurrentlyOnline = (user) => {
  const explicitOnlineValue =
    user?.isOnline
    ?? user?.is_online
    ?? user?.online
    ?? user?.online_now;
  if (explicitOnlineValue !== undefined && explicitOnlineValue !== null) {
    return parseBooleanLike(explicitOnlineValue);
  }

  const presenceValues = [
    user?.status,
    user?.presence,
    user?.presenceStatus,
    user?.presence_status,
    user?.onlineStatus,
    user?.online_status,
  ];

  return presenceValues.some((value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return normalizedValue === "online" || normalizedValue === "active" || normalizedValue === "available";
  });
};
export const getUserLastSeenAt = (user) => String(
  user?.lastSeenAt
  || user?.last_seen_at
  || user?.lastSeen
  || user?.last_seen
  || user?.lastActiveAt
  || user?.last_active_at
  || user?.lastOnlineAt
  || user?.last_online_at
  || user?.lastLoginAt
  || user?.last_login_at
  || user?.disconnectedAt
  || user?.disconnected_at
  || ""
).trim();
export const formatUserPresenceStatus = (user) => {
  if (isUserCurrentlyOnline(user)) {
    return "в сети";
  }

  const lastSeenAt = getUserLastSeenAt(user);
  if (!lastSeenAt) {
    return "не в сети";
  }

  const lastSeenDate = new Date(lastSeenAt);
  if (Number.isNaN(lastSeenDate.getTime())) {
    return "не в сети";
  }

  const now = new Date();
  const timeLabel = lastSeenDate.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfLastSeenDay = new Date(
    lastSeenDate.getFullYear(),
    lastSeenDate.getMonth(),
    lastSeenDate.getDate()
  ).getTime();
  const dayDelta = Math.round((startOfToday - startOfLastSeenDay) / 86400000);

  if (dayDelta === 0) {
    return `был(а) в сети сегодня в ${timeLabel}`;
  }

  if (dayDelta === 1) {
    return `был(а) в сети вчера в ${timeLabel}`;
  }

  const dateLabel = dayDelta > 1 && dayDelta < 7
    ? lastSeenDate.toLocaleDateString("ru-RU", { weekday: "long" })
    : lastSeenDate.toLocaleDateString("ru-RU", (
      lastSeenDate.getFullYear() === now.getFullYear()
        ? { day: "numeric", month: "long" }
        : { day: "2-digit", month: "2-digit", year: "numeric" }
    ));

  return `был(а) в сети ${dateLabel} в ${timeLabel}`;
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
const getApiStorageScope = () => {
  try {
    const parsed = new URL(String(API_URL || "").trim());
    return sanitizeScopeFragment(parsed.origin);
  } catch {
    return sanitizeScopeFragment(API_URL || "default");
  }
};
export const getScopedUserStorageScope = (user) => `${getApiStorageScope()}:${getUserStorageScope(user)}`;
export const isReservedDefaultServerId = (serverId) => /^server-main(?:-|$)/.test(String(serverId || ""));
export const getScopedDefaultServerId = (user) =>
  `server-main-${sanitizeScopeFragment(getUserStorageScope(user))}`;

const stripLegacyApiScopePrefix = (value) => {
  const normalizedValue = String(value || "").trim();
  const apiScopePrefix = `${getApiStorageScope()}-`;
  if (!normalizedValue || !normalizedValue.toLowerCase().startsWith(apiScopePrefix.toLowerCase())) {
    return normalizedValue;
  }

  return normalizedValue.slice(apiScopePrefix.length);
};

export const getScopedPrivateServerId = (serverId, user) => {
  const scope = sanitizeScopeFragment(getUserStorageScope(user));
  const normalizedServerId = String(serverId || "").trim();
  const currentPrefix = `server-${scope}-`;
  if (normalizedServerId.toLowerCase().startsWith(currentPrefix.toLowerCase())) {
    return normalizedServerId;
  }

  let rawSuffix = String(serverId || createId("server"))
    .replace(/^server-main-?/i, "")
    .replace(/^server-?/i, "");
  rawSuffix = stripLegacyApiScopePrefix(rawSuffix);
  if (rawSuffix.toLowerCase().startsWith(`${scope}-`.toLowerCase())) {
    rawSuffix = rawSuffix.slice(scope.length + 1);
  }
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
export const getNoiseSuppressionStorageKey = (user) => `${NOISE_SUPPRESSION_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getEchoCancellationStorageKey = (user) => `${ECHO_CANCELLATION_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getDirectNotificationsStorageKey = (user) => `${DIRECT_NOTIFICATIONS_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getConversationNotificationsStorageKey = (user) => `${CONVERSATION_NOTIFICATIONS_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getServerNotificationsStorageKey = (user) => `${SERVER_NOTIFICATIONS_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getNotificationSoundEnabledStorageKey = (user) => `${NOTIFICATION_SOUND_ENABLED_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getNotificationSoundStorageKey = (user) => `${NOTIFICATION_SOUND_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getNotificationSoundCustomDataStorageKey = (user) => `${NOTIFICATION_SOUND_CUSTOM_DATA_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getNotificationSoundCustomNameStorageKey = (user) => `${NOTIFICATION_SOUND_CUSTOM_NAME_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getAudioInputDeviceStorageKey = (user) => `${AUDIO_INPUT_DEVICE_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getAudioOutputDeviceStorageKey = (user) => `${AUDIO_OUTPUT_DEVICE_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getVideoInputDeviceStorageKey = (user) => `${VIDEO_INPUT_DEVICE_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
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
export const isServerOwnedByUser = (server, userId) =>
  Boolean(server && userId && String(server.ownerId || server.owner_id || server.OwnerId || "") === String(userId));

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

  if (isServerOwnedByUser(server, userId)) {
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
  const rawName = typeof name === "string" ? name : "";
  const rawDescription = String(options?.description || "");
  const ownerMember = ownerUser
    ? createServerMember(ownerUser, "owner")
    : { userId: ownerId, name: "Owner", avatar: "", roleId: "owner" };

  return {
  id: getScopedPrivateServerId(createId("server"), ownerUser),
  name: rawName.trim() ? rawName : "Новый сервер",
  description: rawDescription.slice(0, 280),
  icon: String(options?.icon || DEFAULT_SERVER_ICON),
  iconFrame: normalizeMediaFrame(options?.iconFrame, { allowNull: false }),
  isDefault: false,
  isShared: false,
  ownerId,
  roles: createDefaultRoles(),
  members: [ownerMember],
  channelCategories: [],
  textChannels: [{ id: createId("text"), name: "general" }],
  voiceChannels: [{ id: createId("voice"), name: "general_voice" }],
  };
};
export const normalizeChannelCategories = (categories) => {
  if (!Array.isArray(categories)) {
    return [];
  }

  return categories
    .filter(Boolean)
    .map((category, index) => ({
      id: String(category?.id || createId("category")),
      name: String(category?.name || `Категория ${index + 1}`).trim() || `Категория ${index + 1}`,
      collapsed: Boolean(category?.collapsed),
      privateCategory: Boolean(category?.privateCategory),
      order: Number.isFinite(Number(category?.order)) ? Number(category.order) : index,
    }))
    .sort((first, second) => first.order - second.order);
};
export const normalizeChannels = (channels, type) => {
  const fallback = type === "text" ? DEFAULT_TEXT_CHANNELS : DEFAULT_VOICE_CHANNELS;
  if (!Array.isArray(channels) || channels.length === 0) return fallback.map((channel) => ({ ...channel }));
  return channels.map((channel, index) => {
    const normalizedChannel = {
      ...channel,
      id: String(channel?.id || fallback[index]?.id || createId(type)),
      categoryId: String(channel?.categoryId || channel?.category_id || ""),
      name:
        type === "text"
          ? normalizeTextChannelName(channel?.name || fallback[index]?.name || "new-channel")
          : String(channel?.name || fallback[index]?.name || "voice-channel").trim() || "voice-channel",
    };

    if (type === "text") {
      normalizedChannel.kind = String(channel?.kind || channel?.type || "text") === "forum" ? "forum" : "text";
      normalizedChannel.slowMode = String(channel?.slowMode || "off");
      normalizedChannel.topic = String(channel?.topic || "").slice(0, 1024);
      normalizedChannel.topicPreview = Boolean(channel?.topicPreview);
      normalizedChannel.autoArchiveDuration = String(channel?.autoArchiveDuration || "3d");
      normalizedChannel.forumPosts = Array.isArray(channel?.forumPosts)
        ? channel.forumPosts.map((post) => ({
            id: String(post?.id || createId("forum-post")),
            title: String(post?.title || "Новая публикация").trim() || "Новая публикация",
            content: String(post?.content || ""),
            authorName: String(post?.authorName || ""),
            authorAvatar: String(post?.authorAvatar || ""),
            createdAt: String(post?.createdAt || new Date().toISOString()),
            reactions: Number(post?.reactions || 0),
            replies: Array.isArray(post?.replies)
              ? post.replies.map((reply) => ({
                  id: String(reply?.id || createId("forum-reply")),
                  text: String(reply?.text || ""),
                  authorName: String(reply?.authorName || ""),
                  authorAvatar: String(reply?.authorAvatar || ""),
                  createdAt: String(reply?.createdAt || new Date().toISOString()),
                }))
              : [],
          }))
        : [];
    } else {
      normalizedChannel.bitrateKbps = Math.min(96, Math.max(8, Number(channel?.bitrateKbps || 64)));
      normalizedChannel.userLimit = Math.min(99, Math.max(0, Number(channel?.userLimit || 0)));
      normalizedChannel.videoQuality = String(channel?.videoQuality || "auto");
      normalizedChannel.region = String(channel?.region || "auto");
    }

    normalizedChannel.ageRestricted = Boolean(channel?.ageRestricted);
    normalizedChannel.permissionsSynced = channel?.permissionsSynced !== false;
    normalizedChannel.privateChannel = Boolean(channel?.privateChannel);
    normalizedChannel.advancedPermissionsOpen = Boolean(channel?.advancedPermissionsOpen);
    normalizedChannel.permissionOverrides = channel?.permissionOverrides && typeof channel.permissionOverrides === "object"
      ? { ...channel.permissionOverrides }
      : {};
    normalizedChannel.invitesPaused = Boolean(channel?.invitesPaused);
    normalizedChannel.invites = Array.isArray(channel?.invites) ? channel.invites : [];
    normalizedChannel.webhooks = Array.isArray(channel?.webhooks) ? channel.webhooks : [];
    normalizedChannel.followedChannels = Array.isArray(channel?.followedChannels) ? channel.followedChannels : [];
    normalizedChannel.integrationInfoOpen = Boolean(channel?.integrationInfoOpen);

    return normalizedChannel;
  });
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
      description: String(server?.description || server?.Description || "").slice(0, 280),
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
      channelCategories: normalizeChannelCategories(server?.channelCategories || server?.categories),
      textChannels: normalizeChannels(server?.textChannels, "text"),
      voiceChannels: normalizeChannels(server?.voiceChannels, "voice"),
    });

    return normalizedServers;
  }, []);
};
export const getServersStorageKey = (user) => `${SERVERS_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getActiveServerStorageKey = (user) => `${ACTIVE_SERVER_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
export const getActiveTextChannelStorageKey = (user) => `${ACTIVE_TEXT_CHANNEL_STORAGE_KEY}:${getScopedUserStorageScope(user)}`;
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

  const attachments = Array.isArray(messageItem?.attachments)
    ? messageItem.attachments
    : Array.isArray(messageItem?.Attachments)
      ? messageItem.Attachments
      : [];
  const firstAttachment = attachments[0] || null;
  if (messageItem?.voiceMessage || messageItem?.VoiceMessage || firstAttachment?.voiceMessage || firstAttachment?.VoiceMessage) {
    return "Голосовое сообщение";
  }

  if (attachments.length > 1) {
    return `${attachments.length} вложений`;
  }

  const contentType = String(
    messageItem?.attachmentContentType
    || messageItem?.AttachmentContentType
    || firstAttachment?.attachmentContentType
    || firstAttachment?.AttachmentContentType
    || ""
  ).toLowerCase();
  if (contentType.startsWith("image/")) {
    return "Отправил изображение";
  }
  if (contentType.startsWith("video/")) {
    return "Отправил видео";
  }
  const attachmentName = String(messageItem?.attachmentName || messageItem?.AttachmentName || firstAttachment?.attachmentName || firstAttachment?.AttachmentName || "");
  if (attachmentName) {
    return `Отправил файл: ${attachmentName}`;
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
  status: String(friend?.status || friend?.presence || friend?.presenceStatus || friend?.onlineStatus || ""),
  presence: String(friend?.presence || friend?.presenceStatus || friend?.onlineStatus || friend?.status || ""),
  activity: friend?.activity || friend?.externalActivity || null,
  lastSeenAt: getUserLastSeenAt(friend),
  directChannelId: String(friend?.directChannelId || ""),
  isOnline: isUserCurrentlyOnline(friend),
  isSelf: Boolean(friend?.isSelf),
});
export const normalizeConversationTarget = (conversation) => {
  const members = Array.isArray(conversation?.members)
    ? conversation.members.map((member) => ({
      ...normalizeFriend(member),
      role: String(member?.role || "member"),
      muteUntil: String(member?.mute_until || member?.muteUntil || ""),
      isMuted: Boolean(member?.is_muted ?? member?.isMuted),
      joinedAt: String(member?.joined_at || member?.joinedAt || ""),
    }))
    : [];

  const rawLastMessage = conversation?.lastMessage || conversation?.last_message || null;
  const lastMessage = rawLastMessage && typeof rawLastMessage === "object"
    ? {
      id: String(rawLastMessage.id || rawLastMessage.Id || ""),
      channelId: String(rawLastMessage.channelId || rawLastMessage.channel_id || rawLastMessage.ChannelId || ""),
      authorUserId: String(rawLastMessage.authorUserId || rawLastMessage.author_user_id || rawLastMessage.AuthorUserId || ""),
      username: String(rawLastMessage.username || rawLastMessage.Username || ""),
      preview: String(rawLastMessage.preview || rawLastMessage.Preview || ""),
      timestamp: String(rawLastMessage.timestamp || rawLastMessage.Timestamp || ""),
    }
    : null;

  return {
    id: String(conversation?.directChannelId || conversation?.id || ""),
    conversationId: Number(conversation?.id || 0),
    kind: "conversation",
    title: String(conversation?.title || "Новая беседа"),
    name: String(conversation?.title || "Новая беседа"),
    nickname: String(conversation?.title || "Новая беседа"),
    avatar: String(conversation?.avatar_url || conversation?.avatarUrl || members[0]?.avatar || ""),
    directChannelId: String(conversation?.directChannelId || ""),
    voiceChannelId: String(conversation?.voiceChannelId || ""),
    ownerUserId: String(conversation?.ownerUserId || conversation?.owner_user_id || ""),
    canManage: Boolean(conversation?.canManage ?? conversation?.can_manage),
    currentUserRole: String(conversation?.currentUserRole || conversation?.current_user_role || "member"),
    permissions: Array.isArray(conversation?.permissions) ? conversation.permissions.map(String) : [],
    canEditInfo: Boolean(conversation?.canEditInfo ?? conversation?.can_edit_info),
    canAddMembers: Boolean(conversation?.canAddMembers ?? conversation?.can_add_members),
    canRemoveMembers: Boolean(conversation?.canRemoveMembers ?? conversation?.can_remove_members),
    canManageRoles: Boolean(conversation?.canManageRoles ?? conversation?.can_manage_roles),
    canLeave: Boolean(conversation?.canLeave ?? conversation?.can_leave),
    canDeleteConversation: Boolean(conversation?.canDeleteConversation ?? conversation?.can_delete_conversation),
    isMuted: Boolean(conversation?.isMuted ?? conversation?.is_muted),
    muteUntil: String(conversation?.muteUntil || conversation?.mute_until || ""),
    memberCount: Number(conversation?.memberCount || conversation?.member_count || members.length),
    members,
    lastMessage,
    activeCallChannel: String(conversation?.activeCallChannel || conversation?.active_call_channel || ""),
    activeCallStartedAt: String(conversation?.activeCallStartedAt || conversation?.active_call_started_at || ""),
    updatedAt: String(conversation?.updatedAt || conversation?.updated_at || ""),
  };
};
export const normalizeFriendRequest = (request) => ({
  id: Number(request?.id || 0),
  status: String(request?.status || "pending"),
  createdAt: String(request?.created_at || request?.createdAt || ""),
  sender: normalizeFriend(request?.sender || {}),
});
const UI_SOUND_ASSET_VERSION = "2026-04-22-voice-refresh-1";
const withUiSoundVersion = (path) => resolveStaticAssetUrl(`${path}?v=${UI_SOUND_ASSET_VERSION}`);

export const UI_SOUND_PATHS = {
  join: withUiSoundVersion("/sounds/tend-voice-join.wav"),
  leave: withUiSoundVersion("/sounds/tend-voice-leave.wav"),
  shareStart: withUiSoundVersion("/sounds/screen-share-start.wav"),
  shareStop: withUiSoundVersion("/sounds/screen-share-stop.wav"),
  mute: withUiSoundVersion("/sounds/tend-mute.wav"),
  unmute: withUiSoundVersion("/sounds/tend-unmute.wav"),
};
export const SETTINGS_ICON_URL = resolveStaticAssetUrl("/icons/settings.png");
export const MICROPHONE_ICON_URL = resolveStaticAssetUrl("/icons/mic-panel.svg");
export const HEADPHONES_ICON_URL = resolveStaticAssetUrl("/icons/headphones-fill-svgrepo-com.svg");
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
  { id: "account", label: "Моя учётная запись", section: "Пользователь" },
  { id: "personal_profile", label: "Профили", section: "Пользователь" },
  { id: "devices", label: "Устройства", section: "Пользователь" },
  { id: "integrations", label: "Интеграции", section: "Пользователь" },
  { id: "notifications", label: "Уведомления", section: "Пользователь" },
  { id: "voice_video", label: "Голос и видео", section: "Приложение" },
  { id: "appearance_accessibility", label: "Внешний вид и доступность", section: "Приложение" },
  { id: "server", label: "Сервер", section: "Текущий сервер" },
  { id: "roles", label: "Роли и участники", section: "Текущий сервер" },
];
export const uiSoundCache = new Map();



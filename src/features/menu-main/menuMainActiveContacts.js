import { formatIntegrationActivityStatus } from "../../utils/integrations";
import { isDirectCallChannelId } from "../../utils/directCallModel";
import { getDisplayName, isUserCurrentlyOnline } from "../../utils/menuMainModel";

const ACTIVITY_PRIORITY = {
  voice: 0,
  activity: 1,
  online: 2,
};

const getParticipantUserId = (participant) =>
  String(participant?.userId || participant?.UserId || participant?.identity || participant?.Identity || "").trim();

const getActivityStatus = (friend) => {
  const activity = friend?.activity || friend?.externalActivity || null;
  const label = formatIntegrationActivityStatus(activity);
  if (!label) {
    return null;
  }

  const kind = String(activity?.kind || "").toLowerCase();
  return {
    kind: kind === "music" || kind === "game" ? kind : "activity",
    label,
  };
};

export function buildActiveContacts({
  friends = [],
  participantsMap = {},
  servers = [],
  currentUserId = "",
  getScopedVoiceChannelId,
}) {
  const friendById = new Map(friends.map((friend) => [String(friend.id || ""), friend]));
  const voiceChannelById = new Map();

  servers.forEach((server) => {
    (server?.voiceChannels || []).forEach((channel) => {
      const channelName = String(channel?.name || "").trim();
      const serverName = String(server?.name || "").trim();
      const label = channelName
        ? `В голосовом: ${channelName}`
        : "В голосовом чате";
      const scopedId = getScopedVoiceChannelId?.(server.id, channel.id) || `${server.id}::${channel.id}`;
      const meta = {
        label,
        serverName,
        channelName,
      };
      voiceChannelById.set(String(channel.id || ""), meta);
      voiceChannelById.set(String(scopedId || ""), meta);
    });
  });

  const voiceStatusByUserId = new Map();
  Object.entries(participantsMap || {}).forEach(([channelId, participants]) => {
    const channelMeta = voiceChannelById.get(String(channelId || ""));
    const isDirectCall = isDirectCallChannelId(channelId);
    const label = isDirectCall
      ? "В личном звонке"
      : channelMeta?.label || "В голосовом чате";

    (Array.isArray(participants) ? participants : []).forEach((participant) => {
      const userId = getParticipantUserId(participant);
      if (!userId || userId === String(currentUserId || "") || !friendById.has(userId)) {
        return;
      }

      voiceStatusByUserId.set(userId, {
        kind: "voice",
        label,
        channelName: channelMeta?.channelName || "",
        serverName: channelMeta?.serverName || "",
      });
    });
  });

  return friends
    .map((friend) => {
      const friendId = String(friend.id || "");
      const voiceStatus = voiceStatusByUserId.get(friendId);
      const activityStatus = getActivityStatus(friend);
      const onlineStatus = isUserCurrentlyOnline(friend)
        ? { kind: "online", label: "Онлайн" }
        : null;
      const status = voiceStatus || activityStatus || onlineStatus;

      if (!status) {
        return null;
      }

      return {
        ...friend,
        activeStatus: status.label,
        activeStatusKind: status.kind,
        activeVoiceChannelName: status.channelName || "",
        activeVoiceServerName: status.serverName || "",
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftPriority = ACTIVITY_PRIORITY[left.activeStatusKind] ?? 3;
      const rightPriority = ACTIVITY_PRIORITY[right.activeStatusKind] ?? 3;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return getDisplayName(left).localeCompare(getDisplayName(right), "ru", { sensitivity: "base" });
    });
}

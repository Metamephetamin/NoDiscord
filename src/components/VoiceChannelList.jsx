import "../css/ListChannels.css";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

const getChannelRuntimeId = (serverId, channelId) => (serverId && channelId ? `${serverId}::${channelId}` : channelId);

const getVoiceDisplayName = (name) => {
  const normalized = String(name || "").trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized.split(/\s+/)[0] || normalized;
};

const VoiceChannelList = ({
  channels,
  activeChannelId,
  participantsMap,
  serverId = "",
  serverMembers = [],
  serverRoles = [],
  onJoinChannel,
  onLeaveChannel,
  onRenameChannel,
  editingChannelId = "",
  editingChannelValue = "",
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
  liveUserIds = [],
  speakingUserIds = [],
  watchedStreamUserId = null,
  onWatchStream,
  canManageChannels = true,
}) => {
  const liveUsers = new Set(liveUserIds);
  const speakingUsers = new Set(speakingUserIds);
  const roleColorByUserId = new Map(
    (serverMembers || []).map((member) => {
      const role = (serverRoles || []).find((item) => item.id === member.roleId);
      return [String(member.userId), role?.color || "#7b89a8"];
    })
  );
  const memberNameByUserId = new Map(
    (serverMembers || []).map((member) => [String(member.userId), member.name || "Unknown"])
  );

  const normalizeParticipant = (participant = {}) => {
    const userId = participant.userId || participant.UserId || "";

    return {
      userId,
      name: getVoiceDisplayName(memberNameByUserId.get(String(userId)) || participant.name || participant.Name || "Unknown"),
      avatar: participant.avatar || participant.Avatar || DEFAULT_AVATAR,
      isScreenSharing: Boolean(participant.isScreenSharing || participant.IsScreenSharing),
      isMicMuted: Boolean(participant.isMicMuted || participant.IsMicMuted),
      isDeafened: Boolean(participant.isDeafened || participant.IsDeafened),
      roleColor: roleColorByUserId.get(String(userId)) || "#7b89a8",
    };
  };

  return (
    <ul className="voice-channel-list">
      {channels.map((channel) => {
        const runtimeId = getChannelRuntimeId(serverId, channel.id);
        const participants = (participantsMap?.[channel.id] || participantsMap?.[runtimeId] || []).map(normalizeParticipant);
        const isActive = activeChannelId === runtimeId || activeChannelId === channel.id;
        const isEditing = editingChannelId === channel.id;

        return (
          <li key={channel.id} className={`list__items ${isActive ? "list__items--active" : ""} ${isEditing ? "list__items--editing" : ""}`}>
            <div className="voice-channel__row">
              {isEditing ? (
                <input
                  className="channel-inline-input"
                  type="text"
                  value={editingChannelValue}
                  autoFocus
                  onChange={(event) => onRenameValueChange?.(event.target.value)}
                  onBlur={() => onRenameSubmit?.()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onRenameSubmit?.();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      onRenameCancel?.();
                    }
                  }}
                />
              ) : (
                <button type="button" className="voice-channel__button" onClick={() => onJoinChannel?.(channel)}>
                  <span className="voice-channel__title">{channel.name}</span>
                </button>
              )}

              <button
                type="button"
                className="channel-edit-button"
                onClick={() => onRenameChannel?.("voice", channel)}
                disabled={!canManageChannels}
                aria-label="Переименовать канал"
              >
                <img src="/icons/settings.png" alt="" />
              </button>

              {isActive && (
                <button type="button" className="voice-channel__leave" onClick={() => onLeaveChannel?.()}>
                  Выйти
                </button>
              )}
            </div>

            {participants.length > 0 && (
              <div className="participant-list">
                {participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className={`participant-item ${speakingUsers.has(participant.userId) ? "participant-item--speaking" : ""}`}
                  >
                    <img src={resolveMediaUrl(participant.avatar, DEFAULT_AVATAR)} alt={participant.name} />
                    <span className="participant-item__name">{participant.name}</span>
                    <span
                      className="participant-item__role-dot"
                      style={{ backgroundColor: participant.roleColor }}
                      aria-hidden="true"
                    />
                    <div className="participant-item__voice-flags">
                      {participant.isMicMuted && (
                        <span className="participant-item__voice-flag participant-item__voice-flag--slashed" title="Микрофон выключен">
                          <img src="/icons/microphone.png" alt="" />
                        </span>
                      )}
                      {participant.isDeafened && (
                        <span className="participant-item__voice-flag participant-item__voice-flag--slashed" title="Не слышит канал">
                          <img src="/icons/headphones-simple.svg" alt="" />
                        </span>
                      )}
                    </div>
                    {(liveUsers.has(participant.userId) || participant.isScreenSharing) && (
                      <button
                        type="button"
                        className={`participant-live-badge ${
                          watchedStreamUserId === participant.userId ? "participant-live-badge--active" : ""
                        }`}
                        onClick={() => onWatchStream?.(participant.userId)}
                      >
                        LIVE
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default VoiceChannelList;

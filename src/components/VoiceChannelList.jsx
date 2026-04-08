import { memo, useMemo } from "react";
import "../css/ListChannels.css";
import AnimatedAvatar from "./AnimatedAvatar";
import { resolveStaticAssetUrl } from "../utils/media";

const getChannelRuntimeId = (serverId, channelId) => (serverId && channelId ? `${serverId}::${channelId}` : channelId);
const SETTINGS_ICON_URL = resolveStaticAssetUrl("/icons/settings.png");
const MICROPHONE_ICON_URL = resolveStaticAssetUrl("/icons/microphone.png");
const HEADPHONES_ICON_URL = resolveStaticAssetUrl("/icons/headphones-simple.svg");

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
  const liveUsers = useMemo(() => new Set(liveUserIds), [liveUserIds]);
  const speakingUsers = useMemo(() => new Set(speakingUserIds), [speakingUserIds]);
  const roleColorByUserId = useMemo(
    () =>
      new Map(
        (serverMembers || []).map((member) => {
          const role = (serverRoles || []).find((item) => item.id === member.roleId);
          return [String(member.userId), role?.color || "#7b89a8"];
        })
      ),
    [serverMembers, serverRoles]
  );
  const memberNameByUserId = useMemo(
    () => new Map((serverMembers || []).map((member) => [String(member.userId), member.name || "Unknown"])),
    [serverMembers]
  );

  const normalizeParticipant = (participant = {}) => {
    const userId = participant.userId || participant.UserId || "";

    return {
      userId,
      name: getVoiceDisplayName(memberNameByUserId.get(String(userId)) || participant.name || participant.Name || "Unknown"),
      avatar: participant.avatar || participant.Avatar || "",
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
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
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
                <img src={SETTINGS_ICON_URL} alt="" />
              </button>
            </div>

            {participants.length > 0 && (
              <div className="participant-list">
                {participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className={`participant-item ${speakingUsers.has(participant.userId) ? "participant-item--speaking" : ""}`}
                  >
                    <AnimatedAvatar className="participant-item__avatar" src={participant.avatar} alt={participant.name} />
                    <span className="participant-item__name">{participant.name}</span>
                    <span
                      className="participant-item__role-dot"
                      style={{ backgroundColor: participant.roleColor }}
                      aria-hidden="true"
                    />
                    <div className="participant-item__voice-flags">
                      {participant.isMicMuted && (
                        <span className="participant-item__voice-flag participant-item__voice-flag--slashed" title="Микрофон выключен">
                          <img src={MICROPHONE_ICON_URL} alt="" />
                        </span>
                      )}
                      {participant.isDeafened && (
                        <span className="participant-item__voice-flag participant-item__voice-flag--slashed" title="Не слышит канал">
                          <img src={HEADPHONES_ICON_URL} alt="" />
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

export default memo(VoiceChannelList);

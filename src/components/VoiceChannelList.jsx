import { memo, useMemo } from "react";
import "../css/ListChannels.css";
import AnimatedAvatar from "./AnimatedAvatar";
import { resolveStaticAssetUrl } from "../utils/media";
import { emitInsertMentionRequest } from "../utils/textChatMentionInterop";

const getChannelRuntimeId = (serverId, channelId) => (serverId && channelId ? `${serverId}::${channelId}` : channelId);
const SETTINGS_ICON_URL = resolveStaticAssetUrl("/icons/settings.png");
const MICROPHONE_ICON_URL = resolveStaticAssetUrl("/icons/mic-panel.svg");
const HEADPHONES_ICON_URL = resolveStaticAssetUrl("/icons/headphones-fill-svgrepo-com.svg");

const getVoiceDisplayName = (name) => {
  const normalized = String(name || "").trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized.split(/\s+/)[0] || normalized;
};

const normalizeVoiceUserLimit = (value) => Math.min(99, Math.max(0, Number(value) || 0));
const formatVoiceLimitCount = (value) => String(Math.min(99, Math.max(0, Number(value) || 0))).padStart(2, "0");

const VoiceChannelList = ({
  channels,
  activeChannelId,
  participantsMap,
  serverId = "",
  serverMembers = [],
  serverRoles = [],
  onJoinChannel,
  onSelectChannel,
  onLeaveChannel,
  onPrewarmChannel,
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
  joiningChannelId = "",
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
        const isJoining = joiningChannelId === runtimeId || joiningChannelId === channel.id;
        const userLimit = normalizeVoiceUserLimit(channel.userLimit);
        const shouldShowLimit = userLimit > 0;
        const participantCount = participants.length;
        const canJoinFromRow = !isEditing && !isJoining;
        const triggerPrewarm = () => {
          onPrewarmChannel?.(channel.id);
        };

        const handleRowJoin = (event) => {
          if (!canJoinFromRow) {
            return;
          }

          if (event.target instanceof Element && event.target.closest(".channel-edit-button")) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          if (onSelectChannel) {
            onSelectChannel(channel);
          } else {
            onJoinChannel?.(channel);
          }
        };

        return (
          <li key={channel.id} className={`list__items ${isActive ? "list__items--active" : ""} ${isEditing ? "list__items--editing" : ""} ${isJoining ? "list__items--joining" : ""}`}>
            <div
              className={`voice-channel__row ${canJoinFromRow ? "voice-channel__row--interactive" : ""}`}
              onMouseEnter={triggerPrewarm}
              onPointerEnter={triggerPrewarm}
              onTouchStart={triggerPrewarm}
              onPointerDown={(event) => {
                if (event.target instanceof Element && event.target.closest(".channel-edit-button")) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                triggerPrewarm();
              }}
              onClick={handleRowJoin}
            >
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
                <button
                  type="button"
                  className="voice-channel__button"
                  onFocus={triggerPrewarm}
                  onClick={handleRowJoin}
                  disabled={isJoining}
                >
                  <span className="voice-channel__title">{channel.name}</span>
                  {shouldShowLimit ? (
                    <span className="voice-channel__count" aria-label={`${participantCount} / ${userLimit}`}>
                      <span>{formatVoiceLimitCount(participantCount)}</span>
                      <span aria-hidden="true">/</span>
                      <span>{formatVoiceLimitCount(userLimit)}</span>
                    </span>
                  ) : null}
                  {isJoining ? <span className="voice-channel__status">Подключаемся...</span> : null}
                </button>
              )}

              <button
                type="button"
                className="channel-edit-button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRenameChannel?.("voice", channel);
                }}
                disabled={!canManageChannels}
                aria-label="Настройки канала"
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
                    style={{ "--participant-role-color": participant.roleColor || "#c8d0e2" }}
                  >
                    <span className="participant-item__avatar-shell" aria-hidden="true">
                      <AnimatedAvatar className="participant-item__avatar" src={participant.avatar} alt={participant.name} />
                    </span>
                    <button
                      type="button"
                      className="participant-item__name"
                      onClick={() => emitInsertMentionRequest({
                        type: "user",
                        userId: participant.userId,
                        displayName: participant.name,
                      })}
                    >
                      {participant.name}
                    </button>
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

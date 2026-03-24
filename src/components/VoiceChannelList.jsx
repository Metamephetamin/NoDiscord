import React from "react";
import "../css/ListChannels.css";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

const VoiceChannelList = ({
  channels,
  activeChannelId,
  participantsMap,
  serverMembers = [],
  serverRoles = [],
  onJoinChannel,
  onLeaveChannel,
  onRenameChannel,
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

  const normalizeParticipant = (participant = {}) => {
    const userId = participant.userId || participant.UserId || "";

    return {
      userId,
      name: participant.name || participant.Name || "Unknown",
      avatar: participant.avatar || participant.Avatar || DEFAULT_AVATAR,
      isScreenSharing: participant.isScreenSharing || participant.IsScreenSharing || false,
      roleColor: roleColorByUserId.get(String(userId)) || "#7b89a8",
    };
  };

  return (
    <ul className="voice-channel-list">
      {channels.map((channel) => {
        const participants = (participantsMap?.[channel.id] || []).map(normalizeParticipant);
        const isActive = activeChannelId === channel.id;

        return (
          <li key={channel.id} className={`list__items ${isActive ? "list__items--active" : ""}`}>
            <div className="voice-channel__row">
              <button
                type="button"
                className="voice-channel__button"
                onClick={() => onJoinChannel?.(channel)}
              >
                <span className="voice-channel__title">{channel.name}</span>
              </button>

              <button
                type="button"
                className="channel-edit-button"
                onClick={() => onRenameChannel?.(channel.id)}
                disabled={!canManageChannels}
                aria-label="Настройки канала"
              >
                <img src="/icons/settings.png" alt="" />
              </button>

              {isActive && (
                <button
                  type="button"
                  className="voice-channel__leave"
                  onClick={() => onLeaveChannel?.()}
                >
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
                    <img
                      src={resolveMediaUrl(participant.avatar, DEFAULT_AVATAR)}
                      alt={participant.name}
                    />
                    <span className="participant-item__name">{participant.name}</span>
                    <span
                      className="participant-item__role-dot"
                      style={{ backgroundColor: participant.roleColor }}
                      aria-hidden="true"
                    />
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

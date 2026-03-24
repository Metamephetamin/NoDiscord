import React from "react";
import "../css/ListChannels.css";
import { DEFAULT_AVATAR, resolveMediaUrl } from "../utils/media";

const VoiceChannelList = ({
  channels,
  activeChannelId,
  participantsMap,
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
  const normalizeParticipant = (participant = {}) => ({
    userId: participant.userId || participant.UserId || "",
    name: participant.name || participant.Name || "Unknown",
    avatar: participant.avatar || participant.Avatar || DEFAULT_AVATAR,
    isScreenSharing: participant.isScreenSharing || participant.IsScreenSharing || false,
  });

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
                <span className="voice-channel__count">{participants.length}</span>
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
                  <div key={participant.userId} className={`participant-item ${speakingUsers.has(participant.userId) ? "participant-item--speaking" : ""}`}>
                    <img
                      src={resolveMediaUrl(participant.avatar, DEFAULT_AVATAR)}
                      alt={participant.name}
                    />
                    <span className="participant-item__name">{participant.name}</span>
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

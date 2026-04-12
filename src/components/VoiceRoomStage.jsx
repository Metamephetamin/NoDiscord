import { useEffect, useMemo, useRef } from "react";
import AnimatedAvatar from "./AnimatedAvatar";

const formatParticipantCount = (count) => {
  const value = Number(count) || 0;
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} участник`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} участника`;
  }

  return `${value} участников`;
};

const getStreamBadge = (stage) => {
  if (!stage) {
    return "";
  }

  if (stage.kind === "local" && stage.mode === "camera") {
    return "КАМЕРА";
  }

  return "В ЭФИРЕ";
};

const getResolutionBadge = (stage) => {
  const width = Number(stage?.width || 0);
  const height = Number(stage?.height || 0);
  const fps = Number(stage?.fps || 0);

  if (!width || !height) {
    return "";
  }

  const quality = height >= 1080 ? "1080p" : height >= 720 ? "720p" : `${height}p`;
  return fps > 0 ? `${quality} ${Math.round(fps)} fps` : quality;
};

function VoiceStageMedia({ stream, videoSrc, imageSrc, alt, className, contain = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current || (!stream && !videoSrc)) {
      return undefined;
    }

    const mediaElement = videoRef.current;
    mediaElement.srcObject = stream || null;
    mediaElement.src = stream ? "" : videoSrc || "";
    mediaElement.muted = true;

    mediaElement.play().catch(() => {});

    return () => {
      mediaElement.srcObject = null;
      mediaElement.src = "";
    };
  }, [stream, videoSrc]);

  useEffect(() => {
    if (!videoSrc || !videoRef.current) {
      return undefined;
    }

    const mediaElement = videoRef.current;
    let intervalId = 0;

    const syncToLiveEdge = () => {
      if (
        !mediaElement
        || mediaElement.seeking
        || mediaElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        || !mediaElement.buffered.length
      ) {
        return;
      }

      const liveEdge = mediaElement.buffered.end(mediaElement.buffered.length - 1);
      const lag = liveEdge - mediaElement.currentTime;

      if (lag > 1.2) {
        mediaElement.currentTime = Math.max(0, liveEdge - 0.12);
        mediaElement.playbackRate = 1;
        return;
      }

      if (lag > 0.55) {
        mediaElement.playbackRate = 1.06;
        return;
      }

      if (lag > 0.25) {
        mediaElement.playbackRate = 1.03;
        return;
      }

      mediaElement.playbackRate = 1;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalId) {
          window.clearInterval(intervalId);
          intervalId = 0;
        }
        return;
      }

      syncToLiveEdge();
      if (!intervalId) {
        intervalId = window.setInterval(syncToLiveEdge, 900);
      }
    };

    mediaElement.addEventListener("loadedmetadata", syncToLiveEdge);
    mediaElement.addEventListener("progress", syncToLiveEdge);
    mediaElement.addEventListener("timeupdate", syncToLiveEdge);
    mediaElement.addEventListener("playing", syncToLiveEdge);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    syncToLiveEdge();
    handleVisibilityChange();

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      mediaElement.playbackRate = 1;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mediaElement.removeEventListener("loadedmetadata", syncToLiveEdge);
      mediaElement.removeEventListener("progress", syncToLiveEdge);
      mediaElement.removeEventListener("timeupdate", syncToLiveEdge);
      mediaElement.removeEventListener("playing", syncToLiveEdge);
    };
  }, [videoSrc]);

  if (stream || videoSrc) {
    return <video ref={videoRef} className={`${className} ${contain ? "voice-room-stage__media--contain" : ""}`.trim()} autoPlay playsInline muted />;
  }

  if (imageSrc) {
    return <img src={imageSrc} alt={alt} className={`${className} ${contain ? "voice-room-stage__media--contain" : ""}`.trim()} />;
  }

  return null;
}

export default function VoiceRoomStage({
  activeServerName,
  channelName,
  participants = [],
  remoteShares = [],
  selectedStreamUserId,
  selectedStream,
  selectedStreamParticipant,
  hasLocalSharePreview,
  isLocalSharePreviewVisible,
  localSharePreview,
  onWatchStream,
  onOpenLocalSharePreview,
  onCloseSelectedStream,
  onCloseLocalSharePreview,
  onStopScreenShare,
  onStopCameraShare,
}) {
  const shellRef = useRef(null);
  const remoteShareByUserId = useMemo(
    () => new Map((remoteShares || []).map((share) => [String(share.userId || ""), share])),
    [remoteShares]
  );
  const selectedUserId = String(selectedStreamUserId || "");
  const isRemoteStage = Boolean(selectedUserId);
  const isLocalStage = !isRemoteStage && Boolean(isLocalSharePreviewVisible && hasLocalSharePreview);

  const stageCards = useMemo(
    () =>
      (participants || []).map((participant) => {
        const userId = String(participant.userId || "");
        const localPreview = participant.isSelf && hasLocalSharePreview ? localSharePreview : null;
        const share = localPreview || remoteShareByUserId.get(userId) || null;
        const canOpen =
          participant.isSelf
            ? Boolean(localPreview)
            : Boolean(participant.isLive && (share || onWatchStream));

        return {
          ...participant,
          share,
          canOpen,
          isSelected:
            (isRemoteStage && userId === selectedUserId)
            || (isLocalStage && participant.isSelf && hasLocalSharePreview),
        };
      }),
    [
      hasLocalSharePreview,
      isLocalStage,
      isRemoteStage,
      localSharePreview,
      onWatchStream,
      participants,
      remoteShareByUserId,
      selectedUserId,
    ]
  );

  const localStageParticipant = useMemo(
    () => stageCards.find((participant) => participant.isSelf) || null,
    [stageCards]
  );

  const activeStage = useMemo(() => {
    if (isRemoteStage) {
      const fallbackParticipant = stageCards.find((participant) => String(participant.userId || "") === selectedUserId) || null;
      return {
        kind: "remote",
        name: selectedStreamParticipant?.name || fallbackParticipant?.name || "Участник",
        avatar: selectedStreamParticipant?.avatar || fallbackParticipant?.avatar || "",
        subtitle: selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length ? "Стрим со звуком" : "Стрим без звука",
        stream: selectedStream?.stream || null,
        videoSrc: selectedStream?.videoSrc || "",
        imageSrc: selectedStream?.imageSrc || "",
        width: selectedStream?.width || 0,
        height: selectedStream?.height || 0,
        fps: selectedStream?.fps || 0,
      };
    }

    if (isLocalStage && localSharePreview) {
      return {
        kind: "local",
        name: localStageParticipant?.name || "Вы",
        avatar: localStageParticipant?.avatar || "",
        subtitle: localSharePreview.mode === "camera" ? "Так вас видят участники" : "Так участники видят ваш экран",
        stream: localSharePreview.stream || null,
        videoSrc: "",
        imageSrc: "",
        width: Number(localSharePreview.stream?.getVideoTracks?.()[0]?.getSettings?.().width || 0),
        height: Number(localSharePreview.stream?.getVideoTracks?.()[0]?.getSettings?.().height || 0),
        fps: Number(localSharePreview.stream?.getVideoTracks?.()[0]?.getSettings?.().frameRate || 0),
        mode: localSharePreview.mode || "screen",
      };
    }

    return null;
  }, [isLocalStage, isRemoteStage, localSharePreview, localStageParticipant?.avatar, localStageParticipant?.name, selectedStream, selectedStreamParticipant?.avatar, selectedStreamParticipant?.name, selectedUserId, stageCards]);

  const requestFullscreen = async () => {
    try {
      await shellRef.current?.requestFullscreen?.();
    } catch (error) {
      console.error("Ошибка перехода в полноэкранный режим голосовой сцены:", error);
    }
  };

  const handleCardClick = (participant) => {
    if (!participant) {
      return;
    }

    if (participant.isSelf && participant.share) {
      onOpenLocalSharePreview?.();
      return;
    }

    if (participant.isLive) {
      onWatchStream?.(participant.userId);
    }
  };

  const renderParticipantMeta = (participant) => (
    <div className="voice-room-stage__card-meta">
      <div className="voice-room-stage__card-copy">
        <strong>{participant.name || "Участник"}</strong>
        <span>
          {participant.isLive
            ? "Смотреть стрим"
            : participant.isSpeaking
              ? "Сейчас говорит"
              : participant.isSelf
                ? "Это вы"
                : "В голосовом канале"}
        </span>
      </div>
      <div className="voice-room-stage__card-flags">
        <span className="voice-room-stage__card-role" style={{ backgroundColor: participant.roleColor || "#7b89a8" }} aria-hidden="true" />
        {participant.isMicMuted ? <span className="voice-room-stage__card-flag">Микрофон выкл.</span> : null}
        {participant.isDeafened ? <span className="voice-room-stage__card-flag">Без звука</span> : null}
      </div>
    </div>
  );

  return (
    <section className="voice-room-stage">
      <div className="voice-room-stage__header">
        <div className="voice-room-stage__header-copy">
          <span>{activeServerName || "Сервер"}</span>
          <strong>{channelName || "Голосовой канал"}</strong>
          <span>{formatParticipantCount(participants.length)}</span>
        </div>
        <div className="voice-room-stage__header-actions">
          {hasLocalSharePreview ? (
            <button
              type="button"
              className={`voice-room-stage__header-button ${isLocalStage ? "voice-room-stage__header-button--active" : ""}`}
              onClick={isLocalStage ? onCloseLocalSharePreview : onOpenLocalSharePreview}
            >
              {isLocalStage ? "Скрыть мой эфир" : localSharePreview?.mode === "camera" ? "Моё видео" : "Мой стрим"}
            </button>
          ) : null}
        </div>
      </div>

      {activeStage ? (
        <>
          <div className="voice-room-stage__hero" ref={shellRef}>
            <VoiceStageMedia
              stream={activeStage.stream}
              videoSrc={activeStage.videoSrc}
              imageSrc={activeStage.imageSrc}
              alt={activeStage.name}
              className="voice-room-stage__hero-media"
              contain
            />
            {!activeStage.stream && !activeStage.videoSrc && !activeStage.imageSrc ? (
              <div className="voice-room-stage__hero-empty">
                <AnimatedAvatar className="voice-room-stage__hero-empty-avatar" src={activeStage.avatar} alt={activeStage.name} />
                <strong>{activeStage.name}</strong>
                <span>Поток ещё подключается</span>
              </div>
            ) : null}

            <div className="voice-room-stage__hero-top">
              <div className="voice-room-stage__hero-badges">
                <span className="voice-room-stage__pill">{getStreamBadge(activeStage)}</span>
                {getResolutionBadge(activeStage) ? <span className="voice-room-stage__pill">{getResolutionBadge(activeStage)}</span> : null}
              </div>
              <div className="voice-room-stage__hero-actions">
                <button type="button" className="voice-room-stage__overlay-button" onClick={requestFullscreen}>
                  На весь экран
                </button>
                {activeStage.kind === "local" ? (
                  <button
                    type="button"
                    className="voice-room-stage__overlay-button voice-room-stage__overlay-button--danger"
                    onClick={activeStage.mode === "camera" ? onStopCameraShare : onStopScreenShare}
                  >
                    {activeStage.mode === "camera" ? "Остановить камеру" : "Остановить стрим"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="voice-room-stage__overlay-button"
                  onClick={activeStage.kind === "local" ? onCloseLocalSharePreview : onCloseSelectedStream}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="voice-room-stage__hero-bottom">
              <div className="voice-room-stage__hero-person">
                <AnimatedAvatar className="voice-room-stage__hero-avatar" src={activeStage.avatar} alt={activeStage.name} />
                <div className="voice-room-stage__hero-copy">
                  <strong>{activeStage.name}</strong>
                  <span>{activeStage.subtitle}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="voice-room-stage__strip" role="list" aria-label="Участники голосового канала">
            {stageCards.map((participant) => (
              <button
                key={participant.userId || participant.name}
                type="button"
                className={`voice-room-stage__strip-card ${participant.isSelected ? "voice-room-stage__strip-card--active" : ""} ${participant.isSpeaking ? "voice-room-stage__strip-card--speaking" : ""}`}
                onClick={() => handleCardClick(participant)}
                disabled={!participant.canOpen}
              >
                <div className="voice-room-stage__strip-media">
                  {participant.share ? (
                    <VoiceStageMedia
                      stream={participant.share.stream || null}
                      videoSrc={participant.share.videoSrc || ""}
                      imageSrc={participant.share.imageSrc || ""}
                      alt={participant.name}
                      className="voice-room-stage__strip-video"
                    />
                  ) : (
                    <div className="voice-room-stage__strip-avatar-shell" style={{ backgroundColor: participant.roleColor || "#2f3545" }}>
                      <AnimatedAvatar className="voice-room-stage__strip-avatar" src={participant.avatar} alt={participant.name} />
                    </div>
                  )}
                  {participant.isLive ? <span className="voice-room-stage__strip-badge">В ЭФИРЕ</span> : null}
                </div>
                <div className="voice-room-stage__strip-copy">
                  <strong>{participant.name}</strong>
                  <span>{participant.isLive ? "Открыть эфир" : participant.isSelf ? "Это вы" : "В комнате"}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : stageCards.length ? (
        <div className="voice-room-stage__grid">
          {stageCards.map((participant) => (
            <button
              key={participant.userId || participant.name}
              type="button"
              className={`voice-room-stage__card ${participant.isSpeaking ? "voice-room-stage__card--speaking" : ""} ${participant.isLive ? "voice-room-stage__card--live" : ""}`}
              onClick={() => handleCardClick(participant)}
              disabled={!participant.canOpen}
            >
              <div className="voice-room-stage__card-media">
                {participant.share ? (
                  <>
                    <VoiceStageMedia
                      stream={participant.share.stream || null}
                      videoSrc={participant.share.videoSrc || ""}
                      imageSrc={participant.share.imageSrc || ""}
                      alt={participant.name}
                      className="voice-room-stage__card-video"
                    />
                    <div className="voice-room-stage__card-scrim" aria-hidden="true" />
                  </>
                ) : (
                  <div className="voice-room-stage__card-placeholder" style={{ backgroundColor: participant.roleColor || "#2f3545" }}>
                    <AnimatedAvatar className="voice-room-stage__card-avatar" src={participant.avatar} alt={participant.name} />
                  </div>
                )}

                {participant.isLive ? (
                  <div className="voice-room-stage__card-cta">
                    <span className="voice-room-stage__card-watch">Смотреть стрим</span>
                  </div>
                ) : null}
              </div>
              {renderParticipantMeta(participant)}
            </button>
          ))}
        </div>
      ) : (
        <div className="voice-room-stage__empty">
          <strong>Пока никого нет</strong>
          <span>Как только участники зайдут в канал, здесь появятся их карточки.</span>
        </div>
      )}
    </section>
  );
}

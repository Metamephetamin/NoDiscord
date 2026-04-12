import AnimatedAvatar from "./AnimatedAvatar";

export default function MobileVoiceRoom({
  stageMode,
  stageCopy,
  spotlightParticipant,
  stageShellRef,
  stageVideoRef,
  stageImageRef,
  selectedStream,
  localSharePreview,
  participants,
  canInvite,
  isMicMuted,
  isSoundMuted,
  isScreenShareActive,
  isCameraShareActive,
  icons,
  onOpenFullscreen,
  onCloseRemoteStream,
  onCloseLocalPreview,
  onStopScreenShare,
  onStopCameraShare,
  onWatchStream,
  onInvite,
  onToggleMic,
  onToggleSound,
  onOpenChat,
  onScreenShareAction,
  onOpenCamera,
  onLeave,
}) {
  return (
    <section className="mobile-voice-room">
      <div className="mobile-voice-room__stage">
        <div className={`mobile-voice-room__spotlight ${spotlightParticipant?.isSpeaking ? "mobile-voice-room__spotlight--speaking" : ""} ${stageMode !== "spotlight" ? "mobile-voice-room__spotlight--media" : ""}`}>
          <div className="mobile-voice-room__spotlight-glow" aria-hidden="true" />
          {stageMode === "spotlight" ? (
            <AnimatedAvatar
              className={`mobile-voice-room__spotlight-avatar ${spotlightParticipant?.isSpeaking ? "mobile-voice-room__spotlight-avatar--speaking" : ""}`}
              src={spotlightParticipant?.avatar || ""}
              alt={spotlightParticipant?.name || "Участник"}
            />
          ) : (
            <div ref={stageShellRef} className="mobile-voice-room__stage-media-shell">
              {stageMode === "remote" && !selectedStream?.stream && selectedStream?.imageSrc ? (
                <img
                  ref={stageImageRef}
                  className="mobile-voice-room__stage-media"
                  src={selectedStream.imageSrc}
                  alt={stageCopy.title}
                />
              ) : (
                <video ref={stageVideoRef} className="mobile-voice-room__stage-media" autoPlay playsInline muted />
              )}
              <div className="mobile-voice-room__stage-media-overlay" aria-hidden="true" />
            </div>
          )}
          {stageMode === "spotlight" ? (
            <>
              <div className="mobile-voice-room__spotlight-copy">
                <strong>{stageCopy.title}</strong>
                <span>{stageCopy.subtitle}</span>
              </div>
              <div className="mobile-voice-room__spotlight-badges">
                {stageCopy.badge ? <span className={`mobile-voice-room__badge ${stageCopy.badge === "LIVE" ? "mobile-voice-room__badge--live" : ""}`}>{stageCopy.badge}</span> : null}
              </div>
            </>
          ) : null}
          {stageMode === "remote" ? (
            <div className="mobile-voice-room__stage-actions">
              <button type="button" className="mobile-voice-room__stage-action mobile-voice-room__stage-action--icon" onClick={onOpenFullscreen} aria-label="Открыть эфир на весь экран" title="На весь экран">
                ⛶
              </button>
              <button type="button" className="mobile-voice-room__stage-action mobile-voice-room__stage-action--icon" onClick={onCloseRemoteStream} aria-label="Закрыть эфир" title="Закрыть эфир">
                x
              </button>
            </div>
          ) : null}
          {stageMode === "local" ? (
            <div className="mobile-voice-room__stage-actions">
              <button type="button" className="mobile-voice-room__stage-action mobile-voice-room__stage-action--icon" onClick={onOpenFullscreen} aria-label="Открыть предпросмотр на весь экран" title="На весь экран">
                ⛶
              </button>
              <button type="button" className="mobile-voice-room__stage-action mobile-voice-room__stage-action--icon" onClick={onCloseLocalPreview} aria-label="Скрыть предпросмотр" title="Скрыть">
                x
              </button>
              <button
                type="button"
                className="mobile-voice-room__stage-action mobile-voice-room__stage-action--icon mobile-voice-room__stage-action--danger"
                onClick={localSharePreview?.mode === "camera" ? onStopCameraShare : onStopScreenShare}
                aria-label={localSharePreview?.mode === "camera" ? "Остановить камеру" : "Остановить стрим"}
                title={localSharePreview?.mode === "camera" ? "Остановить камеру" : "Остановить стрим"}
              >
                ■
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mobile-voice-room__participants">
        {participants.map((participant) => (
          <button
            key={participant.userId || participant.name}
            type="button"
            className={`mobile-voice-room__participant ${participant.isSpeaking ? "mobile-voice-room__participant--speaking" : ""} ${participant.isLive ? "mobile-voice-room__participant--live" : ""}`}
            onClick={participant.isLive ? () => onWatchStream(participant.userId) : undefined}
            disabled={!participant.isLive}
          >
            <AnimatedAvatar className="mobile-voice-room__participant-avatar" src={participant.avatar} alt={participant.name} />
            <div className="mobile-voice-room__participant-copy">
              <strong>{participant.name}</strong>
              <span>
                {participant.isLive
                  ? "Открыть эфир"
                  : participant.isSpeaking
                    ? "Говорит"
                    : participant.isSelf
                      ? "Это вы"
                      : "В комнате"}
              </span>
            </div>
            <div className="mobile-voice-room__participant-meta">
              <span className="mobile-voice-room__participant-role" style={{ backgroundColor: participant.roleColor }} aria-hidden="true" />
              {participant.isMicMuted ? <span className="mobile-voice-room__participant-flag mobile-voice-room__participant-flag--slashed"><img src={icons.microphone} alt="" /></span> : null}
              {participant.isDeafened ? <span className="mobile-voice-room__participant-flag mobile-voice-room__participant-flag--slashed"><img src={icons.headphones} alt="" /></span> : null}
            </div>
          </button>
        ))}
      </div>

      {canInvite ? (
        <button type="button" className="mobile-voice-room__invite" onClick={onInvite}>
          <span className="mobile-voice-room__invite-icon" aria-hidden="true">✦</span>
          <span className="mobile-voice-room__invite-copy">
            <strong>Пригласить на сервер</strong>
            <span>Полная ссылка на сервер скопируется в буфер обмена.</span>
          </span>
          <span className="mobile-voice-room__invite-arrow" aria-hidden="true">›</span>
        </button>
      ) : null}

      <div className="mobile-voice-room__controls" role="toolbar" aria-label="Управление голосовым чатом">
        <button
          type="button"
          className={`mobile-voice-room__control ${isMicMuted || isSoundMuted ? "mobile-voice-room__control--muted" : ""}`}
          onClick={onToggleMic}
          aria-label={isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
          title={isMicMuted ? "Включить микрофон" : "Выключить микрофон"}
        >
          <span className={`mobile-voice-room__control-icon ${isMicMuted || isSoundMuted ? "mobile-voice-room__control-icon--slashed" : ""}`}>
            <img src={icons.microphone} alt="" />
          </span>
        </button>
        <button
          type="button"
          className={`mobile-voice-room__control ${isSoundMuted ? "mobile-voice-room__control--muted" : ""}`}
          onClick={onToggleSound}
          aria-label={isSoundMuted ? "Включить звук" : "Выключить звук"}
          title={isSoundMuted ? "Включить звук" : "Выключить звук"}
        >
          <span className={`mobile-voice-room__control-icon ${isSoundMuted ? "mobile-voice-room__control-icon--slashed" : ""}`}>
            <img src={icons.headphones} alt="" />
          </span>
        </button>
        <button type="button" className="mobile-voice-room__control" onClick={onOpenChat} aria-label="Перейти в чат" title="Перейти в чат">
          <span className="mobile-voice-room__control-icon">
            <img src={icons.chat} alt="" />
          </span>
        </button>
        <button
          type="button"
          className={`mobile-voice-room__control ${isScreenShareActive ? "mobile-voice-room__control--active" : ""}`}
          onClick={onScreenShareAction}
          aria-label={isScreenShareActive ? "Остановить трансляцию экрана" : "Начать трансляцию экрана"}
          title={isScreenShareActive ? "Остановить трансляцию экрана" : "Начать трансляцию экрана"}
        >
          <span className="mobile-voice-room__control-icon">
            <img src={icons.monitor} alt="" />
          </span>
        </button>
        <button
          type="button"
          className={`mobile-voice-room__control ${isCameraShareActive ? "mobile-voice-room__control--active" : ""}`}
          onClick={onOpenCamera}
          aria-label={isCameraShareActive ? "Управление камерой" : "Открыть камеру"}
          title={isCameraShareActive ? "Управление камерой" : "Открыть камеру"}
        >
          <span className="mobile-voice-room__control-icon">
            <img src={icons.camera} alt="" />
          </span>
        </button>
        <button type="button" className="mobile-voice-room__control mobile-voice-room__control--danger" onClick={onLeave} aria-label="Отключиться от голосового канала" title="Отключиться от голосового канала">
          <span className="mobile-voice-room__control-icon">
            <img src={icons.phone} alt="" />
          </span>
        </button>
      </div>
    </section>
  );
}

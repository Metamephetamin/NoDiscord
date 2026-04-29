import { useEffect, useMemo, useRef, useState } from "react";
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

const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));

const createFallbackAccent = (seed = "") => {
  let hash = 0;
  const normalizedSeed = String(seed || "voice-stage");

  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash = normalizedSeed.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 58 + (Math.abs(hash) % 18);
  const lightness = 52 + (Math.abs(hash) % 10);
  const chroma = ((100 - Math.abs((2 * lightness) / 100 - 1)) * saturation) / 100;
  const huePrime = hue / 60;
  const secondComponent = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = secondComponent;
  } else if (huePrime < 2) {
    red = secondComponent;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondComponent;
  } else if (huePrime < 4) {
    green = secondComponent;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondComponent;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondComponent;
  }

  const match = lightness / 100 - chroma / 2;
  return {
    r: clampChannel((red + match) * 255),
    g: clampChannel((green + match) * 255),
    b: clampChannel((blue + match) * 255),
  };
};

const buildAccentVariables = (accent) => ({
  "--voice-stage-accent-rgb": `${accent.r}, ${accent.g}, ${accent.b}`,
});

const extractAccentFromImage = (src, seed) =>
  new Promise((resolve) => {
    if (!src) {
      resolve(createFallbackAccent(seed));
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 24;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (!context) {
          resolve(createFallbackAccent(seed || src));
          return;
        }

        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        let red = 0;
        let green = 0;
        let blue = 0;
        let weightTotal = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3] / 255;
          if (alpha < 0.45) {
            continue;
          }

          const pixelRed = data[index];
          const pixelGreen = data[index + 1];
          const pixelBlue = data[index + 2];
          const brightness = (pixelRed + pixelGreen + pixelBlue) / 3;
          const maxChannel = Math.max(pixelRed, pixelGreen, pixelBlue);
          const minChannel = Math.min(pixelRed, pixelGreen, pixelBlue);
          const saturation = maxChannel - minChannel;
          const weight = alpha * (0.35 + saturation / 255) * (0.75 + brightness / 255);

          red += pixelRed * weight;
          green += pixelGreen * weight;
          blue += pixelBlue * weight;
          weightTotal += weight;
        }

        if (weightTotal <= 0) {
          resolve(createFallbackAccent(seed || src));
          return;
        }

        resolve({
          r: clampChannel(red / weightTotal),
          g: clampChannel(green / weightTotal),
          b: clampChannel(blue / weightTotal),
        });
      } catch {
        resolve(createFallbackAccent(seed || src));
      }
    };

    image.onerror = () => resolve(createFallbackAccent(seed || src));
    image.src = src;
  });

function VoiceStageMedia({ stream, videoSrc, imageSrc, alt, className, contain = false, muted = true }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current || (!stream && !videoSrc)) {
      return undefined;
    }

    const mediaElement = videoRef.current;
    mediaElement.srcObject = stream || null;
    mediaElement.src = stream ? "" : videoSrc || "";
    mediaElement.muted = muted;

    mediaElement.play().catch(() => {});

    return () => {
      mediaElement.srcObject = null;
      mediaElement.src = "";
    };
  }, [muted, stream, videoSrc]);

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
    return <video ref={videoRef} className={`${className} ${contain ? "voice-room-stage__media--contain" : ""}`.trim()} autoPlay playsInline muted={muted} />;
  }

  if (imageSrc) {
    return <img src={imageSrc} alt={alt} className={`${className} ${contain ? "voice-room-stage__media--contain" : ""}`.trim()} />;
  }

  return null;
}

function captureVoiceStagePreviewFrame({ stream, videoSrc }) {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || (!stream && !videoSrc)) {
      resolve("");
      return;
    }

    const mediaElement = document.createElement("video");
    mediaElement.playsInline = true;
    mediaElement.muted = true;
    mediaElement.preload = "metadata";
    mediaElement.srcObject = stream || null;
    mediaElement.src = stream ? "" : videoSrc || "";

    let settled = false;
    let timeoutId = 0;

    const cleanup = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      mediaElement.pause();
      mediaElement.srcObject = null;
      mediaElement.src = "";
      mediaElement.load();
    };

    const finish = (value = "") => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const drawFrame = () => {
      const width = Number(mediaElement.videoWidth || 0);
      const height = Number(mediaElement.videoHeight || 0);
      if (!width || !height) {
        finish("");
        return;
      }

      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          finish("");
          return;
        }

        context.drawImage(mediaElement, 0, 0, width, height);
        finish(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        finish("");
      }
    };

    mediaElement.addEventListener("loadeddata", drawFrame, { once: true });
    mediaElement.addEventListener("error", () => finish(""), { once: true });
    timeoutId = window.setTimeout(() => finish(""), 2200);
    mediaElement.play().catch(() => {});
  });
}

function VoiceStagePreviewMedia({ share, alt, className }) {
  const [capturedPreview, setCapturedPreview] = useState({
    stream: null,
    videoSrc: "",
    updatedAt: "",
    src: "",
  });

  const staticPreview = String(share?.imageSrc || "").trim();
  const previewStream = share?.stream || null;
  const previewVideoSrc = String(share?.videoSrc || "").trim();
  const previewUpdatedAt = String(share?.updatedAt || "");

  useEffect(() => {
    if (staticPreview) {
      return undefined;
    }

    if (!previewStream && !previewVideoSrc) {
      return undefined;
    }

    let cancelled = false;
    captureVoiceStagePreviewFrame({
      stream: previewStream,
      videoSrc: previewVideoSrc,
    }).then((nextPreviewSrc) => {
      if (!cancelled) {
        setCapturedPreview({
          stream: previewStream,
          videoSrc: previewVideoSrc,
          updatedAt: previewUpdatedAt,
          src: nextPreviewSrc || "",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [previewStream, previewUpdatedAt, previewVideoSrc, staticPreview]);

  const previewSrc = staticPreview || (
    capturedPreview.stream === previewStream
      && capturedPreview.videoSrc === previewVideoSrc
      && capturedPreview.updatedAt === previewUpdatedAt
      ? capturedPreview.src
      : ""
  );

  if (previewSrc) {
    return <img src={previewSrc} alt={alt} className={className} />;
  }

  return <div className={`${className} voice-room-stage__strip-preview-placeholder`.trim()} aria-hidden="true" />;
}

function VoiceStageIcon({ name, className = "voice-room-stage__toolbar-icon" }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    className,
  };

  switch (name) {
    case "mic":
      return (
        <svg {...commonProps}>
          <path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z" />
          <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
          <path d="M12 17v3" />
          <path d="M9 20h6" />
        </svg>
      );
    case "headphones":
      return (
        <svg {...commonProps}>
          <path d="M4 13a8 8 0 0 1 16 0" />
          <path d="M5 13h2a2 2 0 0 1 2 2v2.5A1.5 1.5 0 0 1 7.5 19h-1A2.5 2.5 0 0 1 4 16.5V14a1 1 0 0 1 1-1Z" />
          <path d="M19 13h-2a2 2 0 0 0-2 2v2.5a1.5 1.5 0 0 0 1.5 1.5h1a2.5 2.5 0 0 0 2.5-2.5V14a1 1 0 0 0-1-1Z" />
        </svg>
      );
    case "chat":
      return (
        <svg {...commonProps}>
          <path d="M6 7.5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H11l-4 3v-3H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "screen":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="M9 19h6" />
          <path d="M12 16v3" />
        </svg>
      );
    case "camera":
      return (
        <svg {...commonProps}>
          <path d="M8 8h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
          <path d="m17 11 3-2v8l-3-2" />
        </svg>
      );
    case "focus":
      return (
        <svg {...commonProps}>
          <path d="M9 4H5a1 1 0 0 0-1 1v4" />
          <path d="M15 4h4a1 1 0 0 1 1 1v4" />
          <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
          <path d="M4 15v4a1 1 0 0 0 1 1h4" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "live":
      return (
        <svg {...commonProps}>
          <path d="M5 12a7 7 0 0 1 7-7" />
          <path d="M19 12a7 7 0 0 0-7-7" />
          <path d="M7.5 12a4.5 4.5 0 0 1 4.5-4.5" />
          <path d="M16.5 12A4.5 4.5 0 0 0 12 7.5" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
        </svg>
      );
    case "preview":
      return (
        <svg {...commonProps}>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
      );
    case "fullscreen":
      return (
        <svg {...commonProps}>
          <path d="M9 4H4v5" />
          <path d="m4 4 6 6" />
          <path d="M15 4h5v5" />
          <path d="m20 4-6 6" />
          <path d="M9 20H4v-5" />
          <path d="m4 20 6-6" />
          <path d="M15 20h5v-5" />
          <path d="m20 20-6-6" />
        </svg>
      );
    case "close":
      return (
        <svg {...commonProps}>
          <path d="m7 7 10 10" />
          <path d="M17 7 7 17" />
        </svg>
      );
    case "leave":
      return (
        <svg {...commonProps}>
          <path d="M9 8c-4 0-6 2.5-6 4v2h4v-2c0-.5.7-1.5 2-1.5h6c1.3 0 2 1 2 1.5v2h4v-2c0-1.5-2-4-6-4H9Z" />
          <path d="M12 12v5" />
        </svg>
      );
    default:
      return null;
  }
}

function VoiceStageStatusBadge({ name, label }) {
  return (
    <span className="voice-room-stage__status-badge voice-room-stage__status-badge--slashed" title={label} aria-label={label}>
      <VoiceStageIcon name={name} className="voice-room-stage__status-icon" />
    </span>
  );
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
  onPreviewStream,
  onWatchStream,
  onOpenLocalSharePreview,
  onCloseSelectedStream,
  onCloseLocalSharePreview,
  onStopScreenShare,
  onStopCameraShare,
  isMicMuted = false,
  isSoundMuted = false,
  isScreenShareActive = false,
  isCameraShareActive = false,
  onToggleMic,
  onToggleSound,
  onOpenTextChat,
  onScreenShareAction,
  onOpenCamera,
  onLeave,
  isJoining = false,
  pendingParticipant = null,
}) {
  const shellRef = useRef(null);
  const [avatarAccentMap, setAvatarAccentMap] = useState({});
  const [inlineStreamUserIds, setInlineStreamUserIds] = useState(() => new Set());
  const isEffectiveMicMuted = Boolean(isMicMuted || isSoundMuted);
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
  const activeSpeakerParticipant = useMemo(
    () => stageCards.find((participant) => participant.isSpeaking) || null,
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
        hasAudio: Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length),
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
        hasAudio: false,
        width: Number(localSharePreview.stream?.getVideoTracks?.()[0]?.getSettings?.().width || 0),
        height: Number(localSharePreview.stream?.getVideoTracks?.()[0]?.getSettings?.().height || 0),
        fps: Number(localSharePreview.stream?.getVideoTracks?.()[0]?.getSettings?.().frameRate || 0),
        mode: localSharePreview.mode || "screen",
      };
    }

    return null;
  }, [
    isLocalStage,
    isRemoteStage,
    localSharePreview,
    localStageParticipant?.avatar,
    localStageParticipant?.name,
    selectedStream,
    selectedStreamParticipant?.avatar,
    selectedStreamParticipant?.name,
    selectedUserId,
    stageCards,
  ]);

  useEffect(() => {
    const avatarEntries = [
      ...stageCards.map((participant) => ({
        key: String(participant.userId || participant.name || participant.avatar || ""),
        src: participant.avatar || "",
        seed: participant.name || participant.userId || participant.avatar || "",
      })),
      ...(activeStage?.avatar
        ? [{
            key: `active:${activeStage.avatar}`,
            src: activeStage.avatar,
            seed: activeStage.name || activeStage.avatar,
          }]
        : []),
      ...(pendingParticipant?.avatar
        ? [{
            key: `pending:${pendingParticipant.avatar}`,
            src: pendingParticipant.avatar,
            seed: pendingParticipant.name || pendingParticipant.avatar,
          }]
        : []),
    ].filter((entry) => entry.key);

    const unresolvedEntries = avatarEntries.filter((entry) => !avatarAccentMap[entry.key]);
    if (!unresolvedEntries.length) {
      return undefined;
    }

    let isCancelled = false;

    Promise.all(
      unresolvedEntries.map(async (entry) => ({
        key: entry.key,
        accent: await extractAccentFromImage(entry.src, entry.seed),
      }))
    ).then((resolvedEntries) => {
      if (isCancelled) {
        return;
      }

      setAvatarAccentMap((previous) => {
        const next = { ...previous };
        resolvedEntries.forEach(({ key, accent }) => {
          next[key] = accent;
        });
        return next;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [activeStage?.avatar, activeStage?.name, avatarAccentMap, pendingParticipant?.avatar, pendingParticipant?.name, stageCards]);

  const getParticipantAccent = (participant) =>
    avatarAccentMap[String(participant?.userId || participant?.name || participant?.avatar || "")]
    || createFallbackAccent(participant?.name || participant?.userId || participant?.avatar || "");

  const activeStageAccent = activeStage?.avatar
    ? avatarAccentMap[`active:${activeStage.avatar}`] || createFallbackAccent(activeStage.name || activeStage.avatar)
    : pendingParticipant?.avatar
      ? avatarAccentMap[`pending:${pendingParticipant.avatar}`] || createFallbackAccent(pendingParticipant.name || pendingParticipant.avatar)
      : createFallbackAccent(activeStage?.name || pendingParticipant?.name || "voice-stage");

  const handleCardClick = (participant) => {
    if (!participant) {
      return;
    }

    const participantUserId = String(participant.userId || "");
    const isInlineStreamActive = Boolean(participant.share && inlineStreamUserIds.has(participantUserId));

    if (participant.isSelf && participant.share) {
      if (isInlineStreamActive) {
        onOpenLocalSharePreview?.();
        return;
      }

      setInlineStreamUserIds((previous) => {
        const next = new Set(previous);
        next.add(participantUserId);
        return next;
      });
      onPreviewStream?.(participant.userId);
      return;
    }

    if (participant.isLive && isInlineStreamActive) {
      onWatchStream?.(participant.userId);
      return;
    }

    if (participant.isLive) {
      setInlineStreamUserIds((previous) => {
        const next = new Set(previous);
        next.add(participantUserId);
        return next;
      });
      onPreviewStream?.(participant.userId);
      return;
    }
  };

  const renderParticipantMeta = (participant) => {
    const isStreamCard = Boolean(participant.share || participant.isLive);
    const subtitle = isStreamCard
      ? ""
      : participant.isSpeaking
        ? "Сейчас говорит"
        : participant.isSelf
          ? "Это вы"
          : "В голосовом канале";

    return (
    <div className="voice-room-stage__card-meta">
      <div className="voice-room-stage__card-copy">
        <strong>{participant.name || "Участник"}</strong>
        {subtitle ? <span>
          {participant.isLive
            ? "Смотреть стрим"
            : participant.isSpeaking
              ? "Сейчас говорит"
              : participant.isSelf
                ? "Это вы"
                : "В голосовом канале"}
        </span> : null}
      </div>
      <div className="voice-room-stage__card-flags">
        <span className="voice-room-stage__card-role" style={buildAccentVariables(getParticipantAccent(participant))} aria-hidden="true" />
        {participant.isMicMuted ? <VoiceStageStatusBadge name="mic" label="Микрофон выключен" /> : null}
        {participant.isDeafened ? <VoiceStageStatusBadge name="headphones" label="Звук отключен" /> : null}
      </div>
    </div>
    );
  };

  const renderStripCards = () => (
    <div className="voice-room-stage__strip" role="list" aria-label="Участники голосового канала">
      {stageCards.map((participant) => (
        <button
          key={participant.userId || participant.name}
          type="button"
          className={`voice-room-stage__strip-card ${participant.isSelected ? "voice-room-stage__strip-card--active" : ""} ${participant.isSpeaking ? "voice-room-stage__strip-card--speaking" : ""}`}
          onClick={() => handleCardClick(participant)}
          disabled={!participant.canOpen}
          style={buildAccentVariables(getParticipantAccent(participant))}
        >
          <div className="voice-room-stage__strip-media">
            {participant.share ? (
              <VoiceStagePreviewMedia
                share={participant.share}
                alt={participant.name}
                className="voice-room-stage__strip-video"
              />
            ) : (
              <div className="voice-room-stage__strip-avatar-shell">
                <AnimatedAvatar className="voice-room-stage__strip-avatar" src={participant.avatar} alt={participant.name} />
              </div>
            )}
            {participant.isLive ? <span className="voice-room-stage__strip-badge">LIVE</span> : null}
            {participant.share ? (
              <>
                <div className="voice-room-stage__card-scrim" aria-hidden="true" />
                <div className="voice-room-stage__card-cta" aria-hidden="true">
                  <span className="voice-room-stage__card-watch">Смотреть</span>
                </div>
              </>
            ) : null}
          </div>
          <div className="voice-room-stage__strip-copy">
            <strong>{participant.name}</strong>
            <span>{participant.isLive ? "Открыть эфир" : participant.isSelf ? "Это вы" : "В комнате"}</span>
          </div>
        </button>
      ))}
    </div>
  );

  const renderToolbarButton = ({
    key,
    icon,
    label,
    onClick,
    active = false,
    danger = false,
    muted = false,
    disabled = false,
  }) => (
    <button
      key={key}
      type="button"
      className={`voice-room-stage__toolbar-button ${active ? "voice-room-stage__toolbar-button--active" : ""} ${danger ? "voice-room-stage__toolbar-button--danger" : ""} ${muted ? "voice-room-stage__toolbar-button--muted" : ""}`.trim()}
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      <span className={`voice-room-stage__toolbar-icon-shell ${muted ? "voice-room-stage__toolbar-icon-shell--slashed" : ""}`}>
        <VoiceStageIcon name={icon} />
      </span>
    </button>
  );

  const stageToolbar = (
    <div className="voice-room-stage__toolbar-shell">
      {activeStage ? renderStripCards() : null}

      <div className="voice-room-stage__toolbar" role="toolbar" aria-label="Управление голосовой комнатой">
        <div className="voice-room-stage__toolbar-group">
          {renderToolbarButton({
            key: "mic",
            icon: "mic",
            label: isMicMuted ? "Включить микрофон" : "Выключить микрофон",
            onClick: onToggleMic,
            muted: isEffectiveMicMuted,
          })}
          {renderToolbarButton({
            key: "headphones",
            icon: "headphones",
            label: isSoundMuted ? "Включить звук" : "Отключить звук",
            onClick: onToggleSound,
            muted: isSoundMuted,
          })}
        </div>

        <div className="voice-room-stage__toolbar-group">
          {renderToolbarButton({
            key: "chat",
            icon: "chat",
            label: "Перейти в чат канала",
            onClick: onOpenTextChat,
          })}
          {renderToolbarButton({
            key: "screen",
            icon: "screen",
            label: isScreenShareActive ? "Остановить трансляцию экрана" : "Начать трансляцию экрана",
            onClick: onScreenShareAction,
            active: isScreenShareActive,
          })}
          {renderToolbarButton({
            key: "camera",
            icon: "camera",
            label: isCameraShareActive ? "Управление камерой" : "Включить камеру",
            onClick: onOpenCamera,
            active: isCameraShareActive,
          })}
        </div>

        <div className="voice-room-stage__toolbar-group">
          {hasLocalSharePreview
            ? renderToolbarButton({
                key: "preview",
                icon: "preview",
                label: isLocalStage ? "Скрыть мой эфир" : localSharePreview?.mode === "camera" ? "Открыть моё видео" : "Открыть мой эфир",
                onClick: isLocalStage ? onCloseLocalSharePreview : onOpenLocalSharePreview,
                active: isLocalStage,
              })
            : null}
          {activeStage ? (
            <button
              type="button"
              className="voice-room-stage__toolbar-button"
              aria-label="Открыть сцену на весь экран"
              title="Открыть сцену на весь экран"
              onClick={async () => {
                try {
                  await shellRef.current?.requestFullscreen?.();
                } catch (error) {
                  console.error("Ошибка перехода в полноэкранный режим голосовой сцены:", error);
                }
              }}
            >
              <VoiceStageIcon name="fullscreen" />
            </button>
          ) : null}
          {activeStage
            ? renderToolbarButton({
                key: "close-stage",
                icon: "close",
                label: activeStage.kind === "local" ? "Скрыть предпросмотр" : "Закрыть эфир",
                onClick: activeStage.kind === "local" ? onCloseLocalSharePreview : onCloseSelectedStream,
              })
            : null}
        </div>

        <div className="voice-room-stage__toolbar-group voice-room-stage__toolbar-group--danger">
          {activeStage?.kind === "local"
            ? renderToolbarButton({
                key: "stop-local",
                icon: "close",
                label: activeStage.mode === "camera" ? "Остановить камеру" : "Остановить стрим",
                onClick: activeStage.mode === "camera" ? onStopCameraShare : onStopScreenShare,
                danger: true,
              })
            : null}
          {renderToolbarButton({
            key: "leave",
            icon: "leave",
            label: "Отключиться от голосового канала",
            onClick: onLeave,
            danger: true,
          })}
        </div>
      </div>
    </div>
  );

  return (
    <section className={`voice-room-stage ${activeStage ? "voice-room-stage--active-stream" : ""}`}>
      <div className="voice-room-stage__header">
        <div className="voice-room-stage__header-copy">
          <span>{activeServerName || "Сервер"}</span>
          <strong>{channelName || "Голосовой канал"}</strong>
          <span>{formatParticipantCount(participants.length)}</span>
        </div>
      </div>

      {activeStage ? (
        <div className="voice-room-stage__hero" ref={shellRef} style={buildAccentVariables(activeStageAccent)}>
          <VoiceStageMedia
            stream={activeStage.stream}
            videoSrc={activeStage.videoSrc}
            imageSrc={activeStage.imageSrc}
            alt={activeStage.name}
            className="voice-room-stage__hero-media"
            contain
            muted={activeStage.kind !== "remote" || !activeStage.hasAudio}
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
          <div className="voice-room-stage__hero-controls">
            {stageToolbar}
          </div>
        </div>
      ) : stageCards.length ? (
        <div className="voice-room-stage__grid">
          {stageCards.map((participant) => {
            const participantUserId = String(participant.userId || "");
            const isStreamCard = Boolean(participant.share || participant.isLive);
            const isInlineStreamActive = Boolean(participant.share && inlineStreamUserIds.has(participantUserId));

            return (
            <button
              key={participant.userId || participant.name}
              type="button"
              className={`voice-room-stage__card ${participant.isSelf ? "voice-room-stage__card--self" : ""} ${participant.isSpeaking ? "voice-room-stage__card--speaking" : ""} ${participant.isLive ? "voice-room-stage__card--live" : ""} ${isStreamCard ? "voice-room-stage__card--stream" : ""} ${isInlineStreamActive ? "voice-room-stage__card--stream-inline" : ""}`}
              onClick={() => handleCardClick(participant)}
              disabled={!participant.canOpen}
              style={buildAccentVariables(getParticipantAccent(participant))}
            >
              <div className="voice-room-stage__card-media">
                {participant.share ? (
                  <>
                    <VoiceStagePreviewMedia
                      share={participant.share}
                      alt={participant.name}
                      className="voice-room-stage__card-video"
                    />
                    {!isInlineStreamActive ? <div className="voice-room-stage__card-scrim" aria-hidden="true" /> : null}
                  </>
                ) : (
                  <div className="voice-room-stage__card-placeholder">
                    <AnimatedAvatar className="voice-room-stage__card-avatar" src={participant.avatar} alt={participant.name} />
                  </div>
                )}

                {participant.isLive && !isInlineStreamActive ? (
                  <div className="voice-room-stage__card-cta">
                    <span className="voice-room-stage__card-watch">Смотреть стрим</span>
                  </div>
                ) : null}
                {isStreamCard ? renderParticipantMeta(participant) : null}
              </div>
              {!isStreamCard ? renderParticipantMeta(participant) : null}
            </button>
            );
          })}
        </div>
      ) : isJoining ? (
        <div className="voice-room-stage__empty voice-room-stage__empty--pending">
          <AnimatedAvatar
            className="voice-room-stage__hero-empty-avatar"
            src={pendingParticipant?.avatar || ""}
            alt={pendingParticipant?.name || "Вы"}
          />
          <strong>Подключаемся к каналу...</strong>
          <span>Сцена откроется сразу, как только сервер подтвердит подключение.</span>
        </div>
      ) : (
        <div className="voice-room-stage__empty">
          <strong>Пока никого нет</strong>
          <span>Как только участники зайдут в канал, здесь появятся их карточки.</span>
        </div>
      )}

      {!activeStage && (stageCards.length || isJoining) ? stageToolbar : null}
    </section>
  );
}

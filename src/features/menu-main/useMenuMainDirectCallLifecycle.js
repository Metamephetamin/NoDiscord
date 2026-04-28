import { useEffect, useRef } from "react";
import { startDirectCallTone } from "../../utils/directCallSounds";
import {
  buildDirectCallState,
  DIRECT_CALL_NO_ANSWER_TIMEOUT_MS,
} from "./menuMainDirectCallState";

export default function useMenuMainDirectCallLifecycle({
  directCallState,
  directCallStateRef,
  setDirectCallState,
  voiceClientRef,
  user,
}) {
  const directCallToneStopRef = useRef(null);

  useEffect(() => {
    directCallStateRef.current = directCallState;
  }, [directCallState, directCallStateRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (directCallState.phase !== "outgoing" || !directCallState.startedAt) {
      return undefined;
    }

    const startedAtMs = new Date(directCallState.startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return undefined;
    }

    const timeoutDelay = Math.max(0, DIRECT_CALL_NO_ANSWER_TIMEOUT_MS - (Date.now() - startedAtMs));
    const timeoutId = window.setTimeout(() => {
      const currentCall = directCallStateRef.current;
      if (currentCall.phase !== "outgoing" || currentCall.channelId !== directCallState.channelId) {
        return;
      }

      voiceClientRef.current?.declineDirectCall(currentCall.peerUserId, currentCall.channelId, "no-answer", user).catch((error) => {
        console.error("Не удалось завершить личный звонок по таймауту:", error);
      });
      setDirectCallState(buildDirectCallState({
        ...currentCall,
        phase: "declined",
        statusLabel: "Нет ответа",
        canRetry: true,
        isMiniMode: true,
        lastReason: "no-answer",
        endedAt: new Date().toISOString(),
      }));
    }, timeoutDelay);

    return () => window.clearTimeout(timeoutId);
  }, [
    directCallState.channelId,
    directCallState.phase,
    directCallState.startedAt,
    directCallStateRef,
    setDirectCallState,
    user,
    voiceClientRef,
  ]);

  useEffect(() => {
    let disposed = false;

    directCallToneStopRef.current?.();
    directCallToneStopRef.current = null;

    if (directCallState.phase !== "outgoing" && directCallState.phase !== "incoming") {
      return () => {
        directCallToneStopRef.current?.();
        directCallToneStopRef.current = null;
      };
    }

    void (async () => {
      const stopTone = await startDirectCallTone(directCallState.phase === "incoming" ? "incoming" : "outgoing");
      if (disposed) {
        stopTone?.();
        return;
      }

      directCallToneStopRef.current = stopTone;
    })();

    return () => {
      disposed = true;
      directCallToneStopRef.current?.();
      directCallToneStopRef.current = null;
    };
  }, [directCallState.phase]);
}

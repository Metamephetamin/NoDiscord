import { useCallback, useEffect, useRef } from "react";

export default function useMenuMainSelfVoiceStateSync({ voiceClientRef }) {
  const queuedSelfVoiceStateRef = useRef(null);
  const selfVoiceStateSyncPromiseRef = useRef(null);
  const lastSelfVoiceStateSignatureRef = useRef("");
  const flushQueuedSelfVoiceStateRef = useRef(null);

  const flushQueuedSelfVoiceState = useCallback(() => {
    if (selfVoiceStateSyncPromiseRef.current) {
      return;
    }

    const nextState = queuedSelfVoiceStateRef.current;
    if (!nextState || !voiceClientRef.current) {
      return;
    }

    queuedSelfVoiceStateRef.current = null;
    const signature = `${Number(Boolean(nextState.isMicMuted))}:${Number(Boolean(nextState.isDeafened))}`;
    if (lastSelfVoiceStateSignatureRef.current === signature) {
      return;
    }

    lastSelfVoiceStateSignatureRef.current = signature;
    const syncPromise = voiceClientRef.current.updateSelfVoiceState(nextState)
      .catch((error) => {
        lastSelfVoiceStateSignatureRef.current = "";
        console.error("Ошибка обновления состояния микрофона:", error);
      })
      .finally(() => {
        if (selfVoiceStateSyncPromiseRef.current === syncPromise) {
          selfVoiceStateSyncPromiseRef.current = null;
        }
        if (queuedSelfVoiceStateRef.current) {
          flushQueuedSelfVoiceStateRef.current?.();
        }
      });
    selfVoiceStateSyncPromiseRef.current = syncPromise;
  }, [voiceClientRef]);
  useEffect(() => {
    flushQueuedSelfVoiceStateRef.current = flushQueuedSelfVoiceState;
  }, [flushQueuedSelfVoiceState]);

  const queueSelfVoiceStateSync = useCallback((nextState) => {
    queuedSelfVoiceStateRef.current = {
      isMicMuted: Boolean(nextState?.isMicMuted),
      isDeafened: Boolean(nextState?.isDeafened),
    };
    flushQueuedSelfVoiceState();
  }, [flushQueuedSelfVoiceState]);

  return {
    flushQueuedSelfVoiceState,
    queueSelfVoiceStateSync,
  };
}

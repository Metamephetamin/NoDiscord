import { useCallback, useRef } from "react";
import { getDirectCallChannelId } from "../../utils/directCallModel";
import {
  getDisplayName,
  getUserAvatar,
  getUserAvatarFrame,
} from "../../utils/menuMainModel";
import {
  buildDirectCallState,
  createDirectCallState,
  getDirectCallConnectionQuality,
} from "./menuMainDirectCallState";

export default function useMenuMainDirectCalls({
  currentUserId,
  user,
  directConversationTargets,
  activeLatencyMs,
  directCallStateRef,
  currentVoiceChannelRef,
  voiceClientRef,
  ensureVoiceClientReady,
  disconnectFromActiveVoiceContext,
  openDirectChat,
  setDirectCallState,
  appendDirectCallHistoryEntry,
  showServerInviteFeedback,
}) {
  const directCallActionInFlightRef = useRef(false);

  const setDirectCallMiniMode = useCallback((isMiniMode) => {
    setDirectCallState((previous) => (
      previous.phase === "idle"
        ? previous
        : { ...previous, isMiniMode: Boolean(isMiniMode) }
    ));
  }, [setDirectCallState]);

  const dismissDirectCallOverlay = useCallback(() => {
    if (!["ended", "declined", "disconnected"].includes(String(directCallStateRef.current.phase || ""))) {
      return;
    }

    setDirectCallState(createDirectCallState());
  }, [directCallStateRef, setDirectCallState]);

  const startDirectCallWithUser = useCallback(async (targetUserId) => {
    const normalizedTargetUserId = String(targetUserId || "").trim();
    if (!normalizedTargetUserId || normalizedTargetUserId === currentUserId || !user?.id) {
      return;
    }

    if (directCallActionInFlightRef.current) {
      return;
    }

    if (!voiceClientRef.current) {
      await ensureVoiceClientReady();
    }

    if (!voiceClientRef.current) {
      showServerInviteFeedback("Не удалось подготовить голосовой клиент для звонка.");
      return;
    }

    if (directCallStateRef.current.phase !== "idle") {
      showServerInviteFeedback("Сначала завершите текущий звонок.");
      return;
    }

    directCallActionInFlightRef.current = true;
    const targetUser = directConversationTargets.find((friend) => String(friend?.id || "") === normalizedTargetUserId);
    const channelId = getDirectCallChannelId(currentUserId, normalizedTargetUserId);
    if (!targetUser || !channelId) {
      directCallActionInFlightRef.current = false;
      showServerInviteFeedback("Не удалось подготовить личный звонок.");
      return;
    }

    try {
      if (currentVoiceChannelRef.current && currentVoiceChannelRef.current !== channelId) {
        await disconnectFromActiveVoiceContext();
      }

      setDirectCallState(buildDirectCallState({
        phase: "outgoing",
        statusLabel: "Ожидаем ответ",
        channelId,
        peerUserId: normalizedTargetUserId,
        peerName: getDisplayName(targetUser),
        peerAvatar: getUserAvatar(targetUser),
        peerAvatarFrame: getUserAvatarFrame(targetUser),
        peer: {
          userId: normalizedTargetUserId,
          name: getDisplayName(targetUser),
          avatar: getUserAvatar(targetUser),
          avatarFrame: getUserAvatarFrame(targetUser),
        },
        connectionQuality: "unknown",
        canRetry: true,
        isMiniMode: false,
        direction: "outgoing",
        startedAt: new Date().toISOString(),
      }));
      await voiceClientRef.current.startDirectCall(normalizedTargetUserId, channelId, user);
    } catch (error) {
      console.error("Не удалось начать личный звонок:", error);
      setDirectCallState(buildDirectCallState({
        phase: "disconnected",
        statusLabel: "Не удалось подключить звонок",
        peerUserId: normalizedTargetUserId,
        peerName: targetUser ? getDisplayName(targetUser) : "Пользователь",
        peerAvatar: targetUser ? getUserAvatar(targetUser) : "",
        peerAvatarFrame: targetUser ? getUserAvatarFrame(targetUser) : null,
        canRetry: true,
        isMiniMode: true,
        direction: "outgoing",
        lastReason: error?.message || "failed",
        endedAt: new Date().toISOString(),
      }));
      appendDirectCallHistoryEntry({
        peerUserId: normalizedTargetUserId,
        peerName: targetUser ? getDisplayName(targetUser) : "Пользователь",
        peerAvatar: targetUser ? getUserAvatar(targetUser) : "",
        direction: "outgoing",
        outcome: "failed",
      });
      showServerInviteFeedback(error?.message || "Не удалось начать звонок.");
    } finally {
      directCallActionInFlightRef.current = false;
    }
  }, [
    appendDirectCallHistoryEntry,
    currentUserId,
    currentVoiceChannelRef,
    directCallStateRef,
    directConversationTargets,
    disconnectFromActiveVoiceContext,
    ensureVoiceClientReady,
    setDirectCallState,
    showServerInviteFeedback,
    user,
    voiceClientRef,
  ]);

  const retryDirectCall = useCallback(async () => {
    const targetUserId = String(directCallStateRef.current.peerUserId || "").trim();
    if (!targetUserId) {
      return;
    }

    await startDirectCallWithUser(targetUserId);
  }, [directCallStateRef, startDirectCallWithUser]);

  const acceptDirectCall = useCallback(async () => {
    const currentCall = directCallStateRef.current;
    if (currentCall.phase !== "incoming" || !currentCall.peerUserId || !currentCall.channelId || !user?.id) {
      return;
    }

    if (directCallActionInFlightRef.current) {
      return;
    }

    directCallActionInFlightRef.current = true;
    try {
      if (!voiceClientRef.current) {
        await ensureVoiceClientReady();
      }

      if (!voiceClientRef.current) {
        throw new Error("Не удалось подготовить голосовой клиент для звонка.");
      }

      setDirectCallState((previous) => ({
        ...previous,
        phase: "connecting",
        status: "connecting",
        statusLabel: "Подключаем звонок",
        canRetry: false,
      }));
      openDirectChat(currentCall.peerUserId);

      if (currentVoiceChannelRef.current && currentVoiceChannelRef.current !== currentCall.channelId) {
        await disconnectFromActiveVoiceContext();
      }

      await voiceClientRef.current.acceptDirectCall(currentCall.peerUserId, currentCall.channelId, user);
      await voiceClientRef.current.joinChannel(currentCall.channelId, user);
      if (directCallStateRef.current.channelId !== currentCall.channelId || directCallStateRef.current.phase !== "connecting") {
        if (currentVoiceChannelRef.current === currentCall.channelId) {
          await disconnectFromActiveVoiceContext({ preserveSuppressedChannel: false });
        }
        return;
      }

      setDirectCallState((previous) => (
        previous.channelId === currentCall.channelId && previous.phase === "connecting"
          ? {
              ...previous,
              phase: "connected",
              status: "connected",
              statusLabel: "Идёт разговор",
              isMiniMode: true,
              canRetry: false,
              connectionQuality: getDirectCallConnectionQuality(activeLatencyMs, "connected"),
            }
          : previous
      ));
    } catch (error) {
      console.error("Не удалось принять личный звонок:", error);
      if (currentVoiceChannelRef.current === currentCall.channelId) {
        try {
          await disconnectFromActiveVoiceContext({ preserveSuppressedChannel: false });
        } catch (leaveError) {
          console.error("Не удалось сбросить состояние личного звонка:", leaveError);
        }
      }
      appendDirectCallHistoryEntry({
        peerUserId: currentCall.peerUserId,
        peerName: currentCall.peerName,
        peerAvatar: currentCall.peerAvatar,
        direction: "incoming",
        outcome: "failed",
      });
      setDirectCallState(buildDirectCallState({
        phase: "disconnected",
        statusLabel: "Не удалось подключить звонок",
        peerUserId: currentCall.peerUserId,
        peerName: currentCall.peerName,
        peerAvatar: currentCall.peerAvatar,
        peerAvatarFrame: currentCall.peerAvatarFrame,
        canRetry: true,
        isMiniMode: false,
        direction: "incoming",
        lastReason: error?.message || "failed",
        endedAt: new Date().toISOString(),
      }));
      showServerInviteFeedback(error?.message || "Не удалось принять звонок.");
    } finally {
      directCallActionInFlightRef.current = false;
    }
  }, [
    activeLatencyMs,
    appendDirectCallHistoryEntry,
    currentVoiceChannelRef,
    directCallStateRef,
    disconnectFromActiveVoiceContext,
    ensureVoiceClientReady,
    openDirectChat,
    setDirectCallState,
    showServerInviteFeedback,
    user,
    voiceClientRef,
  ]);

  const declineDirectCall = useCallback(async () => {
    const currentCall = directCallStateRef.current;
    if (currentCall.phase === "idle" || !currentCall.peerUserId || !currentCall.channelId || !voiceClientRef.current) {
      return;
    }

    if (directCallActionInFlightRef.current) {
      return;
    }

    directCallActionInFlightRef.current = true;
    try {
      if (currentCall.phase === "incoming") {
        await voiceClientRef.current.declineDirectCall(currentCall.peerUserId, currentCall.channelId, "declined", user);
      } else if (currentCall.phase === "outgoing" || currentCall.phase === "connecting" || currentCall.phase === "reconnecting") {
        await voiceClientRef.current.declineDirectCall(currentCall.peerUserId, currentCall.channelId, "cancelled", user);
      }
    } catch (error) {
      console.error("Не удалось отменить личный звонок:", error);
    } finally {
      if (currentVoiceChannelRef.current === currentCall.channelId) {
        try {
          await disconnectFromActiveVoiceContext({ preserveSuppressedChannel: false });
        } catch (leaveError) {
          console.error("Не удалось сбросить состояние личного звонка:", leaveError);
        }
      }
      appendDirectCallHistoryEntry({
        peerUserId: currentCall.peerUserId,
        peerName: currentCall.peerName,
        peerAvatar: currentCall.peerAvatar,
        direction: currentCall.direction || (currentCall.phase === "incoming" ? "incoming" : "outgoing"),
        outcome: currentCall.phase === "incoming" ? "declined" : "cancelled",
      });
      setDirectCallState(createDirectCallState());
      directCallActionInFlightRef.current = false;
    }
  }, [
    appendDirectCallHistoryEntry,
    currentVoiceChannelRef,
    directCallStateRef,
    disconnectFromActiveVoiceContext,
    setDirectCallState,
    user,
    voiceClientRef,
  ]);

  const endDirectCall = useCallback(async () => {
    const currentCall = directCallStateRef.current;
    if (currentCall.phase !== "connected" || !currentCall.peerUserId || !currentCall.channelId || !voiceClientRef.current) {
      return;
    }

    if (directCallActionInFlightRef.current) {
      return;
    }

    directCallActionInFlightRef.current = true;
    let endedSuccessfully = false;

    try {
      const expectedEndCall = { ...currentCall, lastReason: "expected-end" };
      directCallStateRef.current = expectedEndCall;
      setDirectCallState(expectedEndCall);
      await voiceClientRef.current.endDirectCall(currentCall.peerUserId, currentCall.channelId, user);
      if (currentVoiceChannelRef.current === currentCall.channelId) {
        await disconnectFromActiveVoiceContext({ preserveSuppressedChannel: false });
      }
      endedSuccessfully = true;
    } catch (error) {
      console.error("Не удалось завершить личный звонок:", error);
    } finally {
      appendDirectCallHistoryEntry({
        peerUserId: currentCall.peerUserId,
        peerName: currentCall.peerName,
        peerAvatar: currentCall.peerAvatar,
        direction: currentCall.direction || "outgoing",
        outcome: "ended",
      });
      setDirectCallState(
        endedSuccessfully
          ? createDirectCallState()
          : buildDirectCallState({
              phase: "disconnected",
              statusLabel: "Не удалось завершить звонок",
              peerUserId: currentCall.peerUserId,
              peerName: currentCall.peerName,
              peerAvatar: currentCall.peerAvatar,
              peerAvatarFrame: currentCall.peerAvatarFrame,
              canRetry: true,
              isMiniMode: true,
              direction: currentCall.direction || "outgoing",
              lastReason: "end-failed",
              endedAt: new Date().toISOString(),
            })
      );
      directCallActionInFlightRef.current = false;
    }
  }, [
    appendDirectCallHistoryEntry,
    currentVoiceChannelRef,
    directCallStateRef,
    disconnectFromActiveVoiceContext,
    setDirectCallState,
    user,
    voiceClientRef,
  ]);

  const clearRemoteDirectCall = useCallback(async ({
    channelName,
    fromName = "",
    outcome = "ended",
    feedbackMessage = "",
  }) => {
    const currentCall = directCallStateRef.current;
    if (!channelName || currentCall.channelId !== channelName || currentCall.phase === "idle") {
      return;
    }

    const fallbackName = String(fromName || currentCall.peerName || "Пользователь");
    const expectedEndCall = { ...currentCall, lastReason: "expected-end" };
    directCallStateRef.current = expectedEndCall;
    setDirectCallState(expectedEndCall);

    try {
      if (currentVoiceChannelRef.current === channelName) {
        await disconnectFromActiveVoiceContext({ preserveSuppressedChannel: false });
      }
    } catch (error) {
      console.error("Не удалось сбросить личный звонок после удалённого завершения:", error);
    } finally {
      appendDirectCallHistoryEntry({
        peerUserId: currentCall.peerUserId,
        peerName: fallbackName,
        peerAvatar: currentCall.peerAvatar,
        direction: currentCall.direction || "incoming",
        outcome,
      });
      setDirectCallState(createDirectCallState());
      if (feedbackMessage) {
        showServerInviteFeedback(feedbackMessage);
      }
    }
  }, [
    appendDirectCallHistoryEntry,
    currentVoiceChannelRef,
    directCallStateRef,
    disconnectFromActiveVoiceContext,
    setDirectCallState,
    showServerInviteFeedback,
  ]);

  return {
    startDirectCallWithUser,
    acceptDirectCall,
    declineDirectCall,
    endDirectCall,
    retryDirectCall,
    clearRemoteDirectCall,
    setDirectCallMiniMode,
    dismissDirectCallOverlay,
  };
}

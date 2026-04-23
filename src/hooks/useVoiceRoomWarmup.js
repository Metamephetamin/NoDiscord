import { useCallback, useRef } from "react";

export default function useVoiceRoomWarmup({
  voiceClientRef,
  user,
  activeServerId,
  getScopedVoiceChannelId,
  ensureVoiceClientReady,
}) {
  const lastWarmedChannelRef = useRef("");

  const prewarmVoiceChannel = useCallback((channelId) => {
    if (!user?.id || !activeServerId || !channelId) {
      return;
    }

    const scopedChannelId = getScopedVoiceChannelId(activeServerId, channelId);
    if (!scopedChannelId || lastWarmedChannelRef.current === scopedChannelId) {
      return;
    }

    lastWarmedChannelRef.current = scopedChannelId;
    Promise.resolve(ensureVoiceClientReady?.())
      .catch(() => null)
      .then(() => voiceClientRef.current?.prewarmChannel(scopedChannelId, user))
      .catch(() => {});
  }, [activeServerId, ensureVoiceClientReady, getScopedVoiceChannelId, user, voiceClientRef]);

  return {
    prewarmVoiceChannel,
  };
}

import { useCallback, useRef } from "react";

export default function useVoiceRoomWarmup({
  voiceClientRef,
  user,
  activeServerId,
  getScopedVoiceChannelId,
}) {
  const lastWarmedChannelRef = useRef("");

  const prewarmVoiceChannel = useCallback((channelId) => {
    if (!voiceClientRef.current || !user?.id || !activeServerId || !channelId) {
      return;
    }

    const scopedChannelId = getScopedVoiceChannelId(activeServerId, channelId);
    if (!scopedChannelId || lastWarmedChannelRef.current === scopedChannelId) {
      return;
    }

    lastWarmedChannelRef.current = scopedChannelId;
    voiceClientRef.current.prewarmChannel(scopedChannelId, user).catch(() => {});
  }, [activeServerId, getScopedVoiceChannelId, user, voiceClientRef]);

  return {
    prewarmVoiceChannel,
  };
}

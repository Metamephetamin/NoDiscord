import { memo, useCallback, useEffect, useRef } from "react";
import TextChatContainer from "../features/text-chat/TextChatContainer";

function useStableCallback(callback) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args) => callbackRef.current?.(...args), []);
}

function TextChat(props) {
  const stableOnNavigationIndexChange = useStableCallback(props.onNavigationIndexChange);
  const stableOnOpenDirectChat = useStableCallback(props.onOpenDirectChat);
  const stableOnStartDirectCall = useStableCallback(props.onStartDirectCall);

  return (
    <TextChatContainer
      {...props}
      onNavigationIndexChange={stableOnNavigationIndexChange}
      onOpenDirectChat={stableOnOpenDirectChat}
      onStartDirectCall={stableOnStartDirectCall}
    />
  );
}

function areUserLikeEntriesEqual(previousEntries, nextEntries) {
  if (previousEntries === nextEntries) {
    return true;
  }

  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries) || previousEntries.length !== nextEntries.length) {
    return false;
  }

  for (let index = 0; index < previousEntries.length; index += 1) {
    const previousEntry = previousEntries[index];
    const nextEntry = nextEntries[index];

    if (
      String(previousEntry?.id || previousEntry?.userId || "") !== String(nextEntry?.id || nextEntry?.userId || "")
      || String(previousEntry?.name || previousEntry?.nickname || "") !== String(nextEntry?.name || nextEntry?.nickname || "")
      || String(previousEntry?.avatar || previousEntry?.avatarUrl || "") !== String(nextEntry?.avatar || nextEntry?.avatarUrl || "")
      || String(previousEntry?.directChannelId || "") !== String(nextEntry?.directChannelId || "")
      || String(previousEntry?.roleId || "") !== String(nextEntry?.roleId || "")
      || String(previousEntry?.lastSeenAt || previousEntry?.last_seen_at || "") !== String(nextEntry?.lastSeenAt || nextEntry?.last_seen_at || "")
      || Boolean(previousEntry?.isOnline) !== Boolean(nextEntry?.isOnline)
    ) {
      return false;
    }
  }

  return true;
}

function areRoleEntriesEqual(previousEntries = [], nextEntries = []) {
  if (previousEntries === nextEntries) {
    return true;
  }

  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries) || previousEntries.length !== nextEntries.length) {
    return false;
  }

  for (let index = 0; index < previousEntries.length; index += 1) {
    const previousEntry = previousEntries[index];
    const nextEntry = nextEntries[index];

    if (
      String(previousEntry?.id || "") !== String(nextEntry?.id || "")
      || String(previousEntry?.name || "") !== String(nextEntry?.name || "")
      || String(previousEntry?.color || "") !== String(nextEntry?.color || "")
    ) {
      return false;
    }
  }

  return true;
}

function areNavigationRequestsEqual(previousRequest, nextRequest) {
  if (previousRequest === nextRequest) {
    return true;
  }

  if (!previousRequest && !nextRequest) {
    return true;
  }

  if (!previousRequest || !nextRequest) {
    return false;
  }

  return String(previousRequest?.type || "") === String(nextRequest?.type || "")
    && String(previousRequest?.serverId || "") === String(nextRequest?.serverId || "")
    && String(previousRequest?.channelId || "") === String(nextRequest?.channelId || "")
    && String(previousRequest?.messageId || "") === String(nextRequest?.messageId || "")
    && String(previousRequest?.nonce || "") === String(nextRequest?.nonce || "");
}

function areTextChatPropsEqual(previousProps, nextProps) {
  return previousProps.serverId === nextProps.serverId
    && previousProps.channelId === nextProps.channelId
    && previousProps.resolvedChannelId === nextProps.resolvedChannelId
    && previousProps.localMessageStateVersion === nextProps.localMessageStateVersion
    && previousProps.user === nextProps.user
    && previousProps.searchQuery === nextProps.searchQuery
    && areUserLikeEntriesEqual(previousProps.directTargets, nextProps.directTargets)
    && areUserLikeEntriesEqual(previousProps.serverMembers, nextProps.serverMembers)
    && areRoleEntriesEqual(previousProps.serverRoles, nextProps.serverRoles)
    && areNavigationRequestsEqual(previousProps.navigationRequest, nextProps.navigationRequest);
}

export default memo(TextChat, areTextChatPropsEqual);

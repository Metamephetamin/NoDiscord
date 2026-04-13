import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDayLabel } from "../utils/textChatHelpers";

export default function useTextChatScrollManager({
  messages,
  scopedChannelId,
  messagesListRef,
  messagesEndRef,
  messageRefs,
  setHighlightedMessageId,
  forceScrollToBottomRef,
  estimateMessageOffsetById,
}) {
  const [floatingDateLabel, setFloatingDateLabel] = useState("");
  const [pendingNewMessagesCount, setPendingNewMessagesCount] = useState(0);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState("");
  const [canReturnToJumpPoint, setCanReturnToJumpPoint] = useState(false);
  const previousChannelIdRef = useRef("");
  const pendingInitialScrollChannelRef = useRef("");
  const previousMessageCountRef = useRef(0);
  const nearBottomRef = useRef(true);
  const jumpSnapshotRef = useRef(null);

  const clearUnreadBelow = useCallback(() => {
    setPendingNewMessagesCount(0);
    setFirstUnreadMessageId("");
  }, []);

  const scheduleClearUnreadBelow = useCallback(() => {
    window.requestAnimationFrame(() => {
      setPendingNewMessagesCount(0);
    });
  }, []);

  const scrollToLatest = useCallback((behavior = "smooth") => {
    const list = messagesListRef.current;
    const end = messagesEndRef.current;
    if (!list || !end) {
      return;
    }

    nearBottomRef.current = true;
    clearUnreadBelow();
    list.scrollTop = list.scrollHeight;
    end.scrollIntoView({ behavior, block: "end" });
  }, [clearUnreadBelow, messagesEndRef, messagesListRef]);

  const captureJumpSnapshot = useCallback(() => {
    const list = messagesListRef.current;
    if (!list) {
      return null;
    }

    return {
      channelId: scopedChannelId,
      scrollTop: list.scrollTop,
    };
  }, [messagesListRef, scopedChannelId]);

  const applyHighlight = useCallback((messageId) => {
    setHighlightedMessageId(String(messageId));
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === String(messageId) ? "" : current));
    }, 2200);
  }, [setHighlightedMessageId]);

  const scrollToMessage = useCallback((messageId, { behavior = "smooth", block = "center", rememberCurrent = true } = {}) => {
    const normalizedMessageId = String(messageId || "");
    const list = messagesListRef.current;
    if (!normalizedMessageId || !list) {
      return;
    }

    if (rememberCurrent) {
      jumpSnapshotRef.current = captureJumpSnapshot();
      setCanReturnToJumpPoint(Boolean(jumpSnapshotRef.current));
    }

    const attemptScroll = (attempt = 0) => {
      const element = messageRefs.current.get(normalizedMessageId);
      if (element) {
        applyHighlight(normalizedMessageId);
        element.scrollIntoView({ behavior, block });
        return;
      }

      if (attempt === 0 && typeof estimateMessageOffsetById === "function") {
        const estimatedOffset = estimateMessageOffsetById(normalizedMessageId);
        list.scrollTop = Math.max(0, estimatedOffset - Math.max(96, Math.round(list.clientHeight * 0.35)));
      }

      if (attempt >= 5) {
        return;
      }

      window.requestAnimationFrame(() => attemptScroll(attempt + 1));
    };

    attemptScroll();
  }, [applyHighlight, captureJumpSnapshot, estimateMessageOffsetById, messageRefs, messagesListRef]);

  const returnToJumpPoint = useCallback(() => {
    const list = messagesListRef.current;
    const snapshot = jumpSnapshotRef.current;
    if (!list || !snapshot || snapshot.channelId !== scopedChannelId) {
      return;
    }

    list.scrollTo({
      top: Math.max(0, snapshot.scrollTop || 0),
      behavior: "smooth",
    });
    jumpSnapshotRef.current = null;
    setCanReturnToJumpPoint(false);
  }, [messagesListRef, scopedChannelId]);

  const jumpToFirstUnread = useCallback(() => {
    if (!firstUnreadMessageId) {
      return;
    }

    scrollToMessage(firstUnreadMessageId, { behavior: "smooth", block: "center", rememberCurrent: false });
  }, [firstUnreadMessageId, scrollToMessage]);

  useEffect(() => {
    const updateFloatingDate = () => {
      const list = messagesListRef.current;
      if (!list || messages.length === 0) {
        setFloatingDateLabel("");
        return;
      }

      const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
      const isNearBottom = distanceFromBottom < 96;
      nearBottomRef.current = isNearBottom;
      if (isNearBottom) {
        clearUnreadBelow();
      }

      const probeLine = list.scrollTop + 24;
      let nextVisibleMessage = messages[0];

      for (const messageItem of messages) {
        const node = messageRefs.current.get(messageItem.id);
        if (!node) {
          continue;
        }

        const nodeBottom = node.offsetTop + node.offsetHeight;
        if (nodeBottom >= probeLine) {
          nextVisibleMessage = messageItem;
          break;
        }
      }

      const nextLabel = nextVisibleMessage?.timestamp ? formatDayLabel(nextVisibleMessage.timestamp) : "";
      setFloatingDateLabel((current) => (current === nextLabel ? current : nextLabel));
    };

    updateFloatingDate();
    const list = messagesListRef.current;
    if (!list) {
      return undefined;
    }

    list.addEventListener("scroll", updateFloatingDate, { passive: true });
    window.addEventListener("resize", updateFloatingDate);

    return () => {
      list.removeEventListener("scroll", updateFloatingDate);
      window.removeEventListener("resize", updateFloatingDate);
    };
  }, [clearUnreadBelow, messageRefs, messages, messagesListRef]);

  useLayoutEffect(() => {
    const list = messagesListRef.current;
    const end = messagesEndRef.current;
    if (!list || !end) {
      previousChannelIdRef.current = scopedChannelId;
      previousMessageCountRef.current = messages.length;
      return;
    }

    const channelChanged = previousChannelIdRef.current !== scopedChannelId;
    const previousMessageCount = previousMessageCountRef.current;

    previousChannelIdRef.current = scopedChannelId;
    previousMessageCountRef.current = messages.length;

    if (channelChanged) {
      nearBottomRef.current = true;
      scheduleClearUnreadBelow();
      jumpSnapshotRef.current = null;
      window.requestAnimationFrame(() => {
        setCanReturnToJumpPoint(false);
      });
      forceScrollToBottomRef.current = false;
      pendingInitialScrollChannelRef.current = scopedChannelId;
      list.scrollTop = list.scrollHeight;
      window.requestAnimationFrame(() => {
        const nextList = messagesListRef.current;
        const nextEnd = messagesEndRef.current;
        if (!nextList || !nextEnd || previousChannelIdRef.current !== scopedChannelId) {
          return;
        }

        nextList.scrollTop = nextList.scrollHeight;
        nextEnd.scrollIntoView({ behavior: "auto", block: "end" });
      });
      return;
    }

    if (pendingInitialScrollChannelRef.current === scopedChannelId) {
      if (messages.length === 0) {
        return;
      }

      nearBottomRef.current = true;
      scheduleClearUnreadBelow();
      pendingInitialScrollChannelRef.current = "";
      list.scrollTop = list.scrollHeight;
      end.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }

    if (forceScrollToBottomRef.current) {
      forceScrollToBottomRef.current = false;
      nearBottomRef.current = true;
      scheduleClearUnreadBelow();
      end.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }

    if (messages.length < previousMessageCount) {
      return;
    }

    if (nearBottomRef.current) {
      end.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }

    if (messages.length > previousMessageCount) {
      const firstNewMessage = messages[previousMessageCount];
      if (firstNewMessage?.id && !firstUnreadMessageId) {
        setFirstUnreadMessageId(String(firstNewMessage.id));
      }
      setPendingNewMessagesCount((current) => current + (messages.length - previousMessageCount));
    }
  }, [
    clearUnreadBelow,
    firstUnreadMessageId,
    forceScrollToBottomRef,
    messages,
    messages.length,
    messagesEndRef,
    messagesListRef,
    scheduleClearUnreadBelow,
    scopedChannelId,
  ]);

  return {
    floatingDateLabel,
    pendingNewMessagesCount,
    firstUnreadMessageId,
    canReturnToJumpPoint,
    scrollToLatest,
    scrollToMessage,
    jumpToFirstUnread,
    returnToJumpPoint,
  };
}

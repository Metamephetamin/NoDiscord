import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDayLabel } from "../utils/textChatHelpers";

const SCROLL_NEAR_BOTTOM_PX = 32;
const FLOATING_DATE_PROBE_OFFSET_PX = 24;
const PROGRAMMATIC_SCROLL_AUTO_RESET_MS = 420;

function clampScrollTop(list, top) {
  const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
  return Math.max(0, Math.min(maxScrollTop, Number(top) || 0));
}

function getTargetScrollTopForBlock(list, targetTop, targetHeight, block = "center") {
  if (block === "start") {
    return clampScrollTop(list, targetTop - 24);
  }

  if (block === "end") {
    return clampScrollTop(list, targetTop - list.clientHeight + targetHeight + 24);
  }

  return clampScrollTop(list, targetTop - Math.max(0, (list.clientHeight - targetHeight) / 2));
}

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
  const lastObservedScrollTopRef = useRef(0);
  const nearBottomRef = useRef(true);
  const userDetachedFromBottomRef = useRef(false);
  const jumpSnapshotRef = useRef(null);
  const viewportUpdateRafRef = useRef(0);
  const programmaticScrollResetTimeoutRef = useRef(0);
  const scrollStateRef = useRef({
    scrollIntent: "user",
    isProgrammaticScroll: false,
  });

  const clearUnreadBelow = useCallback(() => {
    setPendingNewMessagesCount((current) => (current === 0 ? current : 0));
    setFirstUnreadMessageId((current) => (current ? "" : current));
  }, []);

  const updateNearBottomFromList = useCallback((list) => {
    if (!list) {
      nearBottomRef.current = true;
      return true;
    }

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const isNearBottom = distanceFromBottom < SCROLL_NEAR_BOTTOM_PX;
    nearBottomRef.current = isNearBottom;
    if (isNearBottom) {
      userDetachedFromBottomRef.current = false;
    }
    return isNearBottom;
  }, []);

  const isUserScrollLockedAwayFromBottom = useCallback(() => {
    updateNearBottomFromList(messagesListRef.current);
    return userDetachedFromBottomRef.current && !nearBottomRef.current;
  }, [messagesListRef, updateNearBottomFromList]);

  const markUserScrollIntent = useCallback((direction = "unknown") => {
    if (programmaticScrollResetTimeoutRef.current) {
      window.clearTimeout(programmaticScrollResetTimeoutRef.current);
      programmaticScrollResetTimeoutRef.current = 0;
    }

    scrollStateRef.current = {
      scrollIntent: "user",
      isProgrammaticScroll: false,
    };

    if (direction === "up") {
      nearBottomRef.current = false;
      userDetachedFromBottomRef.current = true;
      return;
    }

    const isNearBottom = updateNearBottomFromList(messagesListRef.current);
    if (!isNearBottom) {
      userDetachedFromBottomRef.current = true;
    }
  }, [messagesListRef, updateNearBottomFromList]);

  const scheduleViewportUpdate = useCallback(() => {
    if (viewportUpdateRafRef.current) {
      return;
    }

    viewportUpdateRafRef.current = window.requestAnimationFrame(() => {
      viewportUpdateRafRef.current = 0;

      const list = messagesListRef.current;
      if (!list || messages.length === 0) {
        setFloatingDateLabel((current) => (current ? "" : current));
        return;
      }

      const isProgrammaticScroll = scrollStateRef.current.isProgrammaticScroll;
      const isNearBottom = updateNearBottomFromList(list);

      const probeLine = list.scrollTop + FLOATING_DATE_PROBE_OFFSET_PX;
      let nextVisibleMessage = messages[0] || null;

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

      if (!isProgrammaticScroll && isNearBottom) {
        clearUnreadBelow();
      }

      if (isProgrammaticScroll) {
        return;
      }
    });
  }, [clearUnreadBelow, messageRefs, messages, messagesListRef, updateNearBottomFromList]);

  const clearProgrammaticScroll = useCallback(() => {
    if (programmaticScrollResetTimeoutRef.current) {
      window.clearTimeout(programmaticScrollResetTimeoutRef.current);
      programmaticScrollResetTimeoutRef.current = 0;
    }

    scrollStateRef.current = {
      scrollIntent: "user",
      isProgrammaticScroll: false,
    };
    scheduleViewportUpdate();
  }, [scheduleViewportUpdate]);

  const markProgrammaticScroll = useCallback((scrollIntent) => {
    if (programmaticScrollResetTimeoutRef.current) {
      window.clearTimeout(programmaticScrollResetTimeoutRef.current);
    }

    scrollStateRef.current = {
      scrollIntent,
      isProgrammaticScroll: true,
    };

    programmaticScrollResetTimeoutRef.current = window.setTimeout(() => {
      clearProgrammaticScroll();
    }, PROGRAMMATIC_SCROLL_AUTO_RESET_MS);
  }, [clearProgrammaticScroll]);

  const scrollToPosition = useCallback((top, { behavior = "auto", scrollIntent = "jump" } = {}) => {
    const list = messagesListRef.current;
    if (!list) {
      return;
    }

    markProgrammaticScroll(scrollIntent);
    list.scrollTo({
      top: clampScrollTop(list, top),
      behavior,
    });
  }, [markProgrammaticScroll, messagesListRef]);

  const scrollToBottom = useCallback((behavior = "auto", scrollIntent = "auto-bottom") => {
    const list = messagesListRef.current;
    if (!list) {
      return;
    }

    scrollToPosition(list.scrollHeight, { behavior, scrollIntent });
  }, [messagesListRef, scrollToPosition]);

  const scrollToLatest = useCallback((behavior = "auto") => {
    nearBottomRef.current = true;
    userDetachedFromBottomRef.current = false;
    clearUnreadBelow();
    scrollToBottom(behavior, "auto-bottom");
  }, [clearUnreadBelow, scrollToBottom]);

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

  const scrollToMessage = useCallback((messageId, { behavior = "auto", block = "center", rememberCurrent = true } = {}) => {
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
        const targetTop = getTargetScrollTopForBlock(list, element.offsetTop, element.offsetHeight, block);
        scrollToPosition(targetTop, { behavior, scrollIntent: "jump" });
        return;
      }

      if (attempt === 0 && typeof estimateMessageOffsetById === "function") {
        const estimatedOffset = estimateMessageOffsetById(normalizedMessageId);
        const targetTop = getTargetScrollTopForBlock(list, estimatedOffset, 96, block);
        scrollToPosition(targetTop, { behavior: "auto", scrollIntent: "jump" });
      }

      if (attempt >= 6) {
        return;
      }

      window.requestAnimationFrame(() => attemptScroll(attempt + 1));
    };

    attemptScroll();
  }, [applyHighlight, captureJumpSnapshot, estimateMessageOffsetById, messageRefs, messagesListRef, scrollToPosition]);

  const returnToJumpPoint = useCallback(() => {
    const snapshot = jumpSnapshotRef.current;
    if (!snapshot || snapshot.channelId !== scopedChannelId) {
      return;
    }

    scrollToPosition(snapshot.scrollTop || 0, {
      behavior: "auto",
      scrollIntent: "preserve-position",
    });
    jumpSnapshotRef.current = null;
    setCanReturnToJumpPoint(false);
  }, [scopedChannelId, scrollToPosition]);

  const jumpToFirstUnread = useCallback(() => {
    if (!firstUnreadMessageId) {
      return;
    }

    scrollToMessage(firstUnreadMessageId, { behavior: "smooth", block: "center", rememberCurrent: false });
  }, [firstUnreadMessageId, scrollToMessage]);

  useEffect(() => {
    scheduleViewportUpdate();
    const list = messagesListRef.current;
    if (!list) {
      return undefined;
    }

    const handleScroll = () => {
      if (!scrollStateRef.current.isProgrammaticScroll) {
        const previousScrollTop = lastObservedScrollTopRef.current;
        const nextScrollTop = Math.max(0, list.scrollTop || 0);
        if (nextScrollTop < previousScrollTop - 1) {
          userDetachedFromBottomRef.current = true;
          nearBottomRef.current = false;
        }
        lastObservedScrollTopRef.current = nextScrollTop;
        updateNearBottomFromList(list);
      }
      scheduleViewportUpdate();
    };

    const handleWheel = (event) => {
      markUserScrollIntent(Number(event.deltaY || 0) < 0 ? "up" : "down");
    };

    const handleTouchMove = () => {
      markUserScrollIntent();
    };

    const handleKeyDown = (event) => {
      if (
        event.key === "ArrowUp"
        || event.key === "ArrowDown"
        || event.key === "PageUp"
        || event.key === "PageDown"
        || event.key === "Home"
        || event.key === "End"
        || event.key === " "
      ) {
        markUserScrollIntent(
          event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home"
            ? "up"
            : "down"
        );
      }
    };

    list.addEventListener("scroll", handleScroll, { passive: true });
    list.addEventListener("wheel", handleWheel, { passive: true });
    list.addEventListener("touchmove", handleTouchMove, { passive: true });
    list.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", scheduleViewportUpdate);

    return () => {
      list.removeEventListener("scroll", handleScroll);
      list.removeEventListener("wheel", handleWheel);
      list.removeEventListener("touchmove", handleTouchMove);
      list.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", scheduleViewportUpdate);
      if (viewportUpdateRafRef.current) {
        window.cancelAnimationFrame(viewportUpdateRafRef.current);
        viewportUpdateRafRef.current = 0;
      }
      if (programmaticScrollResetTimeoutRef.current) {
        window.clearTimeout(programmaticScrollResetTimeoutRef.current);
        programmaticScrollResetTimeoutRef.current = 0;
      }
    };
  }, [markUserScrollIntent, messagesListRef, scheduleViewportUpdate, updateNearBottomFromList]);

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
      userDetachedFromBottomRef.current = false;
      lastObservedScrollTopRef.current = 0;
      jumpSnapshotRef.current = null;
      forceScrollToBottomRef.current = false;
      pendingInitialScrollChannelRef.current = scopedChannelId;
      window.requestAnimationFrame(() => {
        clearUnreadBelow();
        setCanReturnToJumpPoint(false);
      });
      scrollToBottom("auto", "channel-switch");
      return;
    }

    if (pendingInitialScrollChannelRef.current === scopedChannelId) {
      if (messages.length === 0) {
        return;
      }

      nearBottomRef.current = true;
      userDetachedFromBottomRef.current = false;
      pendingInitialScrollChannelRef.current = "";
      window.requestAnimationFrame(() => {
        clearUnreadBelow();
      });
      scrollToBottom("auto", "channel-switch");
      return;
    }

    if (forceScrollToBottomRef.current) {
      forceScrollToBottomRef.current = false;
      if (isUserScrollLockedAwayFromBottom()) {
        scheduleViewportUpdate();
        return;
      }

      nearBottomRef.current = true;
      userDetachedFromBottomRef.current = false;
      window.requestAnimationFrame(() => {
        clearUnreadBelow();
      });
      scrollToBottom("auto", "auto-bottom");
      return;
    }

    if (messages.length < previousMessageCount) {
      scheduleViewportUpdate();
      return;
    }

    if (messages.length > previousMessageCount) {
      if (nearBottomRef.current && !isUserScrollLockedAwayFromBottom()) {
        window.requestAnimationFrame(() => {
          clearUnreadBelow();
        });
        scrollToBottom("auto", "auto-bottom");
        return;
      }

      const firstNewMessage = messages[previousMessageCount];
      if (firstNewMessage?.id && !firstUnreadMessageId) {
        setFirstUnreadMessageId(String(firstNewMessage.id));
      }
      setPendingNewMessagesCount((current) => current + (messages.length - previousMessageCount));
      return;
    }

    scheduleViewportUpdate();
  }, [
    clearUnreadBelow,
    firstUnreadMessageId,
    forceScrollToBottomRef,
    isUserScrollLockedAwayFromBottom,
    messages,
    messages.length,
    messagesEndRef,
    messagesListRef,
    scheduleViewportUpdate,
    scopedChannelId,
    scrollToBottom,
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

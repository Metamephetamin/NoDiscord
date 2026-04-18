import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDayLabel } from "../utils/textChatHelpers";

const SCROLL_NEAR_BOTTOM_PX = 32;
const FLOATING_DATE_PROBE_OFFSET_PX = 24;
const PROGRAMMATIC_SCROLL_AUTO_RESET_MS = 420;
const AUTO_BOTTOM_SETTLE_ATTEMPTS = [0, 16, 48, 120, 240];
const TEXT_CHAT_SCROLL_STATE_PREFIX = "textchat-scroll-state";
const TEXT_CHAT_SCROLL_STATE_ENABLED = false;

function getTextChatScrollStateKey(userId, channelId) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedUserId || !normalizedChannelId) {
    return "";
  }

  return `${TEXT_CHAT_SCROLL_STATE_PREFIX}:${normalizedUserId}:${normalizedChannelId}`;
}

function readTextChatScrollState(userId, channelId) {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getTextChatScrollStateKey(userId, channelId);
  if (!storageKey) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    const anchorMessageId = String(parsedValue?.anchorMessageId || "").trim();
    const block = parsedValue?.block === "end" ? "end" : "start";
    if (!anchorMessageId) {
      return null;
    }

    return {
      anchorMessageId,
      block,
    };
  } catch {
    return null;
  }
}

function writeTextChatScrollState(userId, channelId, value) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getTextChatScrollStateKey(userId, channelId);
  const anchorMessageId = String(value?.anchorMessageId || "").trim();
  if (!storageKey || !anchorMessageId) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      anchorMessageId,
      block: value?.block === "end" ? "end" : "start",
      updatedAt: Date.now(),
    }));
  } catch {
    // Scroll restore is a convenience only.
  }
}

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
  visibleMessages = messages,
  scopedChannelId,
  currentUserId = "",
  isDirectChat = false,
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
  const [showJumpToLatestButton, setShowJumpToLatestButton] = useState(false);
  const previousChannelIdRef = useRef("");
  const pendingInitialScrollChannelRef = useRef("");
  const pendingInitialScrollStateRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const lastObservedScrollTopRef = useRef(0);
  const nearBottomRef = useRef(true);
  const userDetachedFromBottomRef = useRef(false);
  const jumpSnapshotRef = useRef(null);
  const viewportUpdateRafRef = useRef(0);
  const programmaticScrollResetTimeoutRef = useRef(0);
  const pendingScrollStateWriteTimeoutRef = useRef(0);
  const autoBottomSettleTimeoutsRef = useRef([]);
  const pendingScrollStatePayloadRef = useRef(null);
  const visibleMessagesRef = useRef(visibleMessages);
  const scrollStateRef = useRef({
    scrollIntent: "user",
    isProgrammaticScroll: false,
  });

  useLayoutEffect(() => {
    visibleMessagesRef.current = visibleMessages;
  }, [visibleMessages]);

  const flushPendingScrollStateWrite = useCallback(() => {
    if (pendingScrollStateWriteTimeoutRef.current) {
      window.clearTimeout(pendingScrollStateWriteTimeoutRef.current);
      pendingScrollStateWriteTimeoutRef.current = 0;
    }

    const payload = pendingScrollStatePayloadRef.current;
    pendingScrollStatePayloadRef.current = null;
    if (!payload) {
      return;
    }

    writeTextChatScrollState(payload.userId, payload.channelId, payload.state);
  }, []);

  const scheduleScrollStateWrite = useCallback((state) => {
    if (!TEXT_CHAT_SCROLL_STATE_ENABLED || !isDirectChat) {
      return;
    }

    const anchorMessageId = String(state?.anchorMessageId || "").trim();
    if (!anchorMessageId) {
      return;
    }

    pendingScrollStatePayloadRef.current = {
      userId: currentUserId,
      channelId: scopedChannelId,
      state: {
        anchorMessageId,
        block: state?.block === "end" ? "end" : "start",
      },
    };

    if (pendingScrollStateWriteTimeoutRef.current) {
      return;
    }

    pendingScrollStateWriteTimeoutRef.current = window.setTimeout(() => {
      flushPendingScrollStateWrite();
    }, 140);
  }, [currentUserId, flushPendingScrollStateWrite, isDirectChat, scopedChannelId]);

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
        setShowJumpToLatestButton((current) => (current ? false : current));
        return;
      }

      const isProgrammaticScroll = scrollStateRef.current.isProgrammaticScroll;
      const isNearBottom = updateNearBottomFromList(list);
      setShowJumpToLatestButton((current) => (current === !isNearBottom ? current : !isNearBottom));

      const probeLine = list.scrollTop + FLOATING_DATE_PROBE_OFFSET_PX;
      const currentVisibleMessages = visibleMessagesRef.current || [];
      const probeMessages = currentVisibleMessages.length ? currentVisibleMessages : messages;
      let nextVisibleMessage = probeMessages[0] || messages[0] || null;

      for (const messageItem of probeMessages) {
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

      if (!isProgrammaticScroll && isDirectChat) {
        const latestMessage = messages[messages.length - 1] || null;
        const anchorMessageId = String(
          isNearBottom
            ? latestMessage?.id || ""
            : nextVisibleMessage?.id || ""
        ).trim();

        if (anchorMessageId) {
          scheduleScrollStateWrite({
            anchorMessageId,
            block: isNearBottom ? "end" : "start",
          });
        }
      }

      if (!isProgrammaticScroll && isNearBottom) {
        clearUnreadBelow();
      }

      if (isProgrammaticScroll) {
        return;
      }
    });
  }, [
    clearUnreadBelow,
    isDirectChat,
    messageRefs,
    messages,
    messagesListRef,
    scheduleScrollStateWrite,
    updateNearBottomFromList,
  ]);

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

  const clearAutoBottomSettleQueue = useCallback(() => {
    if (!autoBottomSettleTimeoutsRef.current.length) {
      return;
    }

    autoBottomSettleTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    autoBottomSettleTimeoutsRef.current = [];
  }, []);

  const scrollToBottom = useCallback((behavior = "auto", scrollIntent = "auto-bottom") => {
    const list = messagesListRef.current;
    if (!list) {
      return;
    }

    scrollToPosition(list.scrollHeight, { behavior, scrollIntent });
  }, [messagesListRef, scrollToPosition]);

  const scrollToBottomSettled = useCallback((behavior = "auto", scrollIntent = "auto-bottom") => {
    const list = messagesListRef.current;
    if (!list) {
      return;
    }

    clearAutoBottomSettleQueue();
    scrollToBottom(behavior, scrollIntent);

    autoBottomSettleTimeoutsRef.current = AUTO_BOTTOM_SETTLE_ATTEMPTS.map((delayMs, attemptIndex) =>
      window.setTimeout(() => {
        const currentList = messagesListRef.current;
        if (!currentList) {
          return;
        }

        const nextBehavior = attemptIndex === 0 ? behavior : "auto";
        scrollToPosition(currentList.scrollHeight, {
          behavior: nextBehavior,
          scrollIntent,
        });
      }, delayMs)
    );
  }, [clearAutoBottomSettleQueue, messagesListRef, scrollToBottom, scrollToPosition]);

  const scrollToLatest = useCallback((behavior = "auto") => {
    nearBottomRef.current = true;
    userDetachedFromBottomRef.current = false;
    setShowJumpToLatestButton(false);
    clearUnreadBelow();
    scrollToBottomSettled(behavior, "auto-bottom");
  }, [clearUnreadBelow, scrollToBottomSettled]);

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
    }, 4200);
  }, [setHighlightedMessageId]);

  const scrollToMessage = useCallback((messageId, { behavior = "auto", block = "center", rememberCurrent = true, highlight = true } = {}) => {
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
        if (highlight) {
          applyHighlight(normalizedMessageId);
        }
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
    return () => {
      flushPendingScrollStateWrite();
      clearAutoBottomSettleQueue();
    };
  }, [clearAutoBottomSettleQueue, currentUserId, flushPendingScrollStateWrite, isDirectChat, scopedChannelId]);

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
      clearAutoBottomSettleQueue();
      markUserScrollIntent(Number(event.deltaY || 0) < 0 ? "up" : "down");
    };

    const handleTouchMove = () => {
      clearAutoBottomSettleQueue();
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
        clearAutoBottomSettleQueue();
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
      clearAutoBottomSettleQueue();
      if (programmaticScrollResetTimeoutRef.current) {
        window.clearTimeout(programmaticScrollResetTimeoutRef.current);
        programmaticScrollResetTimeoutRef.current = 0;
      }
      if (pendingScrollStateWriteTimeoutRef.current) {
        window.clearTimeout(pendingScrollStateWriteTimeoutRef.current);
        pendingScrollStateWriteTimeoutRef.current = 0;
      }
    };
  }, [clearAutoBottomSettleQueue, markUserScrollIntent, messagesListRef, scheduleViewportUpdate, updateNearBottomFromList]);

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
      const storedScrollState = TEXT_CHAT_SCROLL_STATE_ENABLED && isDirectChat
        ? readTextChatScrollState(currentUserId, scopedChannelId)
        : null;
      nearBottomRef.current = true;
      userDetachedFromBottomRef.current = false;
      lastObservedScrollTopRef.current = 0;
      jumpSnapshotRef.current = null;
      forceScrollToBottomRef.current = false;
      pendingInitialScrollChannelRef.current = scopedChannelId;
      pendingInitialScrollStateRef.current = storedScrollState;
      window.requestAnimationFrame(() => {
        clearUnreadBelow();
        setCanReturnToJumpPoint(false);
      });
      if (!storedScrollState?.anchorMessageId) {
        scrollToBottomSettled("auto", "channel-switch");
      }
      return;
    }

    if (pendingInitialScrollChannelRef.current === scopedChannelId) {
      if (messages.length === 0) {
        return;
      }

      const pendingScrollState = pendingInitialScrollStateRef.current;
      const hasStoredAnchor = Boolean(
        pendingScrollState?.anchorMessageId
        && messages.some((messageItem) => String(messageItem?.id || "") === pendingScrollState.anchorMessageId)
      );

      nearBottomRef.current = pendingScrollState?.block === "end";
      userDetachedFromBottomRef.current = pendingScrollState?.block !== "end";
      pendingInitialScrollChannelRef.current = "";
      pendingInitialScrollStateRef.current = null;
      window.requestAnimationFrame(() => {
        clearUnreadBelow();
      });
      if (hasStoredAnchor) {
        scrollToMessage(pendingScrollState.anchorMessageId, {
          behavior: "auto",
          block: pendingScrollState.block === "end" ? "end" : "start",
          rememberCurrent: false,
          highlight: false,
        });
        return;
      }

      nearBottomRef.current = true;
      userDetachedFromBottomRef.current = false;
      scrollToBottomSettled("auto", "channel-switch");
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
      scrollToBottomSettled("auto", "auto-bottom");
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
        scrollToBottomSettled("auto", "auto-bottom");
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
    currentUserId,
    firstUnreadMessageId,
    forceScrollToBottomRef,
    isDirectChat,
    isUserScrollLockedAwayFromBottom,
    messages,
    messages.length,
    messagesEndRef,
    messagesListRef,
    scheduleViewportUpdate,
    scopedChannelId,
    scrollToMessage,
    scrollToBottomSettled,
  ]);

  return {
    floatingDateLabel,
    pendingNewMessagesCount,
    firstUnreadMessageId,
    canReturnToJumpPoint,
    showJumpToLatestButton,
    scrollToLatest,
    scrollToMessage,
    jumpToFirstUnread,
    returnToJumpPoint,
  };
}

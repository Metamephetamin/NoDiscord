import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDayLabel } from "../utils/textChatHelpers";

const SCROLL_NEAR_BOTTOM_PX = 64;
const SCROLL_LOAD_OLDER_THRESHOLD_PX = 180;
const FLOATING_DATE_PROBE_OFFSET_PX = 24;
const LATEST_SCROLL_BOTTOM_PADDING_PX = 20;
const PROGRAMMATIC_SCROLL_AUTO_RESET_MS = 420;
const FORCE_LATEST_SCROLL_FRAME_COUNT = 5;
const FORCE_LATEST_SCROLL_SETTLE_MS = 160;
const FORCE_LATEST_SCROLL_FINAL_SETTLE_MS = 420;
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
    if (!anchorMessageId) {
      return null;
    }

    return {
      anchorMessageId,
      block: parsedValue?.block === "end" ? "end" : "start",
    };
  } catch {
    return null;
  }
}

function clampScrollTop(list, top) {
  const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
  return Math.max(0, Math.min(maxScrollTop, Number(top) || 0));
}

function applyScrollTop(list, top) {
  const nextScrollTop = clampScrollTop(list, top);
  list.scrollTop = nextScrollTop;
  return nextScrollTop;
}

function getLatestAnchorScrollTop(list, endNode) {
  if (!list) {
    return 0;
  }

  const maxScrollTop = clampScrollTop(list, list.scrollHeight);
  if (!endNode) {
    return maxScrollTop;
  }

  const anchorScrollTop = clampScrollTop(
    list,
    Number(endNode.offsetTop || 0) + Number(endNode.offsetHeight || 0) - Number(list.clientHeight || 0) + LATEST_SCROLL_BOTTOM_PADDING_PX
  );

  return Math.max(maxScrollTop, anchorScrollTop);
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

function isOwnOutgoingMessage(messageItem, currentUserId) {
  if (!messageItem) {
    return false;
  }

  if (messageItem.isLocalEcho) {
    return true;
  }

  const normalizedCurrentUserId = String(currentUserId || "").trim();
  return Boolean(normalizedCurrentUserId)
    && String(messageItem.authorUserId || "").trim() === normalizedCurrentUserId;
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
  estimateMessageOffsetById,
  hasMoreHistory = false,
  isLoadingOlderHistory = false,
  onLoadOlderHistory,
}) {
  const [floatingDateLabel, setFloatingDateLabel] = useState("");
  const [pendingNewMessagesCount, setPendingNewMessagesCount] = useState(0);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState("");
  const [canReturnToJumpPoint, setCanReturnToJumpPoint] = useState(false);
  const [showJumpToLatestButton, setShowJumpToLatestButton] = useState(false);
  const previousChannelIdRef = useRef("");
  const previousMessageCountRef = useRef(0);
  const previousLatestMessageKeyRef = useRef("");
  const previousScrollHeightRef = useRef(0);
  const autoScrollRafRef = useRef(0);
  const autoScrollSettleTimeoutRef = useRef(0);
  const autoScrollFinalTimeoutRef = useRef(0);
  const lastObservedScrollTopRef = useRef(0);
  const nearBottomRef = useRef(true);
  const userDetachedFromBottomRef = useRef(false);
  const jumpSnapshotRef = useRef(null);
  const pendingPrependSnapshotRef = useRef(null);
  const viewportUpdateRafRef = useRef(0);
  const programmaticScrollResetTimeoutRef = useRef(0);
  const pendingScrollStateWriteTimeoutRef = useRef(0);
  const pendingScrollStatePayloadRef = useRef(null);
  const visibleMessagesRef = useRef(visibleMessages);
  const loadOlderHistoryRef = useRef(onLoadOlderHistory);
  const hasMoreHistoryRef = useRef(hasMoreHistory);
  const isLoadingOlderHistoryRef = useRef(isLoadingOlderHistory);
  const messagesMetaRef = useRef({
    channelId: scopedChannelId,
    count: messages.length,
    latestMessageKey: "",
  });
  const initialScrollAppliedRef = useRef(false);
  const scrollStateRef = useRef({
    scrollIntent: "user",
    isProgrammaticScroll: false,
  });

  useLayoutEffect(() => {
    visibleMessagesRef.current = visibleMessages;
  }, [visibleMessages]);

  useLayoutEffect(() => {
    const latestMessage = messages[messages.length - 1] || null;
    messagesMetaRef.current = {
      channelId: scopedChannelId,
      count: messages.length,
      latestMessageKey: latestMessage?.id ? String(latestMessage.id) : "",
    };
  }, [messages, scopedChannelId]);

  useLayoutEffect(() => {
    loadOlderHistoryRef.current = onLoadOlderHistory;
    hasMoreHistoryRef.current = Boolean(hasMoreHistory);
    isLoadingOlderHistoryRef.current = Boolean(isLoadingOlderHistory);
  }, [hasMoreHistory, isLoadingOlderHistory, onLoadOlderHistory]);

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
    if (!TEXT_CHAT_SCROLL_STATE_ENABLED) {
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
  }, [currentUserId, flushPendingScrollStateWrite, scopedChannelId]);

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

      if (!isProgrammaticScroll) {
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

    const nextScrollTop = clampScrollTop(list, top);
    markProgrammaticScroll(scrollIntent);
    if (behavior === "auto") {
      applyScrollTop(list, nextScrollTop);
      lastObservedScrollTopRef.current = nextScrollTop;
      return;
    }

    list.scrollTo({
      top: nextScrollTop,
      behavior,
    });
  }, [markProgrammaticScroll, messagesListRef]);

  const scrollToLatest = useCallback((behavior = "auto") => {
    setShowJumpToLatestButton(false);
    clearUnreadBelow();
    const list = messagesListRef.current;
    if (!list) {
      return;
    }

    nearBottomRef.current = true;
    userDetachedFromBottomRef.current = false;
    scrollToPosition(getLatestAnchorScrollTop(list, messagesEndRef?.current), { behavior, scrollIntent: "manual-bottom" });
  }, [clearUnreadBelow, messagesEndRef, messagesListRef, scrollToPosition]);

  const anchorBottomAfterViewportResize = useCallback(() => {
    const list = messagesListRef.current;
    if (!list) {
      return;
    }

    const nextScrollTop = getLatestAnchorScrollTop(list, messagesEndRef?.current);
    if (Math.abs((Number(list.scrollTop) || 0) - nextScrollTop) < 1) {
      return;
    }

    setShowJumpToLatestButton(false);
    clearUnreadBelow();
    nearBottomRef.current = true;
    userDetachedFromBottomRef.current = false;
    scrollStateRef.current = {
      scrollIntent: "resize-bottom",
      isProgrammaticScroll: true,
    };
    applyScrollTop(list, nextScrollTop);
    lastObservedScrollTopRef.current = nextScrollTop;
    scrollStateRef.current = {
      scrollIntent: "user",
      isProgrammaticScroll: false,
    };
    scheduleViewportUpdate();
  }, [clearUnreadBelow, messagesEndRef, messagesListRef, scheduleViewportUpdate]);

  const forceScrollToLatest = useCallback((behavior = "auto") => {
    if (autoScrollRafRef.current) {
      window.cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = 0;
    }
    if (autoScrollSettleTimeoutRef.current) {
      window.clearTimeout(autoScrollSettleTimeoutRef.current);
      autoScrollSettleTimeoutRef.current = 0;
    }
    if (autoScrollFinalTimeoutRef.current) {
      window.clearTimeout(autoScrollFinalTimeoutRef.current);
      autoScrollFinalTimeoutRef.current = 0;
    }

    nearBottomRef.current = true;
    userDetachedFromBottomRef.current = false;

    let remainingFrames = FORCE_LATEST_SCROLL_FRAME_COUNT;
    const scrollAfterLayout = () => {
      autoScrollRafRef.current = 0;
      if (userDetachedFromBottomRef.current) {
        return;
      }

      scrollToLatest(behavior);
      remainingFrames -= 1;
      if (remainingFrames > 0) {
        autoScrollRafRef.current = window.requestAnimationFrame(scrollAfterLayout);
      }
    };

    autoScrollRafRef.current = window.requestAnimationFrame(scrollAfterLayout);
    autoScrollSettleTimeoutRef.current = window.setTimeout(() => {
      autoScrollSettleTimeoutRef.current = 0;
      if (nearBottomRef.current && !userDetachedFromBottomRef.current) {
        scrollToLatest("auto");
      }
    }, FORCE_LATEST_SCROLL_SETTLE_MS);

    autoScrollFinalTimeoutRef.current = window.setTimeout(() => {
      autoScrollFinalTimeoutRef.current = 0;
      if (nearBottomRef.current && !userDetachedFromBottomRef.current) {
        scrollToLatest("auto");
        window.requestAnimationFrame(() => {
          if (nearBottomRef.current && !userDetachedFromBottomRef.current) {
            scrollToLatest("auto");
          }
        });
      }
    }, FORCE_LATEST_SCROLL_FINAL_SETTLE_MS);
  }, [scrollToLatest]);

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

  const restoreInitialChannelPosition = useCallback(() => {
    if (!scopedChannelId) {
      initialScrollAppliedRef.current = false;
      return false;
    }

    if (messages.length < 1) {
      return false;
    }

    initialScrollAppliedRef.current = true;
    jumpSnapshotRef.current = null;
    setCanReturnToJumpPoint(false);
    clearUnreadBelow();

    const savedScrollState = TEXT_CHAT_SCROLL_STATE_ENABLED
      ? readTextChatScrollState(currentUserId, scopedChannelId)
      : null;

    if (savedScrollState?.anchorMessageId) {
      if (savedScrollState.block === "end") {
        scrollToLatest("auto");
        return true;
      }

      if (messageRefs.current.has(savedScrollState.anchorMessageId)) {
        scrollToMessage(savedScrollState.anchorMessageId, {
          behavior: "auto",
          block: "start",
          rememberCurrent: false,
          highlight: false,
        });
        return true;
      }
    }

    scrollToLatest("auto");
    return true;
  }, [
    clearUnreadBelow,
    currentUserId,
    messageRefs,
    messages.length,
    scopedChannelId,
    scrollToLatest,
    scrollToMessage,
  ]);

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
    };
  }, [currentUserId, flushPendingScrollStateWrite, isDirectChat, scopedChannelId]);

  useLayoutEffect(() => {
    const list = messagesListRef.current;
    if (!list || typeof ResizeObserver !== "function") {
      return undefined;
    }

    let previousClientHeight = Math.max(0, Number(list.clientHeight) || 0);
    const observer = new ResizeObserver(() => {
      const nextClientHeight = Math.max(0, Number(list.clientHeight) || 0);
      const heightChanged = Math.abs(nextClientHeight - previousClientHeight) >= 1;
      previousClientHeight = nextClientHeight;

      if (
        heightChanged
        && initialScrollAppliedRef.current
        && nearBottomRef.current
        && !userDetachedFromBottomRef.current
      ) {
        anchorBottomAfterViewportResize();
        return;
      }

      scheduleViewportUpdate();
    });

    observer.observe(list);
    return () => observer.disconnect();
  }, [anchorBottomAfterViewportResize, messagesListRef, scheduleViewportUpdate, scopedChannelId]);

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
        if (
          nextScrollTop <= SCROLL_LOAD_OLDER_THRESHOLD_PX
          && hasMoreHistoryRef.current
          && !isLoadingOlderHistoryRef.current
          && typeof loadOlderHistoryRef.current === "function"
        ) {
          isLoadingOlderHistoryRef.current = true;
          pendingPrependSnapshotRef.current = {
            channelId: scopedChannelId,
            scrollHeight: Math.max(0, Number(list.scrollHeight) || 0),
            scrollTop: nextScrollTop,
            messageCount: messagesMetaRef.current.count,
            latestMessageKey: messagesMetaRef.current.latestMessageKey,
          };
          const loadPromise = loadOlderHistoryRef.current();
          if (loadPromise && typeof loadPromise.finally === "function") {
            loadPromise.finally(() => {
              window.setTimeout(() => {
                const snapshot = pendingPrependSnapshotRef.current;
                const currentMeta = messagesMetaRef.current;
                if (
                  snapshot
                  && snapshot.channelId === currentMeta.channelId
                  && currentMeta.count <= snapshot.messageCount
                ) {
                  pendingPrependSnapshotRef.current = null;
                }
              }, 0);
            });
          }
        }
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
      if (pendingScrollStateWriteTimeoutRef.current) {
        window.clearTimeout(pendingScrollStateWriteTimeoutRef.current);
        pendingScrollStateWriteTimeoutRef.current = 0;
      }
      if (autoScrollRafRef.current) {
        window.cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = 0;
      }
      if (autoScrollSettleTimeoutRef.current) {
        window.clearTimeout(autoScrollSettleTimeoutRef.current);
        autoScrollSettleTimeoutRef.current = 0;
      }
      if (autoScrollFinalTimeoutRef.current) {
        window.clearTimeout(autoScrollFinalTimeoutRef.current);
        autoScrollFinalTimeoutRef.current = 0;
      }
    };
  }, [markUserScrollIntent, messagesListRef, scheduleViewportUpdate, updateNearBottomFromList]);

  useLayoutEffect(() => {
    const list = messagesListRef.current;
    if (!list) {
      previousChannelIdRef.current = scopedChannelId;
      previousMessageCountRef.current = messages.length;
      previousScrollHeightRef.current = 0;
      return;
    }

    const channelChanged = previousChannelIdRef.current !== scopedChannelId;
    const previousMessageCount = previousMessageCountRef.current;
    const previousScrollHeight = previousScrollHeightRef.current || 0;
    const currentScrollHeight = Math.max(0, Number(list.scrollHeight) || 0);
    const latestMessage = messages[messages.length - 1] || null;
    const latestMessageKey = latestMessage?.id ? String(latestMessage.id) : "";
    const previousLatestMessageKey = previousLatestMessageKeyRef.current;
    const latestMessageChanged = Boolean(latestMessageKey) && latestMessageKey !== previousLatestMessageKey;
    const latestMessageIsOwn = isOwnOutgoingMessage(latestMessage, currentUserId);

    previousChannelIdRef.current = scopedChannelId;
    previousMessageCountRef.current = messages.length;
    previousLatestMessageKeyRef.current = latestMessageKey;
    previousScrollHeightRef.current = currentScrollHeight;

    if (channelChanged) {
      nearBottomRef.current = true;
      userDetachedFromBottomRef.current = false;
      initialScrollAppliedRef.current = false;
      lastObservedScrollTopRef.current = Math.max(0, list.scrollTop || 0);
      previousScrollHeightRef.current = Math.max(0, Number(list.scrollHeight) || 0);
      jumpSnapshotRef.current = null;
      pendingPrependSnapshotRef.current = null;
      window.requestAnimationFrame(() => {
        if (!restoreInitialChannelPosition()) {
          clearUnreadBelow();
          setCanReturnToJumpPoint(false);
          scheduleViewportUpdate();
        }
      });
      return;
    }

    if (messages.length < previousMessageCount) {
      scheduleViewportUpdate();
      return;
    }

    if (messages.length > previousMessageCount) {
      if (!initialScrollAppliedRef.current) {
        window.requestAnimationFrame(() => {
          restoreInitialChannelPosition();
          previousScrollHeightRef.current = Math.max(0, Number(list.scrollHeight) || 0);
        });
        return;
      }

      const prependSnapshot = pendingPrependSnapshotRef.current;
      if (
        prependSnapshot
        && prependSnapshot.channelId === scopedChannelId
        && messages.length > prependSnapshot.messageCount
        && latestMessageKey === prependSnapshot.latestMessageKey
      ) {
        const scrollDelta = Math.max(0, currentScrollHeight - prependSnapshot.scrollHeight);
        list.scrollTop = clampScrollTop(list, prependSnapshot.scrollTop + scrollDelta);
        lastObservedScrollTopRef.current = Math.max(0, list.scrollTop || 0);
        pendingPrependSnapshotRef.current = null;
        scheduleViewportUpdate();
        return;
      }

      const olderHistoryPrepended = Boolean(previousLatestMessageKey)
        && latestMessageKey === previousLatestMessageKey;
      if (olderHistoryPrepended) {
        const scrollDelta = Math.max(0, currentScrollHeight - previousScrollHeight);
        if (scrollDelta > 0) {
          list.scrollTop = clampScrollTop(list, Math.max(0, Number(list.scrollTop) || 0) + scrollDelta);
          lastObservedScrollTopRef.current = Math.max(0, list.scrollTop || 0);
        }
        scheduleViewportUpdate();
        return;
      }

      const newMessages = messages.slice(previousMessageCount);
      const hasOwnNewMessage = newMessages.some(
        (messageItem) => isOwnOutgoingMessage(messageItem, currentUserId)
      );

      if (hasOwnNewMessage || (nearBottomRef.current && !userDetachedFromBottomRef.current)) {
        forceScrollToLatest("auto");
        return;
      }

      const firstNewMessage = messages[previousMessageCount];
      if (firstNewMessage?.id && !firstUnreadMessageId) {
        setFirstUnreadMessageId(String(firstNewMessage.id));
      }
      setPendingNewMessagesCount((current) => current + newMessages.length);
      return;
    }

    if (initialScrollAppliedRef.current && latestMessageChanged && latestMessageIsOwn) {
      forceScrollToLatest("auto");
      return;
    }

    scheduleViewportUpdate();
  }, [
    currentUserId,
    clearUnreadBelow,
    firstUnreadMessageId,
    messages,
    messages.length,
    messagesListRef,
    restoreInitialChannelPosition,
    scheduleViewportUpdate,
    scopedChannelId,
    forceScrollToLatest,
    scrollToLatest,
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

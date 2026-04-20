import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { recordPerfEvent } from "../utils/perf";

const DEFAULT_ESTIMATED_MESSAGE_HEIGHT = 96;
const VIRTUALIZED_MESSAGE_GAP_PX = 14;
const VIRTUALIZATION_OVERSCAN_PX = 360;
const MIN_MESSAGES_FOR_VIRTUALIZATION = 80;
const MIN_MEASURED_MESSAGE_HEIGHT = 72;
const SIZE_CHANGE_EPSILON_PX = 2;
const SCROLL_METRIC_EPSILON_PX = 1;
const TEXT_CHAT_DEBUG_FLAG_PREFIX = "nodiscord.debug.textchat.";

function readTextChatDebugFlag(name) {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }

  try {
    const rawValue = window.localStorage.getItem(`${TEXT_CHAT_DEBUG_FLAG_PREFIX}${name}`);
    return rawValue === "1" || rawValue === "true";
  } catch {
    return false;
  }
}

function findStartIndex(offsets, scrollTop) {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] < scrollTop) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function clampScrollTop(list, top) {
  const maxScrollTop = Math.max(0, (Number(list?.scrollHeight) || 0) - (Number(list?.clientHeight) || 0));
  return Math.max(0, Math.min(maxScrollTop, Number(top) || 0));
}

function readListMetrics(list) {
  if (!list) {
    return null;
  }

  return {
    scrollTop: Math.max(0, Number(list.scrollTop) || 0),
    viewportHeight: Math.max(0, Number(list.clientHeight) || 0),
  };
}

export default function useTextChatVirtualizer({
  messages,
  messagesListRef,
  estimatedMessageHeight = DEFAULT_ESTIMATED_MESSAGE_HEIGHT,
}) {
  const virtualizationDebugDisabled = readTextChatDebugFlag("disableVirtualizer");
  const observerByMessageIdRef = useRef(new Map());
  const scrollMetricsRafRef = useRef(0);
  const pendingSizeFlushRafRef = useRef(0);
  const pendingSizeByMessageIdRef = useRef(new Map());
  const previousVisibleRangeRef = useRef({ startIndex: -1, endIndex: -1 });
  const measurementsRef = useRef({
    offsets: [0],
    totalHeight: 0,
    messageIndexById: new Map(),
  });
  const sizeByMessageIdRef = useRef({});
  const [sizeByMessageId, setSizeByMessageId] = useState({});
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, viewportHeight: 0 });
  const virtualizationEnabled = !virtualizationDebugDisabled && messages.length >= MIN_MESSAGES_FOR_VIRTUALIZATION;
  const estimatedVirtualizedMessageHeight = estimatedMessageHeight + VIRTUALIZED_MESSAGE_GAP_PX;

  useLayoutEffect(() => {
    if (!virtualizationEnabled) {
      return;
    }

    const nextMetrics = readListMetrics(messagesListRef.current);
    if (!nextMetrics) {
      return;
    }

    setScrollMetrics((previous) => {
      const sameScrollTop = Math.abs((previous.scrollTop || 0) - nextMetrics.scrollTop) < SCROLL_METRIC_EPSILON_PX;
      const sameViewportHeight = Math.abs((previous.viewportHeight || 0) - nextMetrics.viewportHeight) < SCROLL_METRIC_EPSILON_PX;
      return sameScrollTop && sameViewportHeight ? previous : nextMetrics;
    });
  }, [messages.length, messagesListRef, virtualizationEnabled]);

  const scheduleMetricsUpdate = useCallback(() => {
    if (scrollMetricsRafRef.current) {
      return;
    }

    scrollMetricsRafRef.current = window.requestAnimationFrame(() => {
      scrollMetricsRafRef.current = 0;
      const nextMetrics = readListMetrics(messagesListRef.current);
      if (!nextMetrics) {
        return;
      }

      setScrollMetrics((previous) => {
        const sameScrollTop = Math.abs((previous.scrollTop || 0) - nextMetrics.scrollTop) < SCROLL_METRIC_EPSILON_PX;
        const sameViewportHeight = Math.abs((previous.viewportHeight || 0) - nextMetrics.viewportHeight) < SCROLL_METRIC_EPSILON_PX;
        return sameScrollTop && sameViewportHeight ? previous : nextMetrics;
      });
    });
  }, [messagesListRef]);

  useEffect(() => {
    if (!virtualizationEnabled) {
      return undefined;
    }

    scheduleMetricsUpdate();
    const list = messagesListRef.current;
    if (!list) {
      return undefined;
    }

    const handleScroll = () => {
      scheduleMetricsUpdate();
    };

    list.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", scheduleMetricsUpdate);

    return () => {
      list.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", scheduleMetricsUpdate);
      if (scrollMetricsRafRef.current) {
        window.cancelAnimationFrame(scrollMetricsRafRef.current);
        scrollMetricsRafRef.current = 0;
      }
    };
  }, [messagesListRef, scheduleMetricsUpdate, virtualizationEnabled]);

  useEffect(() => {
    if (!virtualizationEnabled) {
      observerByMessageIdRef.current.forEach((observer) => observer.disconnect());
      observerByMessageIdRef.current.clear();
      pendingSizeByMessageIdRef.current.clear();
      return undefined;
    }

    const messageIdSet = new Set(messages.map((messageItem) => String(messageItem.id)));
    Array.from(observerByMessageIdRef.current.keys()).forEach((messageId) => {
      if (messageIdSet.has(messageId)) {
        return;
      }

      observerByMessageIdRef.current.get(messageId)?.disconnect();
      observerByMessageIdRef.current.delete(messageId);
    });

    const pruneTimeoutId = window.setTimeout(() => {
      setSizeByMessageId((previous) => {
        const next = {};
        let changed = false;

        Object.entries(previous).forEach(([messageId, size]) => {
          if (messageIdSet.has(messageId)) {
            next[messageId] = size;
            return;
          }

          changed = true;
        });

        return changed ? next : previous;
      });
    }, 0);

    return () => {
      window.clearTimeout(pruneTimeoutId);
    };
  }, [messages, virtualizationEnabled]);

  const measurements = useMemo(() => {
    const offsets = [0];

    messages.forEach((messageItem, index) => {
      const messageId = String(messageItem.id);
      const nextHeight = sizeByMessageId[messageId] || estimatedVirtualizedMessageHeight;
      offsets[index + 1] = offsets[index] + nextHeight;
    });

    return {
      offsets,
      totalHeight: offsets[offsets.length - 1] || 0,
      messageIndexById: new Map(messages.map((messageItem, index) => [String(messageItem.id), index])),
    };
  }, [estimatedVirtualizedMessageHeight, messages, sizeByMessageId]);

  useEffect(() => {
    measurementsRef.current = measurements;
    sizeByMessageIdRef.current = sizeByMessageId;
  }, [measurements, sizeByMessageId]);

  const flushPendingSizeChanges = useCallback(() => {
    pendingSizeFlushRafRef.current = 0;

    const pendingEntries = Array.from(pendingSizeByMessageIdRef.current.entries());
    pendingSizeByMessageIdRef.current.clear();
    if (!pendingEntries.length) {
      return;
    }

    const list = messagesListRef.current;
    const previousMeasurements = measurementsRef.current;
    const previousScrollTop = Math.max(0, Number(list?.scrollTop) || 0);
    let scrollAnchorDelta = 0;

    if (list && previousMeasurements?.offsets?.length) {
      pendingEntries.forEach(([messageId, nextHeight]) => {
        const messageIndex = previousMeasurements.messageIndexById.get(String(messageId || ""));
        if (!Number.isInteger(messageIndex)) {
          return;
        }

        const previousTop = previousMeasurements.offsets[messageIndex] || 0;
        if (previousTop >= previousScrollTop) {
          return;
        }

        const previousHeight = sizeByMessageIdRef.current[String(messageId || "")] || estimatedVirtualizedMessageHeight;
        const delta = nextHeight - previousHeight;
        if (Math.abs(delta) < SIZE_CHANGE_EPSILON_PX) {
          return;
        }

        scrollAnchorDelta += delta;
      });
    }

    setSizeByMessageId((previous) => {
      let changed = false;
      const next = { ...previous };
      const changedEntries = [];

      pendingEntries.forEach(([messageId, nextHeight]) => {
        const previousHeight = previous[messageId] || estimatedVirtualizedMessageHeight;
        if (Math.abs(previousHeight - nextHeight) < SIZE_CHANGE_EPSILON_PX) {
          return;
        }

        next[messageId] = nextHeight;
        changedEntries.push({
          messageId,
          previousHeight,
          nextHeight,
          delta: nextHeight - previousHeight,
        });
        changed = true;
      });

      if (changedEntries.length) {
        recordPerfEvent("text-chat", "virtualizer:message-size-changes", {
          changedCount: changedEntries.length,
          changedEntries: changedEntries.slice(0, 12),
          scrollAnchorDelta,
          scrollTop: previousScrollTop,
        });
      }

      return changed ? next : previous;
    });

    if (!list) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (scrollAnchorDelta) {
        list.scrollTop = clampScrollTop(list, previousScrollTop + scrollAnchorDelta);
      }

      scheduleMetricsUpdate();
    });
  }, [estimatedVirtualizedMessageHeight, messagesListRef, scheduleMetricsUpdate]);

  const scheduleSizeFlush = useCallback(() => {
    if (pendingSizeFlushRafRef.current) {
      return;
    }

    pendingSizeFlushRafRef.current = window.requestAnimationFrame(flushPendingSizeChanges);
  }, [flushPendingSizeChanges]);

  useEffect(() => () => {
    if (pendingSizeFlushRafRef.current) {
      window.cancelAnimationFrame(pendingSizeFlushRafRef.current);
      pendingSizeFlushRafRef.current = 0;
    }
  }, []);

  const visibleRange = useMemo(() => {
    if (!virtualizationEnabled) {
      return {
        startIndex: 0,
        endIndex: Math.max(0, messages.length - 1),
      };
    }

    const viewportHeight = Math.max(
      estimatedVirtualizedMessageHeight * 6,
      scrollMetrics.viewportHeight || 0,
    );
    const startBoundary = Math.max(0, scrollMetrics.scrollTop - VIRTUALIZATION_OVERSCAN_PX);
    const endBoundary = scrollMetrics.scrollTop + viewportHeight + VIRTUALIZATION_OVERSCAN_PX;
    const startIndex = findStartIndex(measurements.offsets, startBoundary);

    let endIndex = startIndex;
    while (endIndex < messages.length - 1 && measurements.offsets[endIndex + 1] < endBoundary) {
      endIndex += 1;
    }

    return {
      startIndex: Math.max(0, startIndex),
      endIndex: Math.max(startIndex, endIndex),
    };
  }, [estimatedVirtualizedMessageHeight, measurements.offsets, messages.length, scrollMetrics.scrollTop, scrollMetrics.viewportHeight, virtualizationEnabled]);

  useEffect(() => {
    const previous = previousVisibleRangeRef.current;
    if (previous.startIndex === visibleRange.startIndex && previous.endIndex === visibleRange.endIndex) {
      return;
    }

    previousVisibleRangeRef.current = visibleRange;
    recordPerfEvent("text-chat", "virtualizer:visible-range", {
      virtualizationEnabled,
      messageCount: messages.length,
      startIndex: visibleRange.startIndex,
      endIndex: visibleRange.endIndex,
      visibleCount: Math.max(0, visibleRange.endIndex - visibleRange.startIndex + 1),
      scrollTop: scrollMetrics.scrollTop,
      viewportHeight: scrollMetrics.viewportHeight,
      topOffset: measurements.offsets[visibleRange.startIndex] || 0,
      bottomOffset: measurements.offsets[visibleRange.endIndex + 1] || measurements.totalHeight || 0,
    });
  }, [
    measurements.offsets,
    measurements.totalHeight,
    messages.length,
    scrollMetrics.scrollTop,
    scrollMetrics.viewportHeight,
    virtualizationEnabled,
    visibleRange,
  ]);

  const registerMeasuredNode = useCallback((messageId, node) => {
    if (!virtualizationEnabled) {
      return;
    }

    const normalizedMessageId = String(messageId || "");
    const previousObserver = observerByMessageIdRef.current.get(normalizedMessageId);

    if (previousObserver) {
      previousObserver.disconnect();
      observerByMessageIdRef.current.delete(normalizedMessageId);
    }

    if (!node || !normalizedMessageId) {
      return;
    }

    const measureNodeHeight = () => {
      const nextHeight = Math.max(
        MIN_MEASURED_MESSAGE_HEIGHT + VIRTUALIZED_MESSAGE_GAP_PX,
        Math.round(node.getBoundingClientRect().height || 0) + VIRTUALIZED_MESSAGE_GAP_PX,
      );
      if (!nextHeight) {
        return;
      }

      pendingSizeByMessageIdRef.current.set(normalizedMessageId, nextHeight);
      scheduleSizeFlush();
    };

    measureNodeHeight();

    if (typeof ResizeObserver !== "function") {
      return;
    }

    const observer = new ResizeObserver(() => {
      measureNodeHeight();
    });
    observer.observe(node);
    observerByMessageIdRef.current.set(normalizedMessageId, observer);
  }, [scheduleSizeFlush, virtualizationEnabled]);

  const estimateOffsetForMessageId = useCallback((messageId) => {
    const normalizedMessageId = String(messageId || "");
    const messageIndex = measurements.messageIndexById.get(normalizedMessageId);
    if (!Number.isInteger(messageIndex)) {
      return 0;
    }

    return measurements.offsets[messageIndex] || 0;
  }, [measurements.messageIndexById, measurements.offsets]);

  const topSpacerHeight = virtualizationEnabled ? measurements.offsets[visibleRange.startIndex] || 0 : 0;
  const bottomSpacerHeight = virtualizationEnabled
    ? Math.max(0, measurements.totalHeight - (measurements.offsets[visibleRange.endIndex + 1] || 0))
    : 0;

  return {
    virtualizationEnabled,
    visibleMessages: virtualizationEnabled
      ? messages.slice(visibleRange.startIndex, visibleRange.endIndex + 1)
      : messages,
    visibleStartIndex: virtualizationEnabled ? visibleRange.startIndex : 0,
    visibleEndIndex: virtualizationEnabled ? visibleRange.endIndex : Math.max(0, messages.length - 1),
    topSpacerHeight,
    bottomSpacerHeight,
    registerMeasuredNode,
    estimateOffsetForMessageId,
  };
}

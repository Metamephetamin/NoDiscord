import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_ESTIMATED_MESSAGE_HEIGHT = 132;
const VIRTUALIZATION_OVERSCAN_PX = 720;
const MIN_MESSAGES_FOR_VIRTUALIZATION = 40;

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

export default function useTextChatVirtualizer({
  messages,
  messagesListRef,
  estimatedMessageHeight = DEFAULT_ESTIMATED_MESSAGE_HEIGHT,
}) {
  const observerByMessageIdRef = useRef(new Map());
  const [sizeByMessageId, setSizeByMessageId] = useState({});
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, viewportHeight: 0 });
  const virtualizationEnabled = messages.length >= MIN_MESSAGES_FOR_VIRTUALIZATION;

  useEffect(() => {
    const list = messagesListRef.current;
    if (!list) {
      return undefined;
    }

    const updateMetrics = () => {
      setScrollMetrics({
        scrollTop: list.scrollTop,
        viewportHeight: list.clientHeight,
      });
    };

    updateMetrics();
    list.addEventListener("scroll", updateMetrics, { passive: true });
    window.addEventListener("resize", updateMetrics);

    return () => {
      list.removeEventListener("scroll", updateMetrics);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [messagesListRef]);

  useEffect(() => {
    const messageIdSet = new Set(messages.map((messageItem) => String(messageItem.id)));
    Array.from(observerByMessageIdRef.current.keys()).forEach((messageId) => {
      if (messageIdSet.has(messageId)) {
        return;
      }

      observerByMessageIdRef.current.get(messageId)?.disconnect();
      observerByMessageIdRef.current.delete(messageId);
      setSizeByMessageId((previous) => {
        if (!(messageId in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[messageId];
        return next;
      });
    });
  }, [messages]);

  const measurements = useMemo(() => {
    const offsets = [0];

    messages.forEach((messageItem, index) => {
      const messageId = String(messageItem.id);
      const nextHeight = sizeByMessageId[messageId] || estimatedMessageHeight;
      offsets[index + 1] = offsets[index] + nextHeight;
    });

    return {
      offsets,
      totalHeight: offsets[offsets.length - 1] || 0,
      messageIndexById: new Map(messages.map((messageItem, index) => [String(messageItem.id), index])),
    };
  }, [estimatedMessageHeight, messages, sizeByMessageId]);

  const visibleRange = useMemo(() => {
    if (!virtualizationEnabled) {
      return {
        startIndex: 0,
        endIndex: Math.max(0, messages.length - 1),
      };
    }

    const viewportHeight = Math.max(1, scrollMetrics.viewportHeight || 0);
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
  }, [measurements.offsets, messages.length, scrollMetrics.scrollTop, scrollMetrics.viewportHeight, virtualizationEnabled]);

  const registerMeasuredNode = useCallback((messageId, node) => {
    const normalizedMessageId = String(messageId || "");
    const previousObserver = observerByMessageIdRef.current.get(normalizedMessageId);

    if (previousObserver) {
      previousObserver.disconnect();
      observerByMessageIdRef.current.delete(normalizedMessageId);
    }

    if (!node || !normalizedMessageId) {
      return;
    }

    const applyHeight = () => {
      const nextHeight = Math.max(72, Math.round(node.getBoundingClientRect().height || 0));
      if (!nextHeight) {
        return;
      }

      setSizeByMessageId((previous) => (
        previous[normalizedMessageId] === nextHeight
          ? previous
          : { ...previous, [normalizedMessageId]: nextHeight }
      ));
    };

    applyHeight();

    if (typeof ResizeObserver !== "function") {
      return;
    }

    const observer = new ResizeObserver(() => {
      applyHeight();
    });
    observer.observe(node);
    observerByMessageIdRef.current.set(normalizedMessageId, observer);
  }, []);

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
    topSpacerHeight,
    bottomSpacerHeight,
    registerMeasuredNode,
    estimateOffsetForMessageId,
  };
}

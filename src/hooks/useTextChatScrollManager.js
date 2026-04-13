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
}) {
  const [floatingDateLabel, setFloatingDateLabel] = useState("");
  const [pendingNewMessagesCount, setPendingNewMessagesCount] = useState(0);
  const previousChannelIdRef = useRef("");
  const pendingInitialScrollChannelRef = useRef("");
  const previousMessageCountRef = useRef(0);
  const nearBottomRef = useRef(true);

  const clearUnreadBelow = useCallback(() => {
    setPendingNewMessagesCount(0);
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

  const scrollToMessage = useCallback((messageId, { behavior = "smooth", block = "center" } = {}) => {
    const element = messageRefs.current.get(messageId);
    if (!element) {
      return;
    }

    setHighlightedMessageId(String(messageId));
    element.scrollIntoView({ behavior, block });
    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === String(messageId) ? "" : current));
    }, 2200);
  }, [messageRefs, setHighlightedMessageId]);

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
      setPendingNewMessagesCount((current) => current + (messages.length - previousMessageCount));
    }
  }, [
    clearUnreadBelow,
    forceScrollToBottomRef,
    messages.length,
    messagesEndRef,
    messagesListRef,
    scheduleClearUnreadBelow,
    scopedChannelId,
  ]);

  return {
    floatingDateLabel,
    pendingNewMessagesCount,
    scrollToLatest,
    scrollToMessage,
  };
}

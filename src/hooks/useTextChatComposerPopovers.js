import { useEffect } from "react";

const deferEffectState = (callback) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  setTimeout(callback, 0);
};

export default function useTextChatComposerPopovers({
  composerEmojiPickerOpen,
  setComposerEmojiPickerOpen,
  composerEmojiPickerRef,
  composerEmojiButtonRef,
  mentionSuggestionsOpen,
  setMentionSuggestionsOpen,
  mentionSuggestionsRef,
  textareaRef,
  mentionSuggestions,
  mentionQueryContext,
  setSelectedMentionSuggestionIndex,
  scopedChannelId,
}) {
  useEffect(() => {
    if (!composerEmojiPickerOpen) {
      return undefined;
    }

    const handlePointerDownOutside = (event) => {
      const target = event.target;
      if (
        composerEmojiPickerRef.current?.contains(target)
        || composerEmojiButtonRef.current?.contains(target)
      ) {
        return;
      }

      setComposerEmojiPickerOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, [composerEmojiButtonRef, composerEmojiPickerOpen, composerEmojiPickerRef, setComposerEmojiPickerOpen]);

  useEffect(() => {
    if (!mentionSuggestionsOpen) {
      return undefined;
    }

    const handlePointerDownOutside = (event) => {
      const target = event.target;
      if (mentionSuggestionsRef.current?.contains(target) || textareaRef.current?.contains(target)) {
        return;
      }

      setMentionSuggestionsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, [mentionSuggestionsOpen, mentionSuggestionsRef, setMentionSuggestionsOpen, textareaRef]);

  useEffect(() => {
    let cancelled = false;

    deferEffectState(() => {
      if (cancelled) {
        return;
      }

      if (!mentionSuggestions.length || !mentionQueryContext) {
        setMentionSuggestionsOpen(false);
        setSelectedMentionSuggestionIndex(0);
        return;
      }

      setMentionSuggestionsOpen(true);
      setSelectedMentionSuggestionIndex((previous) => Math.min(previous, mentionSuggestions.length - 1));
    });

    return () => {
      cancelled = true;
    };
  }, [mentionQueryContext, mentionSuggestions, setMentionSuggestionsOpen, setSelectedMentionSuggestionIndex]);

  useEffect(() => {
    let cancelled = false;
    deferEffectState(() => {
      if (cancelled) {
        return;
      }

      setComposerEmojiPickerOpen(false);
      setMentionSuggestionsOpen(false);
      setSelectedMentionSuggestionIndex(0);
    });

    return () => {
      cancelled = true;
    };
  }, [scopedChannelId, setComposerEmojiPickerOpen, setMentionSuggestionsOpen, setSelectedMentionSuggestionIndex]);
}

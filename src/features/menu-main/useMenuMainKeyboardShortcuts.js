import { useEffect } from "react";

export default function useMenuMainKeyboardShortcuts({
  quickSwitcherOpen,
  quickSwitcherItems,
  quickSwitcherSelectedIndex,
  setQuickSwitcherOpen,
  setQuickSwitcherQuery,
  setQuickSwitcherSelectedIndex,
  closeQuickSwitcher,
  handleQuickSwitcherSelect,
  toggleMicMute,
  toggleSoundMute,
  directCallStateRef,
  acceptDirectCall,
  declineDirectCall,
  endDirectCall,
  navigateHistoryBack,
  navigateHistoryForward,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickSwitcherOpen((previous) => {
          const nextOpen = !previous;
          if (!nextOpen) {
            setQuickSwitcherQuery("");
            setQuickSwitcherSelectedIndex(0);
          } else {
            setQuickSwitcherSelectedIndex(0);
          }
          return nextOpen;
        });
        return;
      }

      if (quickSwitcherOpen && event.key === "Escape") {
        event.preventDefault();
        closeQuickSwitcher();
        return;
      }

      if (quickSwitcherOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setQuickSwitcherSelectedIndex((previous) => (
            quickSwitcherItems.length ? (previous + 1) % quickSwitcherItems.length : 0
          ));
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setQuickSwitcherSelectedIndex((previous) => (
            quickSwitcherItems.length ? (previous - 1 + quickSwitcherItems.length) % quickSwitcherItems.length : 0
          ));
          return;
        }

        if (event.key === "Enter") {
          const selectedItem = quickSwitcherItems[quickSwitcherSelectedIndex] || quickSwitcherItems[0];
          if (selectedItem) {
            event.preventDefault();
            handleQuickSwitcherSelect(selectedItem);
          }
          return;
        }
      }

      if (isEditableTarget) {
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMicMute();
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        toggleSoundMute();
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
        if (directCallStateRef.current.phase === "incoming") {
          event.preventDefault();
          void acceptDirectCall();
        }
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "e") {
        if (directCallStateRef.current.phase === "connected") {
          event.preventDefault();
          void endDirectCall();
          return;
        }

        if (directCallStateRef.current.phase !== "idle") {
          event.preventDefault();
          void declineDirectCall();
          return;
        }
      }

      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        navigateHistoryBack();
        return;
      }

      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        navigateHistoryForward();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    acceptDirectCall,
    closeQuickSwitcher,
    declineDirectCall,
    directCallStateRef,
    endDirectCall,
    handleQuickSwitcherSelect,
    navigateHistoryBack,
    navigateHistoryForward,
    quickSwitcherItems,
    quickSwitcherOpen,
    quickSwitcherSelectedIndex,
    setQuickSwitcherOpen,
    setQuickSwitcherQuery,
    setQuickSwitcherSelectedIndex,
    toggleMicMute,
    toggleSoundMute,
  ]);
}

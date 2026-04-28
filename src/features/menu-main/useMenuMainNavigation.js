import { useCallback, useEffect, useRef, useState } from "react";
import {
  readWorkspaceStateFromStorageKey,
  writeWorkspaceStateToStorageKey,
} from "./menuMainWorkspaceStorage";

export default function useMenuMainNavigation({
  workspaceMode,
  setWorkspaceMode,
  activeServerId,
  setActiveServerId,
  currentTextChannelId,
  setCurrentTextChannelId,
  activeDirectFriendId,
  setActiveDirectFriendId,
  activeConversationId,
  setActiveConversationId,
  friendsPageSection,
  setFriendsPageSection,
  desktopServerPane,
  setDesktopServerPane,
  selectedStreamUserId,
  setSelectedStreamUserId,
  mobileSection,
  setMobileSection,
  mobileServersPane,
  setMobileServersPane,
  isMobileViewport,
  currentVoiceChannel,
  workspaceStateStorageKey,
}) {
  const navigationHistoryRef = useRef({ back: [], forward: [] });
  const lastNavigationSnapshotRef = useRef(null);
  const restoredWorkspaceStateKeyRef = useRef("");
  const skipNextWorkspaceStatePersistRef = useRef(false);
  const [navigationAvailability, setNavigationAvailability] = useState({
    canNavigateBack: false,
    canNavigateForward: false,
  });

  const updateNavigationAvailability = useCallback(() => {
    const canNavigateBack = navigationHistoryRef.current.back.length > 0;
    const canNavigateForward = navigationHistoryRef.current.forward.length > 0;
    setNavigationAvailability((previousValue) => (
      previousValue.canNavigateBack === canNavigateBack && previousValue.canNavigateForward === canNavigateForward
        ? previousValue
        : { canNavigateBack, canNavigateForward }
    ));
  }, []);

  const buildNavigationSnapshot = useCallback(() => ({
    workspaceMode,
    activeServerId: String(activeServerId || ""),
    currentTextChannelId: String(currentTextChannelId || ""),
    activeDirectFriendId: String(activeDirectFriendId || ""),
    activeConversationId: String(activeConversationId || ""),
    desktopServerPane: String(desktopServerPane || "text"),
    selectedStreamUserId: selectedStreamUserId ? String(selectedStreamUserId) : "",
    mobileSection: String(mobileSection || "servers"),
    mobileServersPane: String(mobileServersPane || "channels"),
  }), [
    activeConversationId,
    activeDirectFriendId,
    activeServerId,
    currentTextChannelId,
    desktopServerPane,
    mobileSection,
    mobileServersPane,
    selectedStreamUserId,
    workspaceMode,
  ]);

  const applyNavigationSnapshot = useCallback((snapshot) => {
    if (!snapshot) {
      return;
    }

    setWorkspaceMode(snapshot.workspaceMode === "friends" ? "friends" : "servers");
    setActiveServerId(String(snapshot.activeServerId || ""));
    setCurrentTextChannelId(String(snapshot.currentTextChannelId || ""));
    setActiveDirectFriendId(String(snapshot.activeDirectFriendId || ""));
    setActiveConversationId(String(snapshot.activeConversationId || ""));
    setDesktopServerPane(snapshot.desktopServerPane === "voice" ? "voice" : "text");
    setSelectedStreamUserId(snapshot.selectedStreamUserId ? String(snapshot.selectedStreamUserId) : null);
    if (isMobileViewport) {
      setMobileSection(snapshot.mobileSection || "servers");
      setMobileServersPane(snapshot.mobileServersPane || "channels");
    }
  }, [
    isMobileViewport,
    setActiveConversationId,
    setActiveDirectFriendId,
    setActiveServerId,
    setCurrentTextChannelId,
    setDesktopServerPane,
    setMobileSection,
    setMobileServersPane,
    setSelectedStreamUserId,
    setWorkspaceMode,
  ]);

  const pushNavigationHistory = useCallback((nextSnapshotFactory) => {
    const currentSnapshot = buildNavigationSnapshot();
    const currentKey = JSON.stringify(currentSnapshot);
    const lastKey = JSON.stringify(lastNavigationSnapshotRef.current);
    if (currentKey !== lastKey) {
      navigationHistoryRef.current.back = [...navigationHistoryRef.current.back.slice(-39), currentSnapshot];
      lastNavigationSnapshotRef.current = currentSnapshot;
    }

    navigationHistoryRef.current.forward = [];
    updateNavigationAvailability();
    nextSnapshotFactory();
  }, [buildNavigationSnapshot, updateNavigationAvailability]);

  const navigateHistoryBack = useCallback(() => {
    const previousSnapshot = navigationHistoryRef.current.back.pop();
    if (!previousSnapshot) {
      return;
    }

    navigationHistoryRef.current.forward = [...navigationHistoryRef.current.forward.slice(-39), buildNavigationSnapshot()];
    applyNavigationSnapshot(previousSnapshot);
    lastNavigationSnapshotRef.current = previousSnapshot;
    updateNavigationAvailability();
  }, [applyNavigationSnapshot, buildNavigationSnapshot, updateNavigationAvailability]);

  const navigateHistoryForward = useCallback(() => {
    const nextSnapshot = navigationHistoryRef.current.forward.pop();
    if (!nextSnapshot) {
      return;
    }

    navigationHistoryRef.current.back = [...navigationHistoryRef.current.back.slice(-39), buildNavigationSnapshot()];
    applyNavigationSnapshot(nextSnapshot);
    lastNavigationSnapshotRef.current = nextSnapshot;
    updateNavigationAvailability();
  }, [applyNavigationSnapshot, buildNavigationSnapshot, updateNavigationAvailability]);

  useEffect(() => {
    if (!isMobileViewport) {
      return;
    }

    setMobileSection((previousSection) => {
      if (previousSection === "profile") {
        return previousSection;
      }

      return workspaceMode === "friends" ? "friends" : "servers";
    });
  }, [isMobileViewport, setMobileSection, workspaceMode]);

  useEffect(() => {
    lastNavigationSnapshotRef.current = buildNavigationSnapshot();
  }, [buildNavigationSnapshot]);

  useEffect(() => {
    if (!workspaceStateStorageKey || restoredWorkspaceStateKeyRef.current === workspaceStateStorageKey) {
      return;
    }

    restoredWorkspaceStateKeyRef.current = workspaceStateStorageKey;
    skipNextWorkspaceStatePersistRef.current = true;

    const storedWorkspaceState = readWorkspaceStateFromStorageKey(workspaceStateStorageKey);
    setWorkspaceMode(storedWorkspaceState.workspaceMode || "servers");
    setActiveDirectFriendId(storedWorkspaceState.activeDirectFriendId || "");
    setActiveConversationId(storedWorkspaceState.activeConversationId || "");
    setFriendsPageSection(storedWorkspaceState.friendsPageSection || "friends");
    if (storedWorkspaceState.activeServerId) {
      setActiveServerId(storedWorkspaceState.activeServerId);
    }
    if (storedWorkspaceState.currentTextChannelId) {
      setCurrentTextChannelId(storedWorkspaceState.currentTextChannelId);
    }
    setDesktopServerPane(storedWorkspaceState.desktopServerPane || "text");
    setMobileSection(storedWorkspaceState.mobileSection || "servers");
    setMobileServersPane(storedWorkspaceState.mobileServersPane || "channels");
  }, [
    setActiveConversationId,
    setActiveDirectFriendId,
    setActiveServerId,
    setCurrentTextChannelId,
    setDesktopServerPane,
    setFriendsPageSection,
    setMobileSection,
    setMobileServersPane,
    setWorkspaceMode,
    workspaceStateStorageKey,
  ]);

  useEffect(() => {
    if (!workspaceStateStorageKey) {
      return;
    }

    if (skipNextWorkspaceStatePersistRef.current) {
      skipNextWorkspaceStatePersistRef.current = false;
      return;
    }

    writeWorkspaceStateToStorageKey(workspaceStateStorageKey, {
      workspaceMode,
      activeDirectFriendId,
      activeConversationId,
      friendsPageSection,
      activeServerId,
      currentTextChannelId,
      desktopServerPane,
      mobileSection,
      mobileServersPane,
    });
  }, [
    activeConversationId,
    activeDirectFriendId,
    activeServerId,
    currentTextChannelId,
    desktopServerPane,
    friendsPageSection,
    mobileSection,
    mobileServersPane,
    workspaceMode,
    workspaceStateStorageKey,
  ]);

  useEffect(() => {
    if (!isMobileViewport || currentVoiceChannel || mobileServersPane !== "voice") {
      return;
    }

    setMobileServersPane("channels");
  }, [currentVoiceChannel, isMobileViewport, mobileServersPane, setMobileServersPane]);

  return {
    canNavigateBack: navigationAvailability.canNavigateBack,
    canNavigateForward: navigationAvailability.canNavigateForward,
    pushNavigationHistory,
    navigateHistoryBack,
    navigateHistoryForward,
  };
}

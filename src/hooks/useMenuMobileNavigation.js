export default function useMenuMobileNavigation({
  mobileSection,
  setMobileSection,
  workspaceMode,
  currentDirectFriend,
  setActiveDirectFriendId,
  setFriendsPageSection,
  isLocalSharePreviewVisible,
  setIsLocalSharePreviewVisible,
  currentVoiceChannel,
  setMobileServersPane,
  selectedStreamUserId,
  setSelectedStreamUserId,
  mobileServersPane,
  getDisplayName,
  user,
  totalDirectUnreadCount,
  totalServerUnreadCount,
  directUnreadCounts,
  currentDirectChannelId,
  friendsPageSection,
  friends,
  incomingFriendRequestCount,
  totalFriendsAttentionCount,
  hasLocalSharePreview,
  localSharePreview,
  activeServerUnreadCount,
  activeServer,
  selectedStreamParticipant,
  currentVoiceChannelName,
  currentVoiceParticipants,
  currentTextChannel,
  getChannelDisplayName,
  openSettingsPanel,
}) {
  const handleMobileBack = () => {
    if (mobileSection === "profile") {
      setMobileSection(workspaceMode === "friends" ? "friends" : "servers");
      return;
    }

    if (mobileSection === "friends" && currentDirectFriend) {
      setActiveDirectFriendId("");
      setFriendsPageSection("friends");
      return;
    }

    if (mobileSection === "servers" && isLocalSharePreviewVisible) {
      setIsLocalSharePreviewVisible(false);
      setMobileServersPane(currentVoiceChannel ? "voice" : "chat");
      return;
    }

    if (mobileSection === "servers" && selectedStreamUserId) {
      setSelectedStreamUserId(null);
      setMobileServersPane(currentVoiceChannel ? "voice" : "chat");
      return;
    }

    if (mobileSection === "servers" && mobileServersPane === "voice") {
      setMobileServersPane("channels");
      return;
    }

    if (mobileSection === "servers" && mobileServersPane === "chat") {
      setMobileServersPane(currentVoiceChannel ? "voice" : "channels");
    }
  };

  const mobileHeader = (() => {
    if (mobileSection === "profile") {
      return {
        title: getDisplayName(user),
        subtitle: user?.email || "Профиль",
        badge: totalDirectUnreadCount + totalServerUnreadCount,
        canGoBack: true,
        actionLabel: "Настройки",
        onAction: () => openSettingsPanel("personal_profile"),
      };
    }

    if (mobileSection === "friends" && currentDirectFriend) {
      return {
        title: getDisplayName(currentDirectFriend),
        subtitle: "Личный чат",
        badge: Number(directUnreadCounts[currentDirectChannelId] || 0),
        canGoBack: true,
        actionLabel: "Профиль",
        onAction: () => setMobileSection("profile"),
      };
    }

    if (mobileSection === "friends") {
      return {
        title: "Личные сообщения",
        subtitle: friendsPageSection === "add" ? "Поиск и добавление друзей" : `${friends.length} контактов`,
        badge: friendsPageSection === "add" ? incomingFriendRequestCount : totalFriendsAttentionCount,
        canGoBack: false,
        actionLabel: friendsPageSection === "add" ? "Друзья" : "Добавить",
        actionBadge: friendsPageSection === "add" ? 0 : incomingFriendRequestCount,
        onAction: () => {
          setActiveDirectFriendId("");
          setFriendsPageSection((previousSection) => (previousSection === "add" ? "friends" : "add"));
        },
      };
    }

    if (isLocalSharePreviewVisible && hasLocalSharePreview) {
      return {
        title: localSharePreview?.mode === "camera" ? "Ваше видео" : "Ваш стрим",
        subtitle: "Предпросмотр своего эфира",
        badge: activeServerUnreadCount,
        canGoBack: true,
        actionLabel: currentVoiceChannel ? "Голос" : "Каналы",
        onAction: () => {
          setIsLocalSharePreviewVisible(false);
          setMobileServersPane(currentVoiceChannel ? "voice" : "channels");
        },
      };
    }

    if (selectedStreamUserId) {
      return {
        title: selectedStreamParticipant?.name || "Трансляция",
        subtitle: "Просмотр эфира участника",
        badge: activeServerUnreadCount,
        canGoBack: true,
        actionLabel: currentVoiceChannel ? "Голос" : "Каналы",
        onAction: () => setSelectedStreamUserId(null),
      };
    }

    if (mobileServersPane === "voice" && currentVoiceChannel) {
      return {
        title: currentVoiceChannelName || "Голосовой канал",
        subtitle: activeServer?.name || `${currentVoiceParticipants.length} участников`,
        badge: activeServerUnreadCount,
        canGoBack: true,
        actionLabel: "Чат",
        onAction: () => setMobileServersPane("chat"),
      };
    }

    if (mobileServersPane === "chat") {
      return {
        title: getChannelDisplayName(currentTextChannel?.name || "channel", "text"),
        subtitle: activeServer?.name || "Текстовый канал",
        badge: activeServerUnreadCount,
        canGoBack: true,
        actionLabel: currentVoiceChannel ? "Голос" : "Каналы",
        onAction: () => setMobileServersPane(currentVoiceChannel ? "voice" : "channels"),
      };
    }

    return {
      title: activeServer?.name || "Серверы",
      subtitle: "Текстовые и голосовые каналы",
      badge: activeServerUnreadCount,
      canGoBack: false,
      actionLabel: "Профиль",
      onAction: () => setMobileSection("profile"),
    };
  })();

  return { handleMobileBack, mobileHeader };
}

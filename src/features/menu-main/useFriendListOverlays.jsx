import { useCallback, useMemo } from "react";
import TextChatProfileModal from "../../components/TextChatProfileModal";
import TextChatUserContextMenu from "../../components/TextChatUserContextMenu";
import { API_BASE_URL } from "../../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../../utils/auth";
import { copyTextToClipboard } from "../../utils/clipboard";
import { buildDirectMessageChannelId } from "../../utils/directMessageChannels";
import {
  clearCachedTextChatMessages,
  readCachedTextChatMessages,
  writeTextChatChannelClearedAt,
} from "../../utils/textChatMessageCache";
import { getDisplayName, isUserCurrentlyOnline } from "../../utils/menuMainModel";
import {
  formatCountLabel,
  formatKnownSinceLabel,
  formatLastDialogLabel,
  getLatestProfileDialogAt,
  requestFriendBlockState,
  requestRemoveFriend,
} from "./MenuMainControllerHelpers";

export default function useFriendListOverlays({
  activeDirectFriendId,
  blockedByFriendIds,
  blockedFriendIds,
  canInviteFriendToAnyServer,
  conversationTargets,
  currentUserId,
  directConversationTargets,
  friendListProfileModal,
  friendListUserContextMenu,
  friendListUserContextMenuRef,
  ignoredFriendIds,
  setFriendListProfileModal,
  setFriendListUserContextMenu,
  openDirectChat,
  startDirectCallIfAllowed,
  handleAddFriend,
  handleInviteFriendListUserToServer,
  refreshFriends,
  setFriends,
  updateFriendRelation,
  applyFriendBlockState,
  setDirectUnreadCounts,
  setActiveDirectFriendId,
  setTextChatLocalStateVersion,
  setFriendsError,
  setFriendActionStatus,
}) {
  const buildFriendProfileStats = useCallback((friend, directChannelId = "") => {
    const friendId = String(friend?.id || friend?.userId || "").trim();
    const sharedConversationCount = friendId
      ? conversationTargets.reduce((count, conversation) => {
        const members = Array.isArray(conversation?.members) ? conversation.members : [];
        return members.some((member) => String(member?.id || member?.userId || "") === friendId) ? count + 1 : count;
      }, 0)
      : 0;

    return [
      {
        id: "mutual-friends",
        label: "Общие друзья",
        value: formatCountLabel(friend?.mutualFriendsCount, "Нет общих друзей", "общий друг", "общих друга", "общих друзей"),
      },
      {
        id: "mutual-chats",
        label: "Общие чаты",
        value: formatCountLabel(sharedConversationCount, "Нет общих чатов", "общий чат", "общих чата", "общих чатов"),
      },
      {
        id: "known-since",
        label: "Вы знакомы",
        value: formatKnownSinceLabel(friend?.friendshipCreatedAt || friend?.friendship_created_at),
      },
      {
        id: "last-dialog",
        label: "Последний диалог",
        value: formatLastDialogLabel(getLatestProfileDialogAt(currentUserId, friend, directChannelId)),
      },
    ];
  }, [conversationTargets, currentUserId]);

  const openFriendListUserContextMenu = useCallback((event, friend) => {
    event.preventDefault();
    event.stopPropagation();

    if (!friend?.id) {
      return;
    }

    const padding = 12;
    const menuWidth = 238;
    const menuHeight = friend.isSelf ? 190 : 290;
    const nextX = Math.max(padding, Math.min(Number(event.clientX || 0), window.innerWidth - menuWidth - padding));
    const nextY = Math.max(padding, Math.min(Number(event.clientY || 0), window.innerHeight - menuHeight - padding));
    const directChannelId = String(friend.directChannelId || buildDirectMessageChannelId(currentUserId, friend.id));
    const hasClearableChat = Boolean(currentUserId && directChannelId && readCachedTextChatMessages(currentUserId, directChannelId).length > 0);
    const friendId = String(friend.id || "");
    const matchedDirectTarget = directConversationTargets.find((target) => String(target?.id || "") === friendId) || null;
    const isPendingRelation = ["pending_outgoing", "pending_incoming"].includes(
      String(friend.friendshipStatus || friend.friendship_status || "")
    );
    const isFriend = Boolean(friend.isFriend ?? (!isPendingRelation && (matchedDirectTarget ? !matchedDirectTarget?.isSelf : true)));
    const isBlocked = Boolean(friend.isBlocked || blockedFriendIds.has(friendId));
    const blockedYou = Boolean(friend.blockedYou || blockedByFriendIds.has(friendId));
    const isIgnored = Boolean(friend.isIgnored || ignoredFriendIds.has(friendId));

    setFriendListProfileModal(null);
    setFriendListUserContextMenu({
      x: nextX,
      y: nextY,
      userId: friendId,
      username: getDisplayName(friend),
      directChannelId,
      avatarUrl: String(friend.avatar || ""),
      avatarFrame: friend.avatarFrame || null,
      backgroundUrl: String(friend.profileBackgroundUrl || ""),
      backgroundFrame: friend.profileBackgroundFrame || null,
      profileCustomization: friend.profileCustomization || null,
      isOnline: Boolean(friend.isOnline ?? friend.is_online ?? friend.online ?? false),
      lastSeenAt: String(friend.lastSeenAt || friend.last_seen_at || friend.lastSeen || friend.last_seen || ""),
      presence: friend.presence || friend.presenceStatus || friend.presence_status || "",
      isSelf: Boolean(friend.isSelf),
      isFriend,
      isBlocked,
      blockedYou,
      isIgnored,
      canOpenDirectChat: !friend.isSelf && isFriend && !isBlocked && !blockedYou,
      canInviteToServer: isFriend && !isBlocked && !blockedYou && canInviteFriendToAnyServer(friendId),
      hasClearableChat: isFriend && hasClearableChat,
      socialStats: buildFriendProfileStats(friend, directChannelId),
    });
  }, [
    blockedByFriendIds,
    blockedFriendIds,
    buildFriendProfileStats,
    canInviteFriendToAnyServer,
    currentUserId,
    directConversationTargets,
    ignoredFriendIds,
    setFriendListProfileModal,
    setFriendListUserContextMenu,
  ]);

  const openFriendListProfile = useCallback((friend) => {
    if (!friend?.id) {
      return;
    }

    const friendId = String(friend.id || "");
    const matchedDirectTarget = directConversationTargets.find((target) => String(target?.id || "") === friendId) || null;
    const profileSource = matchedDirectTarget || friend;
    const isSelf = Boolean(profileSource.isSelf) || friendId === currentUserId;
    const isFriend = Boolean(profileSource.isFriend ?? (matchedDirectTarget && !matchedDirectTarget?.isSelf));
    const isBlocked = Boolean(friend.isBlocked || blockedFriendIds.has(friendId));
    const blockedYou = Boolean(friend.blockedYou || blockedByFriendIds.has(friendId));
    const isIgnored = Boolean(friend.isIgnored || ignoredFriendIds.has(friendId));
    const directChannelId = String(profileSource.directChannelId || buildDirectMessageChannelId(currentUserId, friend.id));

    setFriendListUserContextMenu(null);
    setFriendListProfileModal({
      userId: friendId,
      username: getDisplayName(profileSource),
      avatarUrl: String(profileSource.avatar || ""),
      avatarFrame: profileSource.avatarFrame || null,
      backgroundUrl: String(profileSource.profileBackgroundUrl || ""),
      backgroundFrame: profileSource.profileBackgroundFrame || null,
      profileCustomization: profileSource.profileCustomization || null,
      isOnline: Boolean(profileSource.isOnline ?? profileSource.is_online ?? profileSource.online ?? false),
      lastSeenAt: String(profileSource.lastSeenAt || profileSource.last_seen_at || profileSource.lastSeen || profileSource.last_seen || ""),
      presence: profileSource.presence || profileSource.presenceStatus || profileSource.presence_status || "",
      isSelf,
      isFriend,
      isBlocked,
      blockedYou,
      isIgnored,
      canOpenDirectChat: !isSelf && isFriend,
      socialStats: buildFriendProfileStats(profileSource, directChannelId),
    });
  }, [
    blockedByFriendIds,
    blockedFriendIds,
    buildFriendProfileStats,
    currentUserId,
    directConversationTargets,
    ignoredFriendIds,
    setFriendListProfileModal,
    setFriendListUserContextMenu,
  ]);

  const closeFriendListUserContextMenu = useCallback(() => setFriendListUserContextMenu(null), [setFriendListUserContextMenu]);
  const closeFriendListProfileModal = useCallback(() => setFriendListProfileModal(null), [setFriendListProfileModal]);

  const openFriendListProfileFromMenu = useCallback(() => {
    if (!friendListUserContextMenu) {
      return;
    }

    const sourceFriend = directConversationTargets.find((friend) => String(friend?.id || "") === String(friendListUserContextMenu.userId || "")) || friendListUserContextMenu;
    setFriendListProfileModal({
      userId: friendListUserContextMenu.userId,
      username: friendListUserContextMenu.username,
      avatarUrl: friendListUserContextMenu.avatarUrl,
      avatarFrame: friendListUserContextMenu.avatarFrame || null,
      backgroundUrl: friendListUserContextMenu.backgroundUrl || "",
      backgroundFrame: friendListUserContextMenu.backgroundFrame || null,
      profileCustomization: friendListUserContextMenu.profileCustomization || sourceFriend?.profileCustomization || null,
      isOnline: friendListUserContextMenu.isOnline,
      lastSeenAt: friendListUserContextMenu.lastSeenAt || "",
      presence: friendListUserContextMenu.presence || "",
      isSelf: friendListUserContextMenu.isSelf,
      isFriend: Boolean(friendListUserContextMenu.isFriend),
      isBlocked: friendListUserContextMenu.isBlocked,
      blockedYou: friendListUserContextMenu.blockedYou,
      isIgnored: friendListUserContextMenu.isIgnored,
      canOpenDirectChat: friendListUserContextMenu.canOpenDirectChat,
      socialStats: buildFriendProfileStats(sourceFriend, friendListUserContextMenu.directChannelId),
    });
    setFriendListUserContextMenu(null);
  }, [
    buildFriendProfileStats,
    directConversationTargets,
    friendListUserContextMenu,
    setFriendListProfileModal,
    setFriendListUserContextMenu,
  ]);

  const handleFriendListDirectChat = useCallback((userId, isSelf = false) => {
    if (!userId || isSelf) {
      return;
    }

    openDirectChat(userId);
  }, [openDirectChat]);

  const handleCopyFriendListUserId = useCallback(async (userId) => {
    if (!userId) {
      return;
    }

    try {
      await copyTextToClipboard(String(userId));
    } catch {
      return;
    }
  }, []);

  const handleReportFriendListUser = useCallback(async (targetProfile, reason) => {
    const targetUserId = String(targetProfile?.userId || "").trim();
    if (!targetUserId || targetProfile?.isSelf) {
      return;
    }

    const response = await authFetch(`${API_BASE_URL}/user/${encodeURIComponent(targetUserId)}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await parseApiResponse(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Не удалось отправить жалобу."));
    }

    setFriendActionStatus("Жалоба отправлена администратору.");
  }, [setFriendActionStatus]);

  const handleClearDirectChatForCurrentUser = useCallback(() => {
    const normalizedChannelId = String(friendListUserContextMenu?.directChannelId || "").trim();
    if (!currentUserId || !normalizedChannelId || !friendListUserContextMenu?.hasClearableChat) {
      return;
    }

    writeTextChatChannelClearedAt(currentUserId, normalizedChannelId, new Date().toISOString());
    clearCachedTextChatMessages(currentUserId, normalizedChannelId);
    setTextChatLocalStateVersion((previous) => previous + 1);
    setFriendsError("");
    setFriendActionStatus(`Чат с ${friendListUserContextMenu?.username || "пользователем"} очищен только у вас.`);
    setFriendListUserContextMenu(null);
  }, [
    currentUserId,
    friendListUserContextMenu,
    setFriendActionStatus,
    setFriendListUserContextMenu,
    setFriendsError,
    setTextChatLocalStateVersion,
  ]);

  const handleRemoveFriendListUser = useCallback(async () => {
    const targetUserId = String(friendListUserContextMenu?.userId || "").trim();
    if (!targetUserId || friendListUserContextMenu?.isSelf) {
      return;
    }

    const username = friendListUserContextMenu?.username || "Пользователь";
    const directChannelId = String(
      friendListUserContextMenu?.directChannelId || buildDirectMessageChannelId(currentUserId, targetUserId)
    );

    setFriendListUserContextMenu(null);
    setFriendsError("");

    try {
      await requestRemoveFriend(targetUserId);
      setFriends((previousFriends) =>
        previousFriends.filter((friend) => String(friend?.id || "") !== targetUserId)
      );
      updateFriendRelation(targetUserId, ({ ignoredIds }) => {
        ignoredIds.delete(targetUserId);
      });
      setFriendListProfileModal((previousProfile) =>
        String(previousProfile?.userId || "") === targetUserId ? null : previousProfile
      );
      setDirectUnreadCounts((previousCounts) => {
        if (!directChannelId || !Object.prototype.hasOwnProperty.call(previousCounts, directChannelId)) {
          return previousCounts;
        }

        const nextCounts = { ...previousCounts };
        delete nextCounts[directChannelId];
        return nextCounts;
      });

      if (String(activeDirectFriendId || "") === targetUserId) {
        setActiveDirectFriendId("");
      }

      setFriendActionStatus(`${username} удалён из друзей.`);
      refreshFriends().catch(() => {});
    } catch (error) {
      setFriendsError(error?.message || "Не удалось удалить пользователя из друзей.");
    }
  }, [
    activeDirectFriendId,
    currentUserId,
    friendListUserContextMenu,
    refreshFriends,
    setActiveDirectFriendId,
    setDirectUnreadCounts,
    setFriendActionStatus,
    setFriendListProfileModal,
    setFriendListUserContextMenu,
    setFriends,
    setFriendsError,
    updateFriendRelation,
  ]);

  const handleToggleFriendListIgnore = useCallback(() => {
    const targetUserId = String(friendListUserContextMenu?.userId || "").trim();
    if (!targetUserId || friendListUserContextMenu?.isSelf || friendListUserContextMenu?.isBlocked) {
      return;
    }

    const willIgnore = !friendListUserContextMenu?.isIgnored;
    updateFriendRelation(targetUserId, ({ ignoredIds }) => {
      if (willIgnore) {
        ignoredIds.add(targetUserId);
      } else {
        ignoredIds.delete(targetUserId);
      }
    });

    if (willIgnore && String(activeDirectFriendId || "") === targetUserId) {
      setActiveDirectFriendId("");
    }

    setFriendActionStatus(
      willIgnore
        ? `${friendListUserContextMenu?.username || "Пользователь"} добавлен в игнор.`
        : `${friendListUserContextMenu?.username || "Пользователь"} убран из игнора.`
    );
    setFriendListUserContextMenu(null);
  }, [
    activeDirectFriendId,
    friendListUserContextMenu,
    setActiveDirectFriendId,
    setFriendActionStatus,
    setFriendListUserContextMenu,
    updateFriendRelation,
  ]);

  const handleToggleFriendListBlock = useCallback(async () => {
    const targetUserId = String(friendListUserContextMenu?.userId || "").trim();
    if (!targetUserId || friendListUserContextMenu?.isSelf) {
      return;
    }

    const willBlock = !friendListUserContextMenu?.isBlocked;
    updateFriendRelation(targetUserId, ({ ignoredIds, blockedIds }) => {
      if (willBlock) {
        blockedIds.add(targetUserId);
        ignoredIds.delete(targetUserId);
      } else {
        blockedIds.delete(targetUserId);
      }
    });
    applyFriendBlockState(targetUserId, {
      isBlocked: willBlock,
      blockedYou: friendListUserContextMenu?.blockedYou,
    });

    try {
      const blockState = await requestFriendBlockState(targetUserId, willBlock);
      applyFriendBlockState(targetUserId, blockState);
      setFriendActionStatus(
        willBlock
          ? `${friendListUserContextMenu?.username || "Пользователь"} заблокирован.`
          : `${friendListUserContextMenu?.username || "Пользователь"} разблокирован.`
      );
      refreshFriends().catch(() => {});
    } catch (error) {
      updateFriendRelation(targetUserId, ({ blockedIds }) => {
        if (willBlock) {
          blockedIds.delete(targetUserId);
        } else {
          blockedIds.add(targetUserId);
        }
      });
      applyFriendBlockState(targetUserId, {
        isBlocked: !willBlock,
        blockedYou: friendListUserContextMenu?.blockedYou,
      });
      setFriendsError(error?.message || "Не удалось обновить блокировку.");
    } finally {
      setFriendListUserContextMenu(null);
    }
  }, [
    applyFriendBlockState,
    friendListUserContextMenu,
    refreshFriends,
    setFriendActionStatus,
    setFriendListUserContextMenu,
    setFriendsError,
    updateFriendRelation,
  ]);

  const friendListUserContextMenuSections = useMemo(() => [
    [
      {
        id: "profile",
        label: "Профиль",
        icon: "◧",
        disabled: false,
        onClick: openFriendListProfileFromMenu,
      },
      {
        id: "direct-chat",
        label: "Начать чат",
        icon: "✉",
        disabled: !friendListUserContextMenu?.canOpenDirectChat,
        onClick: () => {
          handleFriendListDirectChat(friendListUserContextMenu?.userId, friendListUserContextMenu?.isSelf);
          setFriendListUserContextMenu(null);
        },
      },
      ...(friendListUserContextMenu?.isSelf
        ? []
        : [{
          id: "direct-call",
          label: "Позвонить",
          icon: "☎",
          disabled: Boolean(!friendListUserContextMenu?.userId || !friendListUserContextMenu?.canOpenDirectChat || friendListUserContextMenu?.isBlocked || friendListUserContextMenu?.blockedYou || !isUserCurrentlyOnline(friendListUserContextMenu)),
          onClick: () => {
            const targetUserId = friendListUserContextMenu?.userId;
            if (!targetUserId) {
              return;
            }

            setFriendListUserContextMenu(null);
            void startDirectCallIfAllowed(targetUserId);
          },
        }]),
      {
        id: "clear-local-chat",
        label: "Очистить чат у себя",
        icon: "🧹",
        disabled: !friendListUserContextMenu?.directChannelId || !friendListUserContextMenu?.hasClearableChat,
        onClick: handleClearDirectChatForCurrentUser,
      },
    ],
    friendListUserContextMenu?.isSelf ? [] : [
      {
        id: "invite",
        label: "Пригласить на сервер",
        icon: "↗",
        disabled: !friendListUserContextMenu?.canInviteToServer,
        onClick: handleInviteFriendListUserToServer,
      },
      {
        id: "ignore",
        label: friendListUserContextMenu?.isIgnored ? "Убрать из игнора" : "Игнорировать",
        icon: "◦",
        disabled: Boolean(friendListUserContextMenu?.isBlocked),
        onClick: handleToggleFriendListIgnore,
      },
      {
        id: "block",
        label: friendListUserContextMenu?.isBlocked ? "Разблокировать" : "Заблокировать",
        icon: "⊖",
        danger: !friendListUserContextMenu?.isBlocked,
        disabled: false,
        onClick: handleToggleFriendListBlock,
      },
      ...(friendListUserContextMenu?.isFriend ? [{
        id: "remove-friend",
        label: "Удалить из друзей",
        icon: "×",
        danger: true,
        disabled: !friendListUserContextMenu?.userId,
        onClick: handleRemoveFriendListUser,
      }] : []),
    ],
    [
      {
        id: "copy-id",
        label: "Копировать ID пользователя",
        icon: "ID",
        disabled: !friendListUserContextMenu?.userId,
        onClick: async () => {
          await handleCopyFriendListUserId(friendListUserContextMenu?.userId);
          setFriendListUserContextMenu(null);
        },
      },
    ],
  ].filter((section) => section.length > 0), [
    friendListUserContextMenu,
    handleClearDirectChatForCurrentUser,
    handleCopyFriendListUserId,
    handleFriendListDirectChat,
    handleInviteFriendListUserToServer,
    handleRemoveFriendListUser,
    handleToggleFriendListBlock,
    handleToggleFriendListIgnore,
    openFriendListProfileFromMenu,
    setFriendListUserContextMenu,
    startDirectCallIfAllowed,
  ]);

  const friendListOverlayElement = useMemo(() => (
    <>
      <TextChatUserContextMenu
        menuRef={friendListUserContextMenuRef}
        menu={friendListUserContextMenu}
        sections={friendListUserContextMenuSections}
        onClose={closeFriendListUserContextMenu}
      />
      <TextChatProfileModal
        profile={friendListProfileModal}
        onClose={closeFriendListProfileModal}
        onOpenDirectChat={() => {
          handleFriendListDirectChat(friendListProfileModal?.userId, friendListProfileModal?.isSelf);
          setFriendListProfileModal(null);
        }}
        onStartDirectCall={() => {
          if (!friendListProfileModal?.userId || friendListProfileModal.isSelf || friendListProfileModal.isBlocked || friendListProfileModal.blockedYou || !isUserCurrentlyOnline(friendListProfileModal)) {
            return;
          }

          startDirectCallIfAllowed(friendListProfileModal.userId);
          setFriendListProfileModal(null);
        }}
        onAddFriend={() => {
          if (!friendListProfileModal?.userId || friendListProfileModal.isSelf || friendListProfileModal.isFriend) {
            return;
          }

          handleAddFriend({
            id: friendListProfileModal.userId,
            name: friendListProfileModal.username,
            avatar: friendListProfileModal.avatarUrl,
          });
        }}
        onCopyUserId={() => handleCopyFriendListUserId(friendListProfileModal?.userId)}
        onReportUser={handleReportFriendListUser}
      />
    </>
  ), [
    closeFriendListProfileModal,
    closeFriendListUserContextMenu,
    friendListProfileModal,
    friendListUserContextMenu,
    friendListUserContextMenuRef,
    friendListUserContextMenuSections,
    handleAddFriend,
    handleCopyFriendListUserId,
    handleFriendListDirectChat,
    handleReportFriendListUser,
    setFriendListProfileModal,
    startDirectCallIfAllowed,
  ]);

  return {
    friendListOverlayElement,
    openFriendListProfile,
    openFriendListUserContextMenu,
  };
}

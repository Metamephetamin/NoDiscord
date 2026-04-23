import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import { DirectCallOverlayView } from "./MenuMainOverlays";
import ServerInvitesPanel from "./ServerInvitesPanel";
import TextChat from "./TextChat";
import useMobileLongPress from "../hooks/useMobileLongPress";
import { buildDirectMessageChannelId } from "../utils/directMessageChannels";
import { formatUserPresenceStatus, isUserCurrentlyOnline } from "../utils/menuMainModel";

function FriendsNavIcon({ kind }) {
  switch (kind) {
    case "friends":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 11C10.6569 11 12 9.65685 12 8C12 6.34315 10.6569 5 9 5C7.34315 5 6 6.34315 6 8C6 9.65685 7.34315 11 9 11Z" />
          <path d="M15.5 10C16.8807 10 18 8.88071 18 7.5C18 6.11929 16.8807 5 15.5 5C14.1193 5 13 6.11929 13 7.5C13 8.88071 14.1193 10 15.5 10Z" />
          <path d="M4.5 18C4.5 15.7909 6.29086 14 8.5 14H9.5C11.7091 14 13.5 15.7909 13.5 18" />
          <path d="M13.5 18C13.5 16.3431 14.8431 15 16.5 15H17C18.6569 15 20 16.3431 20 18" />
        </svg>
      );
    case "add":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 19C15 16.7909 13.2091 15 11 15H8C5.79086 15 4 16.7909 4 19" />
          <path d="M9.5 11C11.433 11 13 9.433 13 7.5C13 5.567 11.433 4 9.5 4C7.567 4 6 5.567 6 7.5C6 9.433 7.567 11 9.5 11Z" />
          <path d="M18 8V14" />
          <path d="M15 11H21" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 8.5H18" />
          <path d="M6 12H14.5" />
          <path d="M7.5 20.25C7.08 20.25 6.7 20.01 6.53 19.63L5.52 17.25H5C3.34 17.25 2 15.91 2 14.25V6.75C2 5.09 3.34 3.75 5 3.75H19C20.66 3.75 22 5.09 22 6.75V14.25C22 15.91 20.66 17.25 19 17.25H11.89L8.1 20.01C7.92 20.17 7.71 20.25 7.5 20.25Z" />
        </svg>
      );
  }
}

const CONVERSATION_ROLE_OPTIONS = [
  {
    id: "admin",
    label: "Администратор",
    description: "Может менять карточку беседы, роли, добавлять и выгонять участников.",
  },
  {
    id: "moderator",
    label: "Модератор",
    description: "Может добавлять и выгонять участников.",
  },
  {
    id: "inviter",
    label: "Приглашающий",
    description: "Может только добавлять участников.",
  },
  {
    id: "member",
    label: "Участник",
    description: "Без дополнительных прав.",
  },
];

const CONVERSATION_ROLE_LABELS = {
  owner: "Владелец",
  admin: "Администратор",
  moderator: "Модератор",
  inviter: "Приглашающий",
  member: "Участник",
};

const CONVERSATION_ROLE_PRIORITIES = {
  owner: 4,
  admin: 3,
  moderator: 2,
  inviter: 1,
  member: 0,
};

const getConversationRoleLabel = (role) => CONVERSATION_ROLE_LABELS[String(role || "member").toLowerCase()] || "Участник";
const getConversationRolePriority = (role) => CONVERSATION_ROLE_PRIORITIES[String(role || "member").toLowerCase()] ?? 0;

const getConversationMemberRole = (member, ownerUserId) => (
  String(member?.id || "") === String(ownerUserId || "")
    ? "owner"
    : String(member?.role || "member").toLowerCase()
);

export const FriendsSidebar = ({
  query,
  navItems,
  friendsPageSection,
  incomingFriendRequestCount,
  filteredFriends,
  filteredConversations,
  activeDirectFriendId,
  activeConversationId,
  directUnreadCounts,
  chatDraftPresence,
  currentUserId,
  profilePanel,
  onQueryChange,
  onOpenFriendsWorkspace,
  onOpenServersWorkspace,
  onResetDirect,
  onSetFriendsSection,
  onOpenDirectChat,
  onOpenConversationChat,
  onOpenUserContextMenu,
  overlayContent = null,
  getDisplayName,
}) => {
  const friendItemLongPress = useMobileLongPress();
  const [pressedFriendId, setPressedFriendId] = useState("");

  return (
    <aside className="sidebar__channels sidebar__channels--friends">
      <div className="channels__top">
        <input
          className="friends-search-input"
          type="text"
          placeholder="Найти друга или беседу"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />

        <div className="friends-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`friends-nav__item ${item.id === "friends" && friendsPageSection === "friends" && !activeDirectFriendId && !activeConversationId ? "friends-nav__item--active" : ""}`}
              onClick={() => {
                if (item.id === "friends") {
                  onOpenFriendsWorkspace();
                  onResetDirect();
                  onSetFriendsSection("friends");
                  return;
                }

                onOpenServersWorkspace();
              }}
            >
              <span className="friends-nav__icon"><FriendsNavIcon kind="friends" /></span>
              <span>{item.label}</span>
            </button>
          ))}

          <button
            type="button"
            className={`friends-nav__item ${friendsPageSection === "add" && !activeDirectFriendId && !activeConversationId ? "friends-nav__item--active friends-nav__item--accent" : ""}`}
            onClick={() => {
              onOpenFriendsWorkspace();
              onResetDirect();
              onSetFriendsSection("add");
            }}
          >
            <span className="friends-nav__icon"><FriendsNavIcon kind="add" /></span>
            <span>Добавить в друзья</span>
            {incomingFriendRequestCount > 0 ? <span className="friends-nav__badge">{Math.min(incomingFriendRequestCount, 99)}</span> : null}
          </button>
          <button
            type="button"
            className={`friends-nav__item ${friendsPageSection === "conversations" && !activeDirectFriendId && !activeConversationId ? "friends-nav__item--active" : ""}`}
            onClick={() => {
              onOpenFriendsWorkspace();
              onResetDirect();
              onSetFriendsSection("conversations");
            }}
          >
            <span className="friends-nav__icon"><FriendsNavIcon kind="conversations" /></span>
            <span>Беседы</span>
          </button>
        </div>

        <div className="friends-directs">
          <div className="friends-directs__header">
            <span>Личные сообщения</span>
          </div>

          <div className="friends-directs__list">
            {filteredFriends.length ? (
              filteredFriends.map((friend) => {
                const directChannelId = friend.directChannelId || buildDirectMessageChannelId(currentUserId, friend.id);
                const unreadCount = Number(directUnreadCounts[directChannelId] || 0);
                const hasDraft = Boolean(chatDraftPresence[directChannelId]);

                return (
                  <button
                    key={friend.id}
                    type="button"
                    className={`friends-directs__item ${String(activeDirectFriendId) === String(friend.id) ? "friends-directs__item--active" : ""} ${pressedFriendId === String(friend.id) ? "friends-directs__item--pressing" : ""}`}
                    onClick={(event) => {
                      if (friendItemLongPress.consumeSuppressedClick()) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }

                      onOpenDirectChat(friend.id);
                    }}
                    onContextMenu={(event) => onOpenUserContextMenu?.(event, friend)}
                    {...friendItemLongPress.bindLongPress(friend, (event, pressedFriend) => {
                      onOpenUserContextMenu?.(event, pressedFriend);
                    }, {
                      onStart: (pressedFriend) => setPressedFriendId(String(pressedFriend?.id || "")),
                      onCancel: () => setPressedFriendId(""),
                      onTrigger: () => setPressedFriendId(""),
                    })}
                  >
                    <AnimatedAvatar className="friends-directs__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="eager" decoding="sync" />
                    <span className="friends-directs__meta">
                      <span className={`friends-directs__name ${isUserCurrentlyOnline(friend) ? "friends-directs__name--online" : ""}`}>{getDisplayName(friend)}</span>
                      {hasDraft ? <span className="friends-directs__draft">Черновик</span> : null}
                    </span>
                    {unreadCount > 0 ? <span className="sidebar-unread-badge">{Math.min(unreadCount, 99)}</span> : null}
                  </button>
                );
              })
            ) : (
              <div className="friends-panel__empty">Подходящих друзей пока нет.</div>
            )}
          </div>
        </div>

        <div className="friends-directs friends-directs--conversations">
          <div className="friends-directs__header">
            <span>БЕСЕДЫ</span>
          </div>

          <div className="friends-directs__list">
            {filteredConversations.length ? (
              filteredConversations.map((conversation) => {
                const conversationId = String(conversation.conversationId || conversation.id || "");
                const conversationChannelId = String(conversation.directChannelId || "");
                const unreadCount = Number(directUnreadCounts[conversationChannelId] || 0);
                const hasDraft = Boolean(chatDraftPresence[conversationChannelId]);
                const memberCount = Number(conversation.memberCount || conversation.members?.length || 0);
                const participantLabel = `${memberCount} ${memberCount === 1 ? "участник" : memberCount < 5 ? "участника" : "участников"}`;

                return (
                  <button
                    key={conversationId}
                    type="button"
                    className={`friends-directs__item ${String(activeConversationId) === conversationId ? "friends-directs__item--active" : ""}`}
                    onClick={() => onOpenConversationChat(conversationId)}
                  >
                    <AnimatedAvatar
                      className="friends-directs__avatar"
                      src={conversation.avatar || ""}
                      alt={conversation.title || "Беседа"}
                      loading="eager"
                      decoding="sync"
                    />
                    <span className="friends-directs__meta">
                      <span className="friends-directs__name">{conversation.title || "Новая беседа"}</span>
                      <span className="friends-directs__status">
                        {hasDraft ? "Черновик" : participantLabel}
                      </span>
                    </span>
                    {unreadCount > 0 ? <span className="sidebar-unread-badge">{Math.min(unreadCount, 99)}</span> : null}
                  </button>
                );
              })
            ) : (
              <div className="friends-panel__empty">Пока нет бесед.</div>
            )}
          </div>
        </div>
      </div>

      {profilePanel}
      {overlayContent}
    </aside>
  );
};

export const FriendsMain = ({
  user,
  currentDirectFriend,
  currentConversationTarget,
  activeConversationId,
  currentDirectChannelId,
  currentConversationChannelId,
  directConversationTargets,
  directSearchQuery,
  textChatLocalStateVersion = 0,
  directCallPanelProps = null,
  friendsPageSection,
  friends,
  incomingFriendRequestCount,
  incomingFriendRequests,
  friendRequestsError,
  friendRequestsLoading,
  friendRequestActionId,
  friendEmail,
  friendQueryMode,
  friendLookupLoading,
  friendLookupResults,
  friendLookupPerformed,
  friendsError,
  isAddingFriend,
  activeContacts,
  conversations,
  conversationsLoading,
  conversationsError,
  conversationActionLoading,
  onResetDirect,
  onSetFriendsSection,
  onOpenDirectChat,
  onOpenConversationChat,
  onCreateConversation,
  onUploadConversationAvatar,
  onAddConversationMember,
  onUpdateConversation,
  onUpdateConversationMemberRole,
  onRemoveConversationMember,
  onLeaveConversation,
  onDeleteConversation,
  onClearConversationStatus,
  onStartDirectCall,
  onOpenDirectActions,
  onFriendRequestAction,
  onFriendSearchSubmit,
  onFriendSearchChange,
  onDirectSearchQueryChange,
  onClearDirectSearchQuery,
  onAddFriend,
  onOpenServersWorkspace,
  onImportServer,
  onServerShared,
  phoneIcon,
  searchIcon,
  getDisplayName,
}) => {
  const conversationAvatarInputRef = useRef(null);
  const conversationSettingsAvatarInputRef = useRef(null);
  const [createConversationStep, setCreateConversationStep] = useState("");
  const [conversationTitle, setConversationTitle] = useState("");
  const [conversationAvatarFile, setConversationAvatarFile] = useState(null);
  const [conversationAvatarPreview, setConversationAvatarPreview] = useState("");
  const [selectedConversationFriendIds, setSelectedConversationFriendIds] = useState([]);
  const [conversationFriendSearch, setConversationFriendSearch] = useState("");
  const [showAddConversationMemberForm, setShowAddConversationMemberForm] = useState(false);
  const [addConversationMemberSearch, setAddConversationMemberSearch] = useState("");
  const [pendingConversationMemberId, setPendingConversationMemberId] = useState("");
  const [showConversationSettings, setShowConversationSettings] = useState(false);
  const [conversationSettingsTitle, setConversationSettingsTitle] = useState("");
  const [conversationSettingsAvatarFile, setConversationSettingsAvatarFile] = useState(null);
  const [conversationSettingsAvatarPreview, setConversationSettingsAvatarPreview] = useState("");
  const [conversationSettingsSearch, setConversationSettingsSearch] = useState("");
  const [activeConversationMemberActionId, setActiveConversationMemberActionId] = useState("");
  const activeDirectCall = directCallPanelProps?.call;
  const activeDirectCallPanelProps =
    !currentConversationTarget &&
    currentDirectFriend &&
    activeDirectCall &&
    ["connected", "connecting", "reconnecting"].includes(String(activeDirectCall.phase || activeDirectCall.status || "")) &&
    String(activeDirectCall.peerUserId || "") === String(currentDirectFriend.id || "")
      ? directCallPanelProps
      : null;

  const currentConversationMemberIds = useMemo(
    () => new Set((currentConversationTarget?.members || []).map((member) => String(member?.id || ""))),
    [currentConversationTarget?.members]
  );
  const addableConversationFriends = useMemo(
    () => friends.filter((friend) => friend?.id && !currentConversationMemberIds.has(String(friend.id))),
    [currentConversationMemberIds, friends]
  );
  const filteredConversationFriends = useMemo(() => {
    const normalizedQuery = String(conversationFriendSearch || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return friends;
    }

    return friends.filter((friend) => {
      const displayName = String(getDisplayName(friend) || "").toLowerCase();
      const email = String(friend?.email || "").toLowerCase();
      return displayName.includes(normalizedQuery) || email.includes(normalizedQuery);
    });
  }, [conversationFriendSearch, friends, getDisplayName]);
  const filteredAddableConversationFriends = useMemo(() => {
    const normalizedQuery = String(addConversationMemberSearch || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return addableConversationFriends;
    }

    return addableConversationFriends.filter((friend) => {
      const displayName = String(getDisplayName(friend) || "").toLowerCase();
      const email = String(friend?.email || "").toLowerCase();
      return displayName.includes(normalizedQuery) || email.includes(normalizedQuery);
    });
  }, [addConversationMemberSearch, addableConversationFriends, getDisplayName]);
  const filteredConversationMembers = useMemo(() => {
    const normalizedQuery = String(conversationSettingsSearch || "").trim().toLowerCase();
    const members = Array.isArray(currentConversationTarget?.members) ? currentConversationTarget.members : [];
    if (!normalizedQuery) {
      return members;
    }

    return members.filter((member) => {
      const displayName = String(getDisplayName(member) || "").toLowerCase();
      const email = String(member?.email || "").toLowerCase();
      return displayName.includes(normalizedQuery) || email.includes(normalizedQuery);
    });
  }, [conversationSettingsSearch, currentConversationTarget?.members, getDisplayName]);
  const fallbackConversationRole = useMemo(() => {
    if (!currentConversationTarget) {
      return "member";
    }

    const currentUserId = String(user?.id || "");
    if (String(currentConversationTarget.ownerUserId || "") === currentUserId) {
      return "owner";
    }

    const matchedMember = (currentConversationTarget.members || []).find((member) => String(member?.id || "") === currentUserId);
    if (matchedMember?.role) {
      return String(matchedMember.role).toLowerCase();
    }

    return "member";
  }, [currentConversationTarget, user?.id]);
  const currentConversationRole = String(
    String(currentConversationTarget?.ownerUserId || "") === String(user?.id || "")
      ? "owner"
      : (currentConversationTarget?.currentUserRole || fallbackConversationRole || "member")
  ).toLowerCase();
  const assignableConversationRoles = useMemo(
    () => CONVERSATION_ROLE_OPTIONS.filter((option) => getConversationRolePriority(currentConversationRole) > getConversationRolePriority(option.id)),
    [currentConversationRole]
  );

  const derivedCanEditConversationInfo = currentConversationRole === "owner" || currentConversationRole === "admin";
  const derivedCanAddConversationMembers = derivedCanEditConversationInfo || currentConversationRole === "moderator" || currentConversationRole === "inviter";
  const derivedCanRemoveConversationMembers = derivedCanEditConversationInfo || currentConversationRole === "moderator";
  const derivedCanManageConversationRoles = derivedCanEditConversationInfo;
  const canAddConversationMembers = Boolean(currentConversationTarget?.canAddMembers ?? derivedCanAddConversationMembers);
  const canOpenConversationAddMembers = Boolean(canAddConversationMembers && addableConversationFriends.length);
  const canEditConversationInfo = Boolean(currentConversationTarget?.canEditInfo ?? derivedCanEditConversationInfo);
  const canManageConversationRoles = Boolean(currentConversationTarget?.canManageRoles ?? derivedCanManageConversationRoles);
  const canRemoveConversationMembers = Boolean(currentConversationTarget?.canRemoveMembers ?? derivedCanRemoveConversationMembers);
  const canLeaveConversation = Boolean(currentConversationTarget?.canLeave ?? currentConversationTarget);
  const canDeleteConversation = Boolean(currentConversationTarget?.canDeleteConversation ?? currentConversationRole === "owner");
  const currentConversationMentionMembers = useMemo(
    () => (currentConversationTarget?.members || [])
      .map((member) => {
        const userId = String(member?.userId || member?.id || "").trim();
        if (!userId) {
          return null;
        }

        const displayName = getDisplayName(member);
        return {
          ...member,
          id: userId,
          userId,
          name: displayName,
          displayName,
          avatar: member?.avatar || member?.avatarUrl || "",
        };
      })
      .filter(Boolean),
    [currentConversationTarget?.members, getDisplayName]
  );

  useEffect(() => () => {
    if (conversationAvatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(conversationAvatarPreview);
    }
  }, [conversationAvatarPreview]);

  useEffect(() => () => {
    if (conversationSettingsAvatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(conversationSettingsAvatarPreview);
    }
  }, [conversationSettingsAvatarPreview]);

  const resetConversationDraft = () => {
    setCreateConversationStep("");
    setConversationTitle("");
    setSelectedConversationFriendIds([]);
    setConversationFriendSearch("");
    setConversationAvatarFile(null);
    setConversationAvatarPreview((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return "";
    });
  };

  const resetConversationSettingsDraft = () => {
    setConversationSettingsTitle("");
    setConversationSettingsSearch("");
    setConversationSettingsAvatarFile(null);
    setConversationSettingsAvatarPreview((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return "";
    });
  };

  const openCreateConversationFlow = () => {
    onClearConversationStatus?.();
    resetConversationDraft();
    setCreateConversationStep("details");
  };

  const openConversationSettings = () => {
    if (!currentConversationTarget) {
      return;
    }

    onClearConversationStatus?.();
    setConversationSettingsTitle(String(currentConversationTarget.title || ""));
    setConversationSettingsSearch("");
    setConversationSettingsAvatarFile(null);
    setConversationSettingsAvatarPreview((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return String(currentConversationTarget.avatar || "");
    });
    setShowConversationSettings(true);
  };

  const closeConversationSettings = () => {
    onClearConversationStatus?.();
    setShowConversationSettings(false);
    setActiveConversationMemberActionId("");
    resetConversationSettingsDraft();
  };

  const handleConversationAvatarChange = (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    onClearConversationStatus?.();
    setConversationAvatarFile(nextFile);
    setConversationAvatarPreview((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(nextFile);
    });
  };

  const handleConversationSettingsAvatarChange = (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    onClearConversationStatus?.();
    setConversationSettingsAvatarFile(nextFile);
    setConversationSettingsAvatarPreview((previous) => {
      if (previous?.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(nextFile);
    });
  };

  const toggleConversationFriendSelection = (friendId) => {
    const normalizedFriendId = String(friendId || "");
    if (!normalizedFriendId) {
      return;
    }

    onClearConversationStatus?.();
    setSelectedConversationFriendIds((previous) => (
      previous.includes(normalizedFriendId)
        ? previous.filter((item) => item !== normalizedFriendId)
        : [...previous, normalizedFriendId]
    ));
  };

  const handleCreateConversationSubmit = async (event) => {
    event.preventDefault();
    try {
      let uploadedAvatarUrl = "";
      if (conversationAvatarFile) {
        uploadedAvatarUrl = await onUploadConversationAvatar?.(conversationAvatarFile) || "";
      }

      const createdConversation = await onCreateConversation?.({
        title: conversationTitle,
        avatarUrl: uploadedAvatarUrl,
        memberUserIds: selectedConversationFriendIds,
      });
      resetConversationDraft();
      if (createdConversation?.conversationId || createdConversation?.id) {
        onOpenConversationChat?.(createdConversation.conversationId || createdConversation.id);
      }
    } catch {
      // handled in state
    }
  };

  const handleAddConversationMemberSubmit = async (event) => {
    event.preventDefault();
    if (!currentConversationTarget?.conversationId && !currentConversationTarget?.id) {
      return;
    }

    try {
      await onAddConversationMember?.(
        currentConversationTarget.conversationId || currentConversationTarget.id,
        pendingConversationMemberId
      );
      setPendingConversationMemberId("");
      setAddConversationMemberSearch("");
      setShowAddConversationMemberForm(false);
    } catch {
      // handled in state
    }
  };

  const handleConversationSettingsSubmit = async (event) => {
    event.preventDefault();
    if (!currentConversationTarget?.conversationId && !currentConversationTarget?.id) {
      return;
    }

    try {
      let uploadedAvatarUrl = undefined;
      if (conversationSettingsAvatarFile) {
        uploadedAvatarUrl = await onUploadConversationAvatar?.(conversationSettingsAvatarFile) || "";
      } else if (!conversationSettingsAvatarPreview) {
        uploadedAvatarUrl = "";
      }

      await onUpdateConversation?.(currentConversationTarget.conversationId || currentConversationTarget.id, {
        title: conversationSettingsTitle,
        avatarUrl: uploadedAvatarUrl,
      });
      setShowConversationSettings(false);
      resetConversationSettingsDraft();
    } catch {
      // handled in state
    }
  };

  const handleProceedToConversationMembers = () => {
    if (!String(conversationTitle || "").trim()) {
      return;
    }

    onClearConversationStatus?.();
    setCreateConversationStep("members");
  };

  const handleCloseConversationFlow = () => {
    onClearConversationStatus?.();
    resetConversationDraft();
  };

  const handleBackToConversationDetails = () => {
    onClearConversationStatus?.();
    setCreateConversationStep("details");
  };

  const handleSelectPendingConversationMember = (friendId) => {
    onClearConversationStatus?.();
    setPendingConversationMemberId(String(friendId || ""));
  };

  const handleConversationMemberRoleChange = async (member, nextRole) => {
    if (!currentConversationTarget?.conversationId && !currentConversationTarget?.id) {
      return;
    }

    try {
      await onUpdateConversationMemberRole?.(
        currentConversationTarget.conversationId || currentConversationTarget.id,
        member.id,
        nextRole
      );
      closeConversationMemberActions();
    } catch {
      // handled in state
    }
  };

  const handleConversationMemberRemove = async (member) => {
    if (!currentConversationTarget?.conversationId && !currentConversationTarget?.id) {
      return;
    }

    try {
      await onRemoveConversationMember?.(
        currentConversationTarget.conversationId || currentConversationTarget.id,
        member.id
      );
      closeConversationMemberActions();
    } catch {
      // handled in state
    }
  };

  const handleLeaveConversation = async () => {
    if (!currentConversationTarget?.conversationId && !currentConversationTarget?.id) {
      return;
    }

    try {
      await onLeaveConversation?.(currentConversationTarget.conversationId || currentConversationTarget.id);
      setShowConversationSettings(false);
      resetConversationSettingsDraft();
    } catch {
      // handled in state
    }
  };

  const handleDeleteCurrentConversation = async () => {
    if (!currentConversationTarget?.conversationId && !currentConversationTarget?.id) {
      return;
    }

    try {
      await onDeleteConversation?.(currentConversationTarget.conversationId || currentConversationTarget.id);
      setShowConversationSettings(false);
      resetConversationSettingsDraft();
    } catch {
      // handled in state
    }
  };

  useEffect(() => {
    if (!currentConversationTarget) {
      const timeoutId = window.setTimeout(() => {
        setShowAddConversationMemberForm(false);
        setShowConversationSettings(false);
        setActiveConversationMemberActionId("");
        setAddConversationMemberSearch("");
        setPendingConversationMemberId("");
        resetConversationSettingsDraft();
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [currentConversationTarget]);

  useEffect(() => {
    if (!showConversationSettings) {
      const timeoutId = window.setTimeout(() => {
        setActiveConversationMemberActionId("");
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [showConversationSettings]);

  useEffect(() => {
    if (!showConversationSettings || !currentConversationTarget) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setConversationSettingsTitle(String(currentConversationTarget.title || ""));
      setConversationSettingsAvatarPreview((previous) => {
        if (previous?.startsWith("blob:")) {
          return previous;
        }
        return String(currentConversationTarget.avatar || "");
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    showConversationSettings,
    currentConversationTarget?.conversationId,
    currentConversationTarget?.title,
    currentConversationTarget?.avatar,
  ]);

  const toggleConversationMemberActions = (memberId) => {
    const normalizedMemberId = String(memberId || "");
    setActiveConversationMemberActionId((current) => (current === normalizedMemberId ? "" : normalizedMemberId));
  };

  const closeConversationMemberActions = () => {
    setActiveConversationMemberActionId("");
  };

  const canManageConversationMember = (member) => {
    if (!member || String(member?.id || "") === String(user?.id || "")) {
      return false;
    }

    return getConversationRolePriority(currentConversationRole) > getConversationRolePriority(getConversationMemberRole(member, currentConversationTarget?.ownerUserId));
  };

  return (
    <main className="chat__wrapper chat__wrapper--friends">
      <div className="friends-layout">
        <section className="friends-main">
        <div className="friends-main__toolbar">
          <div className="friends-main__tabs">
            <button
              type="button"
              className={`friends-main__tab ${friendsPageSection === "friends" && !currentDirectFriend && !activeConversationId ? "friends-main__tab--active" : ""}`}
              onClick={() => {
                onResetDirect();
                onSetFriendsSection("friends");
              }}
            >
              Друзья
            </button>
            <button
              type="button"
              className={`friends-main__tab ${friendsPageSection === "add" && !currentDirectFriend && !activeConversationId ? "friends-main__tab--accent" : ""}`}
              onClick={() => {
                onResetDirect();
                onSetFriendsSection("add");
              }}
            >
              <span>Добавить в друзья</span>
              {incomingFriendRequestCount > 0 ? <span className="friends-main__tab-badge">{Math.min(incomingFriendRequestCount, 99)}</span> : null}
            </button>
            <button
              type="button"
              className={`friends-main__tab ${friendsPageSection === "conversations" && !currentDirectFriend && !currentConversationTarget ? "friends-main__tab--active" : ""}`}
              onClick={() => {
                onResetDirect();
                onSetFriendsSection("conversations");
              }}
            >
              Беседы
            </button>
          </div>
        </div>

        {currentDirectFriend || currentConversationTarget ? (
          <div className={`friends-main__chat ${activeDirectCallPanelProps ? "friends-main__chat--with-call" : ""}`}>
            <div className="chat__topbar friends-direct-chat-topbar">
              <div className="chat__topbar-title friends-direct-chat-topbar__title">
                <div className="chat__topbar-copy">
                  <strong className={currentDirectFriend && isUserCurrentlyOnline(currentDirectFriend) ? "chat__topbar-copy-name--online" : ""}>
                    {currentConversationTarget ? currentConversationTarget.title : getDisplayName(currentDirectFriend)}
                  </strong>
                  <span>
                    {currentConversationTarget
                      ? `${Number(currentConversationTarget.memberCount || currentConversationTarget.members?.length || 0)} участников`
                      : formatUserPresenceStatus(currentDirectFriend)}
                  </span>
                </div>
              </div>

              <div className="chat__topbar-actions friends-direct-chat-topbar__actions">
                <label className="chat__topbar-search-wrap friends-direct-chat-topbar__search">
                  <img src={searchIcon} alt="" />
                  <input
                    className="chat__topbar-search"
                    type="text"
                    value={directSearchQuery}
                    onChange={(event) => onDirectSearchQueryChange(event.target.value)}
                    placeholder="Поиск по сообщениям и файлам"
                  />
                </label>

                {canOpenConversationAddMembers ? (
                  <button
                    type="button"
                    className="chat__topbar-icon"
                    onClick={() => {
                      onClearConversationStatus?.();
                      setPendingConversationMemberId("");
                      setAddConversationMemberSearch("");
                      setShowAddConversationMemberForm(true);
                    }}
                    aria-label="Добавить участника"
                    title="Добавить участника"
                  >
                    <span className="friends-direct-chat-topbar__glyph" aria-hidden="true">+</span>
                  </button>
                ) : null}

                {currentConversationTarget ? (
                  <button
                    type="button"
                    className="chat__topbar-icon"
                    onClick={openConversationSettings}
                    aria-label="Настройки беседы"
                    title="Настройки беседы"
                  >
                    <span className="friends-direct-chat-topbar__glyph friends-direct-chat-topbar__glyph--dots" aria-hidden="true">⋯</span>
                  </button>
                ) : null}

                {!currentConversationTarget ? (
                  <button
                    type="button"
                    className="chat__topbar-icon"
                    onClick={() => onStartDirectCall?.(currentDirectFriend.id)}
                    aria-label="Позвонить"
                    title="Позвонить"
                  >
                    {phoneIcon ? <img src={phoneIcon} alt="" /> : <span className="friends-direct-chat-topbar__glyph" aria-hidden="true">📞</span>}
                  </button>
                ) : null}

                {!currentConversationTarget ? (
                  <button
                    type="button"
                    className="chat__topbar-icon"
                    onClick={(event) => onOpenDirectActions?.(event, currentDirectFriend)}
                    aria-label="Ещё"
                    title="Ещё"
                  >
                    <span className="friends-direct-chat-topbar__glyph friends-direct-chat-topbar__glyph--dots" aria-hidden="true">⋮</span>
                  </button>
                ) : null}
              </div>
            </div>

            {activeDirectCallPanelProps ? (
              <div className="friends-main__call-stage">
                <DirectCallOverlayView {...activeDirectCallPanelProps} embedded />
              </div>
            ) : null}

            <TextChat
              resolvedChannelId={currentConversationTarget ? currentConversationChannelId : currentDirectChannelId}
              localMessageStateVersion={textChatLocalStateVersion}
              user={user}
              searchQuery={directSearchQuery}
              onClearSearchQuery={onClearDirectSearchQuery}
              directTargets={directConversationTargets}
              serverMembers={currentConversationTarget ? currentConversationMentionMembers : []}
              onOpenDirectChat={onOpenDirectChat}
              onStartDirectCall={onStartDirectCall}
            />
          </div>
        ) : friendsPageSection === "friends" ? (
          <div className="friends-main__content">
            <div className="friends-hero">
              <h1>Все друзья</h1>
              <p>Здесь находятся все уже добавленные друзья. Отсюда можно сразу открыть личный чат.</p>
              {friends.length ? (
                <div className="friends-results">
                  {friends.map((friend) => (
                    <div key={friend.id} className="friends-results__item">
                      <div className="friends-results__identity">
                        <AnimatedAvatar className="friends-results__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="eager" decoding="sync" />
                        <div className="friends-results__meta">
                          <strong>{getDisplayName(friend)}</strong>
                          <span>{friend.email || "Без email"}</span>
                        </div>
                      </div>
                      <button type="button" className="friends-results__action" onClick={() => onOpenDirectChat(friend.id)}>
                        Открыть чат
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="friends-panel__empty">У вас пока нет друзей. Перейдите во вкладку добавления и найдите пользователя.</div>
              )}
            </div>
          </div>
        ) : friendsPageSection === "conversations" ? (
          <div className="friends-main__content">
            <div className="friends-hero">
              <div className="friends-hero__header">
                <div className="friends-hero__header-copy">
                  <h1>Беседы</h1>
                  <p>Здесь находятся групповые чаты, куда можно добавлять друзей и общаться в отдельном канале.</p>
                </div>
                <button
                  type="button"
                  className="friends-create-button"
                  onClick={openCreateConversationFlow}
                >
                  Создать беседу
                </button>
              </div>
              {conversationsError ? <div className="friends-panel__error">{conversationsError}</div> : null}
              {conversationsLoading ? <div className="friends-panel__empty">Загружаем беседы...</div> : null}
              {!conversationsLoading && conversations.length ? (
                <div className="friends-results">
                  {conversations.map((conversation) => (
                    <div key={conversation.conversationId || conversation.id} className="friends-results__item">
                      <div className="friends-results__identity">
                        <AnimatedAvatar
                          className="friends-results__avatar"
                          src={conversation.avatar || ""}
                          alt={conversation.title || "Беседа"}
                          loading="eager"
                          decoding="sync"
                        />
                        <div className="friends-results__meta">
                          <strong>{conversation.title || "Новая беседа"}</strong>
                          <span>{`${Number(conversation.memberCount || conversation.members?.length || 0)} участников`}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="friends-results__action"
                        onClick={() => onOpenConversationChat(conversation.conversationId || conversation.id)}
                      >
                        Открыть чат
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {!conversationsLoading && !conversationsError && !conversations.length ? (
                <div className="friends-panel__empty">Пока нет ни одной беседы.</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="friends-main__content">
            <div className="friends-hero">
              <h1>Добавить в друзья</h1>
              <p>Введите имя для поиска по имени. Если в запросе есть символ `@`, поиск автоматически переключится на email.</p>
              {friendRequestsLoading || friendRequestsError || incomingFriendRequests.length ? (
                <div className="friends-requests">
                  <div className="friends-requests__header">
                    <h2>Входящие заявки</h2>
                    {incomingFriendRequestCount > 0 ? <span className="friends-main__tab-badge">{Math.min(incomingFriendRequestCount, 99)}</span> : null}
                  </div>
                  {friendRequestsError ? <div className="friends-panel__error">{friendRequestsError}</div> : null}
                  {friendRequestsLoading ? <div className="friends-panel__empty">Загружаем заявки...</div> : null}
                  {!friendRequestsLoading && !friendRequestsError && incomingFriendRequests.length ? (
                    <div className="friends-results friends-results--requests">
                      {incomingFriendRequests.map((request) => (
                        <div key={request.id} className="friends-results__item friends-results__item--request">
                          <div className="friends-results__identity">
                            <AnimatedAvatar className="friends-results__avatar" src={request.sender.avatar || ""} alt={getDisplayName(request.sender)} loading="eager" decoding="sync" />
                            <div className="friends-results__meta">
                              <strong>{getDisplayName(request.sender)}</strong>
                              <span>{request.sender.email || "Без email"}</span>
                            </div>
                          </div>
                          <div className="friends-results__actions">
                            <button type="button" className="friends-results__action friends-results__action--accept" disabled={friendRequestActionId === request.id} onClick={() => onFriendRequestAction(request.id, "accept")}>
                              {friendRequestActionId === request.id ? "..." : "✓"}
                            </button>
                            <button type="button" className="friends-results__action friends-results__action--decline" aria-label="Отклонить заявку" disabled={friendRequestActionId === request.id} onClick={() => onFriendRequestAction(request.id, "decline")}>
                              {friendRequestActionId === request.id ? "..." : (
                                <svg className="friends-results__action-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                  <path d="M4 4l8 8M12 4l-8 8" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <form className="friends-hero__form" onSubmit={onFriendSearchSubmit}>
                <input
                  type="text"
                  placeholder={friendQueryMode === "email" ? "friend@example.com" : "Введите имя пользователя"}
                  value={friendEmail}
                  onChange={(event) => onFriendSearchChange(event.target.value)}
                />
                <button type="submit" disabled={friendLookupLoading}>
                  {friendLookupLoading ? "Ищем..." : "Найти"}
                </button>
              </form>
              {friendsError ? <div className="friends-panel__error">{friendsError}</div> : null}
              <div className="friends-results">
                {friendLookupResults.map((friend) => (
                  <div key={friend.id} className="friends-results__item">
                    <div className="friends-results__identity">
                      <AnimatedAvatar className="friends-results__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="eager" decoding="sync" />
                      <div className="friends-results__meta">
                        <strong>{getDisplayName(friend)}</strong>
                        <span>{friend.email || "Без email"}</span>
                      </div>
                    </div>
                    <button type="button" className="friends-results__action" disabled={isAddingFriend} onClick={() => onAddFriend(friend)}>
                      {isAddingFriend ? "Отправляем..." : "Добавить"}
                    </button>
                  </div>
                ))}
                {friendLookupPerformed && !friendLookupLoading && !friendLookupResults.length ? (
                  <div className="friends-panel__empty">
                    {friendQueryMode === "email"
                      ? "Никого не нашли. Проверьте email и попробуйте ещё раз."
                      : "Никого не нашли. Попробуйте другую букву, имя или фамилию."}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="friends-discovery friends-discovery--server-code">
              <h2>Вступить по коду сервера</h2>
              <p>Если друг прислал код сервера, вставьте его сюда. Новые коды длинные и криптостойкие, их нельзя просто подобрать.</p>
              <ServerInvitesPanel
                activeServer={null}
                user={user}
                canInvite={false}
                showCreate={false}
                showJoin
                title="Код сервера"
                helperText="Введите код сервера целиком, и сервер появится у вас в списке сразу после подтверждения."
                onImportServer={onImportServer}
                onServerShared={onServerShared}
              />
            </div>

            <div className="friends-discovery">
              <h2>Где ещё можно завести друзей</h2>
              <p>Если пока не с кем переписываться, можно открыть свои серверы или пригласить туда новых людей.</p>
              <button type="button" className="friends-discovery__card" onClick={onOpenServersWorkspace}>
                <span className="friends-discovery__icon">✦</span>
                <span>Исследуйте доступные серверы</span>
                <span className="friends-discovery__arrow">›</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {createConversationStep ? (
        <div className="friends-modal-layer" role="presentation" onClick={handleCloseConversationFlow}>
          <div
            className={`friends-modal friends-modal--${createConversationStep === "members" ? "members" : "details"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={createConversationStep === "members" ? "conversation-members-title" : "conversation-details-title"}
            onClick={(event) => event.stopPropagation()}
          >
            {createConversationStep === "details" ? (
              <>
                <div className="friends-modal__header">
                  <h3 id="conversation-details-title">Создать беседу</h3>
                  <p>Сначала задайте название и, если нужно, сразу поставьте аватар беседы.</p>
                </div>

                <div className="friends-modal__body friends-modal__body--details">
                  <button
                    type="button"
                    className="friends-conversation-avatar-picker"
                    onClick={() => conversationAvatarInputRef.current?.click()}
                    aria-label="Выбрать аватар беседы"
                  >
                    {conversationAvatarPreview ? (
                      <img src={conversationAvatarPreview} alt="" loading="eager" decoding="sync" />
                    ) : (
                      <span className="friends-conversation-avatar-picker__glyph" aria-hidden="true">📷</span>
                    )}
                  </button>

                  <div className="friends-conversation-details">
                    <label className="friends-conversation-field">
                      <span>Название беседы</span>
                      <input
                        type="text"
                        value={conversationTitle}
                        onChange={(event) => {
                          onClearConversationStatus?.();
                          setConversationTitle(event.target.value);
                        }}
                        placeholder="Например, Основной чат"
                        maxLength={80}
                        autoFocus
                        disabled={conversationActionLoading}
                      />
                    </label>
                    <p className="friends-conversation-hint">Аватар можно пропустить и поменять позже.</p>
                  </div>
                </div>

                <input
                  ref={conversationAvatarInputRef}
                  type="file"
                  accept="image/*"
                  className="friends-conversation-hidden-input"
                  onChange={handleConversationAvatarChange}
                />
                {conversationsError ? <div className="friends-panel__error">{conversationsError}</div> : null}

                <div className="friends-modal__actions">
                  <button type="button" className="friends-modal__action friends-modal__action--ghost" onClick={handleCloseConversationFlow}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="friends-modal__action"
                    onClick={handleProceedToConversationMembers}
                    disabled={!String(conversationTitle || "").trim()}
                  >
                    Далее
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleCreateConversationSubmit}>
                <div className="friends-modal__header friends-modal__header--split">
                  <div>
                    <h3 id="conversation-members-title">Добавить участников</h3>
                    <p>Выберите друзей, которых нужно сразу пригласить в беседу.</p>
                  </div>
                  <span className="friends-modal__counter">
                    {selectedConversationFriendIds.length} выбрано
                  </span>
                </div>

                <div className="friends-modal__search">
                  <input
                    type="text"
                    value={conversationFriendSearch}
                    onChange={(event) => setConversationFriendSearch(event.target.value)}
                    placeholder="Поиск друзей"
                    autoFocus
                  />
                </div>

                <div className="friends-modal__list">
                  {filteredConversationFriends.length ? filteredConversationFriends.map((friend) => {
                    const isSelected = selectedConversationFriendIds.includes(String(friend.id || ""));

                    return (
                      <button
                        key={friend.id}
                        type="button"
                        className={`friends-member-picker__row ${isSelected ? "friends-member-picker__row--selected" : ""}`}
                        onClick={() => toggleConversationFriendSelection(friend.id)}
                      >
                        <div className="friends-member-picker__identity">
                          <AnimatedAvatar className="friends-member-picker__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="eager" decoding="sync" />
                          <div className="friends-member-picker__meta">
                            <strong>{getDisplayName(friend)}</strong>
                            <span>{formatUserPresenceStatus(friend)}</span>
                          </div>
                        </div>
                        <span className={`friends-member-picker__check ${isSelected ? "friends-member-picker__check--selected" : ""}`} aria-hidden="true">
                          {isSelected ? "✓" : ""}
                        </span>
                      </button>
                    );
                  }) : (
                    <div className="friends-panel__empty">Под подходящий запрос друзей не нашлось.</div>
                  )}
                </div>
                {conversationsError ? <div className="friends-panel__error">{conversationsError}</div> : null}

                <div className="friends-modal__actions">
                  <button type="button" className="friends-modal__action friends-modal__action--ghost" onClick={handleBackToConversationDetails}>
                    Назад
                  </button>
                  <button
                    type="submit"
                    className="friends-modal__action"
                    disabled={conversationActionLoading || !selectedConversationFriendIds.length || !String(conversationTitle || "").trim()}
                  >
                    {conversationActionLoading ? "Создаём..." : "Создать"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {showConversationSettings && currentConversationTarget ? (
        <div className="friends-modal-layer" role="presentation" onClick={closeConversationSettings}>
          <form
            className="friends-modal friends-modal--conversation-settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-settings-title"
            onSubmit={handleConversationSettingsSubmit}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="friends-modal__header friends-modal__header--compact">
              <h3 id="conversation-settings-title">Настройки беседы</h3>
            </div>

            <div className="friends-conversation-settings-card">
              <button
                type="button"
                className="friends-conversation-avatar-picker friends-conversation-avatar-picker--compact"
                onClick={() => canEditConversationInfo && conversationSettingsAvatarInputRef.current?.click()}
                aria-label="Изменить фото беседы"
                disabled={!canEditConversationInfo}
              >
                {conversationSettingsAvatarPreview ? (
                  <img src={conversationSettingsAvatarPreview} alt="" loading="eager" decoding="sync" />
                ) : (
                  <span className="friends-conversation-avatar-picker__glyph" aria-hidden="true">+</span>
                )}
              </button>

              <div className="friends-conversation-settings-card__body">
                <label className="friends-conversation-field friends-conversation-field--compact">
                  <span>Название</span>
                  <input
                    type="text"
                    value={conversationSettingsTitle}
                    onChange={(event) => {
                      onClearConversationStatus?.();
                      setConversationSettingsTitle(event.target.value);
                    }}
                    placeholder="Название беседы"
                    disabled={!canEditConversationInfo || conversationActionLoading}
                  />
                </label>

                <div className="friends-conversation-settings-card__meta">
                  <span>{`Вы: ${getConversationRoleLabel(currentConversationRole)}`}</span>
                </div>
              </div>

              <button
                type="submit"
                className="friends-modal__action friends-modal__action--compact friends-conversation-settings-save"
                disabled={!canEditConversationInfo || conversationActionLoading || !String(conversationSettingsTitle || "").trim()}
              >
                {conversationActionLoading ? "..." : "Сохранить"}
              </button>
            </div>

            <input
              ref={conversationSettingsAvatarInputRef}
              type="file"
              accept="image/*"
              className="friends-conversation-hidden-input"
              onChange={handleConversationSettingsAvatarChange}
            />

            <div className="friends-conversation-settings-toolbar">
              <div className="friends-modal__search friends-modal__search--compact">
                <input
                  type="text"
                  value={conversationSettingsSearch}
                  onChange={(event) => setConversationSettingsSearch(event.target.value)}
                  placeholder="Поиск участников"
                />
              </div>

              {canOpenConversationAddMembers ? (
                <button
                  type="button"
                  className="friends-modal__action friends-modal__action--ghost friends-modal__action--compact"
                  onClick={() => {
                    closeConversationSettings();
                    onClearConversationStatus?.();
                    setPendingConversationMemberId("");
                    setAddConversationMemberSearch("");
                    setShowAddConversationMemberForm(true);
                  }}
                >
                  Добавить
                </button>
              ) : null}
            </div>

            <div className="friends-modal__list friends-modal__list--settings">
              {filteredConversationMembers.map((member) => {
                const canManageMember = canManageConversationMember(member);
                const memberRole = getConversationMemberRole(member, currentConversationTarget.ownerUserId);
                const canOpenMemberActions = (canManageConversationRoles || canRemoveConversationMembers) && canManageMember;
                const isMemberActionsOpen = activeConversationMemberActionId === String(member.id || "");

                return (
                  <div key={member.id} className="friends-member-picker__row friends-member-picker__row--settings">
                    <div className="friends-member-picker__identity">
                      <AnimatedAvatar className="friends-member-picker__avatar" src={member.avatar || ""} alt={getDisplayName(member)} loading="eager" decoding="sync" />
                      <div className="friends-member-picker__meta">
                        <strong>{getDisplayName(member)}</strong>
                        <span>{formatUserPresenceStatus(member)}</span>
                      </div>
                    </div>

                    <div className="friends-conversation-member-controls">
                      <span className="friends-conversation-role-badge">
                        {getConversationRoleLabel(memberRole)}
                      </span>

                      {canOpenMemberActions ? (
                        <div className="friends-conversation-member-menu">
                          <button
                            type="button"
                            className="friends-conversation-member-menu__toggle"
                            onClick={() => toggleConversationMemberActions(member.id)}
                            disabled={conversationActionLoading}
                            aria-label="Действия с участником"
                          >
                            ⋯
                          </button>

                          {isMemberActionsOpen ? (
                            <div className="friends-conversation-member-menu__panel">
                              {canManageConversationRoles ? assignableConversationRoles.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={`friends-conversation-member-menu__item ${memberRole === option.id ? "friends-conversation-member-menu__item--active" : ""}`}
                                  onClick={() => handleConversationMemberRoleChange(member, option.id)}
                                  disabled={conversationActionLoading || memberRole === option.id}
                                >
                                  {option.label}
                                </button>
                              )) : null}
                              {canRemoveConversationMembers ? (
                                <button
                                  type="button"
                                  className="friends-conversation-member-menu__item friends-conversation-member-menu__item--danger"
                                  onClick={() => handleConversationMemberRemove(member)}
                                  disabled={conversationActionLoading}
                                >
                                  Выгнать из беседы
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!filteredConversationMembers.length ? (
                <div className="friends-panel__empty">Под поиск никого не нашли.</div>
              ) : null}
            </div>

            {conversationsError ? <div className="friends-panel__error">{conversationsError}</div> : null}

            <div className="friends-conversation-settings-actions">
              <button
                type="button"
                className="friends-modal__action friends-modal__action--ghost friends-modal__action--compact"
                onClick={closeConversationSettings}
              >
                Закрыть
              </button>
              {canLeaveConversation ? (
                <button
                  type="button"
                  className="friends-modal__action friends-modal__action--ghost friends-modal__action--compact"
                  onClick={handleLeaveConversation}
                  disabled={conversationActionLoading}
                >
                  Покинуть
                </button>
              ) : null}
              {canDeleteConversation ? (
                <button
                  type="button"
                  className="friends-conversation-danger-button"
                  onClick={handleDeleteCurrentConversation}
                  disabled={conversationActionLoading}
                >
                  Удалить беседу
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      {showAddConversationMemberForm && canAddConversationMembers ? (
        <div className="friends-modal-layer" role="presentation" onClick={() => setShowAddConversationMemberForm(false)}>
          <form
            className="friends-modal friends-modal--members"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-add-members-title"
            onSubmit={handleAddConversationMemberSubmit}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="friends-modal__header friends-modal__header--split">
              <div>
                <h3 id="conversation-add-members-title">Добавить участников</h3>
                <p>Пригласите друзей в уже созданную беседу.</p>
              </div>
              <span className="friends-modal__counter">
                {addableConversationFriends.length} доступно
              </span>
            </div>

            <div className="friends-modal__search">
              <input
                type="text"
                value={addConversationMemberSearch}
                onChange={(event) => setAddConversationMemberSearch(event.target.value)}
                placeholder="Поиск друзей"
                autoFocus
              />
            </div>

            <div className="friends-modal__list">
              {filteredAddableConversationFriends.length ? filteredAddableConversationFriends.map((friend) => {
                const friendId = String(friend.id || "");
                const isSelected = pendingConversationMemberId === friendId;

                return (
                  <button
                    key={friend.id}
                    type="button"
                    className={`friends-member-picker__row ${isSelected ? "friends-member-picker__row--selected" : ""}`}
                    onClick={() => handleSelectPendingConversationMember(friend.id)}
                  >
                    <div className="friends-member-picker__identity">
                      <AnimatedAvatar className="friends-member-picker__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="eager" decoding="sync" />
                      <div className="friends-member-picker__meta">
                        <strong>{getDisplayName(friend)}</strong>
                        <span>{formatUserPresenceStatus(friend)}</span>
                      </div>
                    </div>
                    <span className={`friends-member-picker__check ${isSelected ? "friends-member-picker__check--selected" : ""}`} aria-hidden="true">
                      {isSelected ? "✓" : ""}
                    </span>
                  </button>
                );
              }) : (
                <div className="friends-panel__empty">Свободных друзей для добавления не осталось.</div>
              )}
            </div>
            {conversationsError ? <div className="friends-panel__error">{conversationsError}</div> : null}

            <div className="friends-modal__actions">
              <button
                type="button"
                className="friends-modal__action friends-modal__action--ghost"
                onClick={() => setShowAddConversationMemberForm(false)}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="friends-modal__action"
                disabled={conversationActionLoading || !pendingConversationMemberId}
              >
                {conversationActionLoading ? "Добавляем..." : "Добавить"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <aside className="friends-contacts">
        <h3>Активные контакты</h3>
        {activeContacts.length ? (
          <div className="friends-contacts__list">
            {activeContacts.map((friend) => (
              <button key={friend.id} type="button" className="friends-contacts__item" onClick={() => onOpenDirectChat(friend.id)}>
                <AnimatedAvatar className="friends-contacts__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="eager" decoding="sync" />
                <span>{getDisplayName(friend)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="friends-contacts__empty">
            <strong>Пока что тут тихо...</strong>
            <span>Когда друзья зайдут в голосовой чат или начнут активничать, они появятся здесь.</span>
          </div>
        )}
      </aside>
    </div>
    </main>
  );
};

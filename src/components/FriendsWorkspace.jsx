import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import { DirectCallOverlayView } from "./MenuMainOverlays";
import ScreenShareViewer from "./ScreenShareViewer";
import TextChat from "./TextChat";
import useMobileLongPress from "../hooks/useMobileLongPress";
import { buildDirectMessageChannelId } from "../utils/directMessageChannels";
import { formatIntegrationActivityStatus } from "../utils/integrations";
import { formatUserPresenceStatus, isUserCurrentlyOnline } from "../utils/menuMainModel";
import {
  PROFILE_STORE_CATEGORIES,
  PROFILE_STORE_FEATURED_ITEMS,
  PROFILE_STORE_ITEMS,
  PROFILE_STORE_TYPES,
  applyProfileStoreItem,
  getProfileStoreItemById,
} from "../utils/profileCustomization";

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
    case "store":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5.25 10.25V19C5.25 20.1 6.15 21 7.25 21H16.75C17.85 21 18.75 20.1 18.75 19V10.25" />
          <path d="M4.25 10.25H19.75L18.65 5.8C18.43 4.91 17.63 4.28 16.71 4.28H7.29C6.37 4.28 5.57 4.91 5.35 5.8L4.25 10.25Z" />
          <path d="M8 10.25C8 11.35 8.9 12.25 10 12.25C11.1 12.25 12 11.35 12 10.25" />
          <path d="M12 10.25C12 11.35 12.9 12.25 14 12.25C15.1 12.25 16 11.35 16 10.25" />
          <path d="M9.25 21V16.75C9.25 16.34 9.59 16 10 16H14C14.41 16 14.75 16.34 14.75 16.75V21" />
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

function FriendsActionIcon({ kind }) {
  switch (kind) {
    case "chat":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6.5 18.5L4 20V6.75C4 5.78 4.78 5 5.75 5H18.25C19.22 5 20 5.78 20 6.75V16.25C20 17.22 19.22 18 18.25 18H8.1L6.5 18.5Z" />
          <path d="M8 9H16" />
          <path d="M8 13H13.5" />
        </svg>
      );
    case "call":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7.1 5.4L9.2 7.5C9.65 7.95 9.78 8.63 9.53 9.21L8.78 10.96C9.72 12.84 11.16 14.28 13.04 15.22L14.79 14.47C15.37 14.22 16.05 14.35 16.5 14.8L18.6 16.9C19.12 17.42 19.13 18.25 18.63 18.78C18.03 19.42 17.19 19.78 16.31 19.75C9.68 19.5 4.5 14.32 4.25 7.69C4.22 6.81 4.58 5.97 5.22 5.37C5.75 4.87 6.58 4.88 7.1 5.4Z" />
        </svg>
      );
    case "more":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 7.25H12.01" />
          <path d="M12 12H12.01" />
          <path d="M12 16.75H12.01" />
        </svg>
      );
    case "future":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.75L13.35 8.35L18 9.75L13.35 11.15L12 15.75L10.65 11.15L6 9.75L10.65 8.35L12 3.75Z" />
          <path d="M17.5 14.5L18.25 17L20.75 17.75L18.25 18.5L17.5 21L16.75 18.5L14.25 17.75L16.75 17L17.5 14.5Z" />
        </svg>
      );
    default:
      return null;
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
  filteredFriends,
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

          <button
            type="button"
            className={`friends-nav__item ${friendsPageSection === "store" && !activeDirectFriendId && !activeConversationId ? "friends-nav__item--active" : ""}`}
            onClick={() => {
              onOpenFriendsWorkspace();
              onResetDirect();
              onSetFriendsSection("store");
            }}
          >
            <span className="friends-nav__icon"><FriendsNavIcon kind="store" /></span>
            <span>Магазин</span>
          </button>
        </div>
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
              const activityStatus = formatIntegrationActivityStatus(friend.activity || friend.externalActivity);

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
                  <AnimatedAvatar className="friends-directs__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="lazy" decoding="async" />
                  <span className="friends-directs__meta">
                    <span className={`friends-directs__name ${isUserCurrentlyOnline(friend) ? "friends-directs__name--online" : ""}`}>{getDisplayName(friend)}</span>
                    {hasDraft ? <span className="friends-directs__draft">Черновик</span> : null}
                    {!hasDraft && activityStatus ? <span className="friends-directs__status">{activityStatus}</span> : null}
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

      {profilePanel}
      {overlayContent}
    </aside>
  );
};

const StoreProductArtwork = ({ item, size = "card" }) => (
  <div className={`profile-store-art profile-store-art--${item.accent} profile-store-art--${size}`} aria-hidden="true">
    <span className="profile-store-art__card" />
    <span className="profile-store-art__avatar" />
    <span className="profile-store-art__bar" />
    <span className="profile-store-art__spark profile-store-art__spark--one" />
    <span className="profile-store-art__spark profile-store-art__spark--two" />
  </div>
);

const StoreProfilePreview = ({ item, avatarSrc, displayName }) => (
  <div className={`profile-store-demo profile-store-demo--${item.accent}`}>
    <div className="profile-store-demo__cover" />
    <div className="profile-store-demo__body">
      <span className="profile-store-demo__avatar-ring">
        <AnimatedAvatar className="profile-store-demo__avatar" src={avatarSrc} alt={displayName} loading="eager" decoding="sync" />
      </span>
      <div className="profile-store-demo__copy">
        <strong>{displayName}</strong>
        <span>{item.title}</span>
      </div>
      <div className="profile-store-demo__input">
        <span>Сообщение для @{displayName}</span>
        <i />
      </div>
    </div>
  </div>
);

const StoreProductModal = ({ item, appliedItemId, avatarSrc, displayName, onApply, onClose }) => {
  if (!item) {
    return null;
  }

  const isApplied = appliedItemId === item.id;

  return (
    <div className="profile-store-modal" role="dialog" aria-modal="true" aria-label={`Просмотр ${item.title}`}>
      <div className="profile-store-modal__backdrop" onClick={onClose} />
      <div className="profile-store-modal__dialog">
        <aside className="profile-store-modal__info">
          <StoreProductArtwork item={item} size="large" />
          <span className="profile-store-modal__type">{item.type} · {item.category}</span>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
          <strong className="profile-store-modal__price">{item.price}</strong>
          <div className="profile-store-modal__actions">
            <button type="button" className="profile-store-modal__apply" onClick={() => onApply(item)}>
              {isApplied ? "Применено" : "Применить бесплатно"}
            </button>
          </div>
        </aside>
        <section className={`profile-store-modal__preview profile-store-modal__preview--${item.accent}`}>
          <div className="profile-store-modal__top-actions">
            <button type="button" aria-label="В избранное">♡</button>
            <button type="button" aria-label="Ссылка">↗</button>
            <button type="button" aria-label="Закрыть" onClick={onClose}>×</button>
          </div>
          <StoreProfilePreview item={item} avatarSrc={avatarSrc} displayName={displayName} />
        </section>
      </div>
    </div>
  );
};

const StoreProductCard = ({ item, isApplied, onOpen }) => (
  <button type="button" className={`profile-store-card ${isApplied ? "profile-store-card--applied" : ""}`} onClick={() => onOpen(item)}>
    <StoreProductArtwork item={item} />
    <span className="profile-store-card__meta">
      <strong>{item.title}</strong>
      <span className="profile-store-card__type">{item.type}</span>
      <span className="profile-store-card__price">
        {item.price}
        {item.discount ? <em>{item.discount}</em> : null}
      </span>
    </span>
    {item.colors?.length ? (
      <span className="profile-store-card__swatches" aria-hidden="true">
        {item.colors.map((color) => <i key={color} style={{ background: color }} />)}
      </span>
    ) : null}
    {isApplied ? <span className="profile-store-card__badge">Применено</span> : null}
  </button>
);

const ProfileStoreView = ({ avatarSrc, displayName, appliedItem, onOpenItem }) => {
  const appliedItemId = appliedItem?.id || "";
  const [activeType, setActiveType] = useState("Все");
  const visibleStoreItems = useMemo(
    () => activeType === "Все" ? PROFILE_STORE_ITEMS : PROFILE_STORE_ITEMS.filter((item) => item.type === activeType),
    [activeType]
  );

  return (
    <div className="friends-main__content friends-main__content--store">
      <section className="profile-store-hero">
        <div className="profile-store-hero__art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="profile-store-hero__copy">
          <span>Магазин профиля</span>
          <h1>Украшения, рамки и анимации</h1>
          <p>Все предметы сейчас бесплатные. Нажмите на товар, посмотрите предпросмотр и примените стиль кнопкой в окне товара.</p>
        </div>
        <button type="button" className="profile-store-hero__button" onClick={() => onOpenItem(PROFILE_STORE_ITEMS[0])}>
          Просмотреть коллекцию
        </button>
      </section>

      <div className="profile-store-filter" aria-label="Типы товаров">
        {["Все", ...PROFILE_STORE_TYPES].map((type) => (
          <button
            key={type}
            type="button"
            className={`profile-store-filter__chip ${activeType === type ? "profile-store-filter__chip--active" : ""}`}
            onClick={() => setActiveType(type)}
            aria-pressed={activeType === type}
          >
            {type}
          </button>
        ))}
      </div>

      <section className="profile-store-section">
        <div className="profile-store-section__header">
          <h2>Рекомендуем</h2>
        </div>
        <div className="profile-store-row">
          {PROFILE_STORE_FEATURED_ITEMS.map((item) => (
            <StoreProductCard key={item.id} item={item} isApplied={appliedItemId === item.id} onOpen={onOpenItem} />
          ))}
        </div>
      </section>

      {PROFILE_STORE_CATEGORIES.map((category) => {
        const categoryItems = visibleStoreItems.filter((item) => item.category === category);
        if (!categoryItems.length) {
          return null;
        }

        return (
        <section key={category} className="profile-store-section">
          <div className="profile-store-section__header">
            <h2>{category}</h2>
            <button type="button" onClick={() => onOpenItem(categoryItems[0] || PROFILE_STORE_ITEMS[0])}>
              Показать все
            </button>
          </div>
          <div className="profile-store-grid">
            {categoryItems.map((item) => (
              <StoreProductCard key={item.id} item={item} isApplied={appliedItemId === item.id} onOpen={onOpenItem} />
            ))}
          </div>
        </section>
        );
      })}

    </div>
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
  profileCustomization,
  onProfileCustomizationChange,
  selectedStreamUserId = null,
  selectedStream = null,
  selectedStreamParticipant = null,
  selectedStreamDebugInfo = null,
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
  onCloseSelectedStream,
  onFriendRequestAction,
  onFriendSearchSubmit,
  onFriendSearchChange,
  onDirectSearchQueryChange,
  onClearDirectSearchQuery,
  onAddFriend,
  phoneIcon,
  searchIcon,
  getDisplayName,
}) => {
  const conversationAvatarInputRef = useRef(null);
  const conversationSettingsAvatarInputRef = useRef(null);
  const [activeStoreItem, setActiveStoreItem] = useState(null);
  const [createConversationStep, setCreateConversationStep] = useState("");
  const [conversationTitle, setConversationTitle] = useState("");
  const [conversationAvatarFile, setConversationAvatarFile] = useState(null);
  const [conversationAvatarPreview, setConversationAvatarPreview] = useState("");
  const [selectedConversationFriendIds, setSelectedConversationFriendIds] = useState([]);
  const [conversationFriendSearch, setConversationFriendSearch] = useState("");
  const [conversationListSearch, setConversationListSearch] = useState("");
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
  const hasFriendSearchText = String(friendEmail || "").trim().length > 0;
  const shouldShowFriendLookupList = hasFriendSearchText && (friendLookupLoading || friendsError || friendLookupPerformed || friendLookupResults.length > 0);
  const appliedStoreItem = getProfileStoreItemById(profileCustomization?.appliedItemId);
  const applyStoreItem = (item) => {
    onProfileCustomizationChange?.(applyProfileStoreItem(profileCustomization, item));
  };
  const isWatchingCurrentDirectStream =
    !currentConversationTarget &&
    currentDirectFriend &&
    selectedStreamUserId &&
    String(selectedStreamUserId) === String(currentDirectFriend.id || "");

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
  const filteredConversations = useMemo(() => {
    const normalizedQuery = String(conversationListSearch || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = String(conversation?.title || "").toLowerCase();
      const memberNames = (conversation?.members || [])
        .map((member) => `${member?.name || ""} ${member?.nickname || ""} ${member?.email || ""}`)
        .join(" ")
        .toLowerCase();

      return title.includes(normalizedQuery) || memberNames.includes(normalizedQuery);
    });
  }, [conversationListSearch, conversations]);
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
              className={`friends-main__tab ${friendsPageSection === "conversations" && !currentDirectFriend && !currentConversationTarget ? "friends-main__tab--active" : ""}`}
              onClick={() => {
                onResetDirect();
                onSetFriendsSection("conversations");
              }}
            >
              Беседы
            </button>
            <button
              type="button"
              className={`friends-main__tab ${friendsPageSection === "store" && !currentDirectFriend && !currentConversationTarget ? "friends-main__tab--active" : ""}`}
              onClick={() => {
                onResetDirect();
                onSetFriendsSection("store");
              }}
            >
              Магазин
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

            {isWatchingCurrentDirectStream ? (
              <ScreenShareViewer
                stream={selectedStream?.stream || null}
                videoSrc={selectedStream?.videoSrc || ""}
                imageSrc={selectedStream?.imageSrc || ""}
                muted={!Boolean(selectedStream?.hasAudio || selectedStream?.stream?.getAudioTracks?.().length)}
                title={`Трансляция ${selectedStreamParticipant?.name || getDisplayName(currentDirectFriend)}`}
                subtitle="Личный звонок"
                onClose={onCloseSelectedStream}
                debugInfo={selectedStreamDebugInfo}
              />
            ) : (
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
            )}
          </div>
        ) : friendsPageSection === "store" ? (
          <ProfileStoreView
            avatarSrc={user?.avatar || ""}
            displayName={getDisplayName(user)}
            appliedItem={appliedStoreItem}
            onOpenItem={(item) => setActiveStoreItem(item)}
          />
        ) : friendsPageSection !== "conversations" ? (
            <div className="friends-main__content friends-main__content--directory">
            <div className="friends-hero friends-add-inline">
                <h2>Добавить в друзья</h2>
                <p>Введите имя для поиска по имени. Если в запросе есть символ `@`, поиск автоматически переключится на email.</p>
                <form className="friends-hero__form" onSubmit={onFriendSearchSubmit}>
                  <div className={`friends-search-combobox ${shouldShowFriendLookupList ? "friends-search-combobox--open" : ""}`}>
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={friendQueryMode === "email" ? "friend@example.com" : "Введите имя пользователя"}
                      value={friendEmail}
                      onChange={(event) => onFriendSearchChange(event.target.value)}
                    />
                    {shouldShowFriendLookupList ? (
                      <div className="friends-search-dropdown">
                        {friendsError ? <div className="friends-search-dropdown__message friends-search-dropdown__message--error">{friendsError}</div> : null}
                        {!friendsError && friendLookupLoading ? <div className="friends-search-dropdown__message">Ищем...</div> : null}
                        {!friendsError && friendLookupResults.map((friend) => (
                          <div key={friend.id} className="friends-search-dropdown__item">
                            <div className="friends-results__identity">
                              <AnimatedAvatar className="friends-results__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="eager" decoding="sync" />
                              <div className="friends-results__meta">
                                <strong>{getDisplayName(friend)}</strong>
                                <span>{friend.email || "Без email"}</span>
                              </div>
                            </div>
                            <button type="button" className="friends-results__action" disabled={isAddingFriend} onClick={() => onAddFriend(friend)}>
                              {isAddingFriend ? "..." : "Добавить"}
                            </button>
                          </div>
                        ))}
                        {!friendsError && friendLookupPerformed && !friendLookupLoading && !friendLookupResults.length ? (
                          <div className="friends-search-dropdown__message">
                            {friendQueryMode === "email"
                              ? "Никого не нашли. Проверьте email и попробуйте ещё раз."
                              : "Никого не нашли. Попробуйте другую букву, имя или фамилию."}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button type="submit" disabled={friendLookupLoading}>
                    {friendLookupLoading ? "Ищем..." : "Найти"}
                  </button>
                </form>
            </div>

            {friendRequestsError || incomingFriendRequests.length ? (
              <div className="friends-hero friends-requests">
                <div className="friends-requests__header">
                  <h2>Входящие заявки</h2>
                  {incomingFriendRequestCount > 0 ? <span className="friends-main__tab-badge">{Math.min(incomingFriendRequestCount, 99)}</span> : null}
                </div>
                {friendRequestsError ? <div className="friends-panel__error">{friendRequestsError}</div> : null}
                {!friendRequestsError && incomingFriendRequests.length ? (
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

            <div className="friends-hero friends-hero--compact friends-hero--directory">
              <div className="friends-hero__header friends-hero__header--compact">
                <div className="friends-hero__header-copy">
                  <h1>Все друзья</h1>
                  <p>{friends.length ? `${friends.length} контактов. Чат, звонок и быстрые действия под рукой.` : "У вас пока нет друзей."}</p>
                </div>
              </div>
              {friends.length ? (
                <div className="friends-results friends-results--compact friends-results--scroll">
                  {friends.map((friend) => (
                    <div key={friend.id} className="friends-results__item friends-results__item--compact">
                      <div className="friends-results__identity">
                        <AnimatedAvatar className="friends-results__avatar" src={friend.avatar || ""} alt={getDisplayName(friend)} loading="lazy" decoding="async" />
                        <div className="friends-results__meta">
                          <strong className={isUserCurrentlyOnline(friend) ? "friends-results__name--online" : ""}>{getDisplayName(friend)}</strong>
                          <span>{friend.email || "Без email"}</span>
                        </div>
                      </div>
                      <div className="friends-results__actions friends-results__actions--icon">
                        <button
                          type="button"
                          className="friends-results__icon-action friends-results__icon-action--primary"
                          onClick={() => onOpenDirectChat(friend.id)}
                          aria-label={`Открыть чат с ${getDisplayName(friend)}`}
                          title="Открыть чат"
                        >
                          <FriendsActionIcon kind="chat" />
                        </button>
                        <button
                          type="button"
                          className="friends-results__icon-action"
                          onClick={() => onStartDirectCall?.(friend.id)}
                          aria-label={`Позвонить ${getDisplayName(friend)}`}
                          title="Позвонить"
                        >
                          <FriendsActionIcon kind="call" />
                        </button>
                        <button
                          type="button"
                          className="friends-results__icon-action"
                          onClick={(event) => onOpenDirectActions?.(event, friend)}
                          aria-label={`Действия с ${getDisplayName(friend)}`}
                          title="Действия"
                        >
                          <FriendsActionIcon kind="more" />
                        </button>
                        <button
                          type="button"
                          className="friends-results__icon-action friends-results__icon-action--future"
                          aria-label="Будущие быстрые действия"
                          title="Скоро: быстрые действия"
                          disabled
                        >
                          <FriendsActionIcon kind="future" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="friends-panel__empty">У вас пока нет друзей. Найдите пользователя по имени или email.</div>
              )}
            </div>
          </div>
        ) : friendsPageSection === "conversations" ? (
          <div className="friends-main__content friends-main__content--directory">
            <div className="friends-hero friends-hero--compact friends-hero--directory">
              <div className="friends-hero__header">
                <div className="friends-hero__header-copy">
                  <h1>Беседы</h1>
                  <p>Здесь находятся групповые чаты, куда можно добавлять друзей и общаться в отдельном канале.</p>
                </div>
                <button
                  type="button"
                  className="friends-create-button friends-create-button--compact"
                  onClick={openCreateConversationFlow}
                >
                  <span aria-hidden="true">+</span>
                  Создать
                </button>
              </div>
              <label className="friends-directory-search">
                <span aria-hidden="true" />
                <input
                  type="text"
                  value={conversationListSearch}
                  onChange={(event) => setConversationListSearch(event.target.value)}
                  placeholder="Найти беседу"
                />
              </label>
              {conversationsError ? <div className="friends-panel__error">{conversationsError}</div> : null}
              {conversationsLoading ? <div className="friends-panel__empty">Загружаем беседы...</div> : null}
              {!conversationsLoading && filteredConversations.length ? (
                <div className="friends-results friends-results--compact friends-results--scroll">
                  {filteredConversations.map((conversation) => (
                    <div key={conversation.conversationId || conversation.id} className="friends-results__item friends-results__item--compact">
                      <div className="friends-results__identity">
                        <AnimatedAvatar
                          className="friends-results__avatar"
                          src={conversation.avatar || ""}
                          alt={conversation.title || "Беседа"}
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="friends-results__meta">
                          <strong>{conversation.title || "Новая беседа"}</strong>
                          <span>{`${Number(conversation.memberCount || conversation.members?.length || 0)} участников`}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="friends-results__icon-action friends-results__icon-action--primary"
                        onClick={() => onOpenConversationChat(conversation.conversationId || conversation.id)}
                        aria-label={`Открыть беседу ${conversation.title || "Новая беседа"}`}
                        title="Открыть чат"
                      >
                        <FriendsActionIcon kind="chat" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {!conversationsLoading && !conversationsError && !conversations.length ? (
                <div className="friends-panel__empty">Пока нет ни одной беседы.</div>
              ) : null}
              {!conversationsLoading && !conversationsError && conversations.length > 0 && !filteredConversations.length ? (
                <div className="friends-panel__empty">По этому запросу бесед не найдено.</div>
              ) : null}
            </div>
          </div>
        ) : null}
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

      <StoreProductModal
        item={activeStoreItem}
        appliedItemId={appliedStoreItem?.id || ""}
        avatarSrc={user?.avatar || ""}
        displayName={getDisplayName(user)}
        onApply={(item) => {
          applyStoreItem(item);
          setActiveStoreItem(null);
        }}
        onClose={() => setActiveStoreItem(null)}
      />

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

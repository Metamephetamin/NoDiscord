import { useState } from "react";
import AnimatedAvatar from "./AnimatedAvatar";
import ServerInvitesPanel from "./ServerInvitesPanel";
import TextChat from "./TextChat";
import useMobileLongPress from "../hooks/useMobileLongPress";
import { buildDirectMessageChannelId } from "../utils/directMessageChannels";
import { formatUserPresenceStatus, isUserCurrentlyOnline } from "../utils/menuMainModel";

export const FriendsSidebar = ({
  query,
  navItems,
  friendsPageSection,
  incomingFriendRequestCount,
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
              <span className="friends-nav__icon">{item.icon}</span>
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
            <span className="friends-nav__icon">+</span>
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
            <span className="friends-nav__icon">#</span>
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
                      <span className="friends-directs__name">{getDisplayName(friend)}</span>
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
  friendActionStatus,
  isAddingFriend,
  activeContacts,
  conversations,
  conversationsLoading,
  conversationsError,
  onResetDirect,
  onSetFriendsSection,
  onOpenDirectChat,
  onOpenConversationChat,
  onStartDirectCall,
  onOpenDirectActions,
  onFriendRequestAction,
  onFriendSearchSubmit,
  onFriendSearchChange,
  onDirectSearchQueryChange,
  onAddFriend,
  onOpenServersWorkspace,
  onImportServer,
  onServerShared,
  phoneIcon,
  searchIcon,
  getDisplayName,
}) => (
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
          <div className="friends-main__chat">
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

            <TextChat
              resolvedChannelId={currentConversationTarget ? currentConversationChannelId : currentDirectChannelId}
              localMessageStateVersion={textChatLocalStateVersion}
              user={user}
              searchQuery={directSearchQuery}
              directTargets={directConversationTargets}
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
              <h1>Беседы</h1>
              <p>Здесь находятся групповые чаты, куда можно добавлять друзей и общаться в отдельном канале.</p>
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
                          <button type="button" className="friends-results__action friends-results__action--decline" disabled={friendRequestActionId === request.id} onClick={() => onFriendRequestAction(request.id, "decline")}>
                            {friendRequestActionId === request.id ? "..." : "×"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!friendRequestsLoading && !friendRequestsError && !incomingFriendRequests.length ? (
                  <div className="friends-panel__empty">Новых заявок пока нет.</div>
                ) : null}
              </div>

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
              {friendActionStatus ? <div className="friends-panel__success">{friendActionStatus}</div> : null}
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

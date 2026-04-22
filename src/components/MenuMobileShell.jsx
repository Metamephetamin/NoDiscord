export default function MenuMobileShell({
  header,
  mobileSection,
  mobileServersPane,
  currentDirectFriend,
  currentConversationTarget,
  totalServerUnreadCount,
  totalFriendsAttentionCount,
  onBack,
  onOpenServersWorkspace,
  onOpenFriendsWorkspace,
  onOpenProfile,
  renderMobileProfileScreen,
  renderMobileDirectChat,
  renderFriendsMain,
  renderMobileServerStrip,
  renderMobileVoiceRoom,
  renderServerMain,
  renderServersSidebar,
}) {
  return (
    <div className="menu__main menu__main--mobile">
      <header className="mobile-shell__header">
        <div className="mobile-shell__header-main">
          {header.canGoBack ? (
            <button type="button" className="mobile-shell__back" onClick={onBack} aria-label="Назад">
              ‹
            </button>
          ) : (
            <span className="mobile-shell__back-spacer" aria-hidden="true" />
          )}
          <div className="mobile-shell__header-copy">
            <strong>
              <span>{header.title}</span>
              {Number(header.badge || 0) > 0 ? (
                <span className="mobile-shell__header-badge">{Math.min(Number(header.badge || 0), 99)}</span>
              ) : null}
            </strong>
            <span>{header.subtitle}</span>
          </div>
        </div>
        {header.onAction ? (
          <button type="button" className="mobile-shell__header-action" onClick={header.onAction}>
            <span>{header.actionLabel}</span>
            {Number(header.actionBadge || 0) > 0 ? (
              <span className="mobile-shell__header-badge">{Math.min(Number(header.actionBadge || 0), 99)}</span>
            ) : null}
          </button>
        ) : null}
      </header>

      <div className="mobile-shell__body">
        {mobileSection === "profile" ? (
          renderMobileProfileScreen()
        ) : mobileSection === "friends" ? (
          <div className="mobile-shell__workspace mobile-shell__workspace--friends">
            {currentDirectFriend || currentConversationTarget ? renderMobileDirectChat() : renderFriendsMain()}
          </div>
        ) : (
          <div className="mobile-shell__panel mobile-shell__panel--servers">
            {renderMobileServerStrip()}
            <div className="mobile-shell__workspace mobile-shell__workspace--servers">
              {mobileServersPane === "voice" ? renderMobileVoiceRoom() : mobileServersPane === "chat" ? renderServerMain() : renderServersSidebar(false)}
            </div>
          </div>
        )}
      </div>

      <nav className="mobile-shell__nav" aria-label="Основная навигация">
        <button
          type="button"
          className={`mobile-shell__nav-item ${mobileSection === "servers" ? "mobile-shell__nav-item--active" : ""}`}
          onClick={onOpenServersWorkspace}
        >
          <span className="mobile-shell__nav-glyph" aria-hidden="true">#</span>
          <span>Серверы</span>
          {totalServerUnreadCount > 0 ? <span className="mobile-shell__nav-badge">{Math.min(totalServerUnreadCount, 99)}</span> : null}
        </button>
        <button
          type="button"
          className={`mobile-shell__nav-item ${mobileSection === "friends" ? "mobile-shell__nav-item--active" : ""}`}
          onClick={onOpenFriendsWorkspace}
        >
          <span className="mobile-shell__nav-glyph" aria-hidden="true">○</span>
          <span>Чаты</span>
          {totalFriendsAttentionCount > 0 ? <span className="mobile-shell__nav-badge">{Math.min(totalFriendsAttentionCount, 99)}</span> : null}
        </button>
        <button
          type="button"
          className={`mobile-shell__nav-item ${mobileSection === "profile" ? "mobile-shell__nav-item--active" : ""}`}
          onClick={onOpenProfile}
        >
          <span className="mobile-shell__nav-glyph" aria-hidden="true">◎</span>
          <span>Вы</span>
        </button>
      </nav>
    </div>
  );
}

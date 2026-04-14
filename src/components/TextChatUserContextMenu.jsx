export default function TextChatUserContextMenu({
  menuRef,
  menu,
  sections = [],
  onClose,
}) {
  if (!menu) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="chat-user-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="chat-user-menu__header">
        <div className="chat-user-menu__avatar">
          {menu.avatarUrl ? <img src={menu.avatarUrl} alt={menu.username} /> : <span>{String(menu.username || "U").trim().charAt(0) || "U"}</span>}
        </div>
        <div className="chat-user-menu__copy">
          <strong>{menu.username || "User"}</strong>
          <span>{menu.isSelf ? "Это вы" : `ID: ${menu.userId}`}</span>
        </div>
        <button type="button" className="chat-user-menu__close" onClick={onClose} aria-label="Закрыть меню">×</button>
      </div>

      <div className="chat-user-menu__body" role="menu">
        {sections.map((group, groupIndex) => (
          <div key={`group-${groupIndex}`} className="chat-user-menu__section">
            {group.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`chat-user-menu__item ${action.danger ? "chat-user-menu__item--danger" : ""}`}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                <span className={`chat-user-menu__icon ${action.icon === "ID" ? "chat-user-menu__icon--badge" : ""}`} aria-hidden="true">
                  {action.icon}
                </span>
                <span className="chat-user-menu__label">{action.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

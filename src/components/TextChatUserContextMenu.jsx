import AnimatedAvatar from "./AnimatedAvatar";

const USER_MENU_ICON_PATHS = {
  profile: (
    <>
      <path d="M12 12.25C14.35 12.25 16.25 10.35 16.25 8C16.25 5.65 14.35 3.75 12 3.75C9.65 3.75 7.75 5.65 7.75 8C7.75 10.35 9.65 12.25 12 12.25Z" />
      <path d="M4.75 20.25C5.35 16.75 8.05 14.75 12 14.75C15.95 14.75 18.65 16.75 19.25 20.25" />
    </>
  ),
  "direct-chat": (
    <>
      <path d="M5.25 6.25H18.75C19.85 6.25 20.75 7.15 20.75 8.25V15.75C20.75 16.85 19.85 17.75 18.75 17.75H10.25L6.25 20.25V17.75H5.25C4.15 17.75 3.25 16.85 3.25 15.75V8.25C3.25 7.15 4.15 6.25 5.25 6.25Z" />
      <path d="M7.75 10.25H16.25" />
      <path d="M7.75 13.5H13.75" />
    </>
  ),
  "direct-call": (
    <path d="M8.2 4.75L10 8.85L7.85 10.3C8.9 12.45 10.55 14.1 12.7 15.15L14.15 13L18.25 14.8C18.7 15 18.98 15.48 18.88 15.97L18.42 18.2C18.3 18.82 17.75 19.25 17.12 19.25C10.28 19.25 4.75 13.72 4.75 6.88C4.75 6.25 5.18 5.7 5.8 5.58L8.03 5.12C8.52 5.02 9 5.3 9.2 5.75" />
  ),
  "clear-local-chat": (
    <>
      <path d="M6.25 19.25H17.75" />
      <path d="M8.25 16.75L15.75 9.25" />
      <path d="M13.95 7.45L16.55 10.05C17.15 10.65 17.15 11.6 16.55 12.2L12 16.75H7.25V12L11.8 7.45C12.4 6.85 13.35 6.85 13.95 7.45Z" />
    </>
  ),
  invite: (
    <>
      <path d="M5.25 12.25H18.25" />
      <path d="M13.25 7.25L18.25 12.25L13.25 17.25" />
      <path d="M5.75 5.75H18.25V18.25" />
    </>
  ),
  friend: (
    <>
      <path d="M9.75 12.25C11.82 12.25 13.5 10.57 13.5 8.5C13.5 6.43 11.82 4.75 9.75 4.75C7.68 4.75 6 6.43 6 8.5C6 10.57 7.68 12.25 9.75 12.25Z" />
      <path d="M3.75 19.25C4.25 16.25 6.5 14.5 9.75 14.5C11.25 14.5 12.55 14.88 13.57 15.6" />
      <path d="M17.75 13.75V19.25" />
      <path d="M15 16.5H20.5" />
    </>
  ),
  ignore: (
    <>
      <path d="M4.25 12C6.1 8.85 8.65 7.25 12 7.25C15.35 7.25 17.9 8.85 19.75 12C18.92 13.42 17.92 14.53 16.75 15.32" />
      <path d="M13.65 13.4C13.2 13.85 12.63 14.08 12 14.08C10.85 14.08 9.92 13.15 9.92 12C9.92 11.37 10.15 10.8 10.6 10.35" />
      <path d="M4.75 4.75L19.25 19.25" />
    </>
  ),
  block: (
    <>
      <path d="M12 20.25C16.56 20.25 20.25 16.56 20.25 12C20.25 7.44 16.56 3.75 12 3.75C7.44 3.75 3.75 7.44 3.75 12C3.75 16.56 7.44 20.25 12 20.25Z" />
      <path d="M6.65 17.35L17.35 6.65" />
    </>
  ),
  "copy-id": (
    <>
      <path d="M8.25 8.25H6.75C5.65 8.25 4.75 9.15 4.75 10.25V17.25C4.75 18.35 5.65 19.25 6.75 19.25H13.75C14.85 19.25 15.75 18.35 15.75 17.25V15.75" />
      <path d="M10.25 4.75H17.25C18.35 4.75 19.25 5.65 19.25 6.75V13.75C19.25 14.85 18.35 15.75 17.25 15.75H10.25C9.15 15.75 8.25 14.85 8.25 13.75V6.75C8.25 5.65 9.15 4.75 10.25 4.75Z" />
    </>
  ),
};

const UserMenuIcon = ({ id }) => {
  const paths = USER_MENU_ICON_PATHS[id] || USER_MENU_ICON_PATHS.profile;

  return (
    <svg className="chat-user-menu__icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths}
    </svg>
  );
};

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
    <>
      <div className="mobile-sheet-backdrop" aria-hidden="true" />
      <div
        ref={menuRef}
        className="chat-user-menu"
        style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-user-menu__header">
          <div className="chat-user-menu__avatar">
            {menu.avatarUrl ? (
              <AnimatedAvatar
                className="chat-user-menu__avatar-media"
                src={menu.avatarUrl}
                alt={menu.username}
                loading="eager"
                decoding="sync"
              />
            ) : (
              <span>{String(menu.username || "U").trim().charAt(0) || "U"}</span>
            )}
          </div>
          <div className="chat-user-menu__copy">
            <strong>{menu.username || "User"}</strong>
            <span>{menu.isSelf ? "Это вы" : `ID: ${menu.userId}`}</span>
          </div>
          <button type="button" className="chat-user-menu__close" onClick={onClose} aria-label="Закрыть меню" />
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
                  <span className="chat-user-menu__icon" aria-hidden="true">
                    <UserMenuIcon id={action.id} />
                  </span>
                  <span className="chat-user-menu__label">{action.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

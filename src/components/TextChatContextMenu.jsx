import AnimatedEmojiGlyph from "./AnimatedEmojiGlyph";

export default function TextChatContextMenu({
  menuRef,
  menu,
  actions,
  primaryReactions,
  stickerReactions,
  isStickerPanelOpen,
  onToggleStickerPanel,
  isReactionActive,
  onToggleReaction,
}) {
  if (!menu) {
    return null;
  }

  return (
    <>
      <div className="mobile-sheet-backdrop" aria-hidden="true" />
      <div
        ref={menuRef}
        className="message-context-menu-stack"
        style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-reaction-picker" aria-label="Быстрые реакции">
          <div className="message-reaction-picker__row">
            {primaryReactions.map((reactionOption) => (
              <button
                key={reactionOption.key}
                type="button"
                className={`message-reaction-picker__item ${isReactionActive(reactionOption) ? "message-reaction-picker__item--active" : ""}`}
                onClick={() => onToggleReaction(menu.messageId, reactionOption)}
                aria-label={reactionOption.label}
                title={reactionOption.label}
              >
                <AnimatedEmojiGlyph emoji={reactionOption} />
              </button>
            ))}
            <button
              type="button"
              className={`message-reaction-picker__stickers-toggle ${isStickerPanelOpen ? "message-reaction-picker__stickers-toggle--active" : ""}`}
              onClick={onToggleStickerPanel}
              aria-expanded={isStickerPanelOpen}
              aria-label="Открыть список стикеров"
            >
              <span className="message-reaction-picker__stickers-label">Стикеры</span>
              <span className="message-reaction-picker__stickers-arrow" aria-hidden="true">›</span>
            </button>
          </div>
          {isStickerPanelOpen ? (
            <div className="message-reaction-picker__stickers" role="menu" aria-label="Стикеры">
              {stickerReactions.map((reactionOption) => (
                <button
                  key={reactionOption.key}
                  type="button"
                  className={`message-reaction-picker__sticker ${isReactionActive(reactionOption) ? "message-reaction-picker__sticker--active" : ""}`}
                  onClick={() => onToggleReaction(menu.messageId, reactionOption)}
                  aria-label={reactionOption.label}
                  title={reactionOption.label}
                >
                  <AnimatedEmojiGlyph emoji={reactionOption} className="message-reaction-picker__sticker-glyph" />
                  <span className="message-reaction-picker__sticker-label">{reactionOption.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="message-context-menu" role="menu">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`message-context-menu__item ${action.danger ? "message-context-menu__item--danger" : ""}`}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              <span className="message-context-menu__icon" aria-hidden="true">{action.icon}</span>
              <span className="message-context-menu__label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

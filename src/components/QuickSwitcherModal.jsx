export default function QuickSwitcherModal({
  open,
  query,
  items = [],
  selectedIndex = 0,
  onClose,
  onQueryChange,
  onSelectIndex,
  onSelect,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop quick-switcher-backdrop" onClick={onClose}>
      <div className="quick-switcher" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Командная палитра">
        <div className="quick-switcher__header">
          <strong>Командная палитра</strong>
          <span>Ctrl/Cmd + K</span>
        </div>
        <input
          type="text"
          className="quick-switcher__input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Сервер, канал, пользователь, закреп, упоминание или сообщение"
          autoFocus
        />
        <div className="quick-switcher__list">
          {items.length ? (
            items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`quick-switcher__item ${index === selectedIndex ? "quick-switcher__item--active" : ""}`}
                onClick={() => onSelect(item)}
                onMouseEnter={() => onSelectIndex?.(index)}
                onFocus={() => onSelectIndex?.(index)}
              >
                <span className={`quick-switcher__badge quick-switcher__badge--${item.kind || "default"}`}>
                  {item.shortLabel || item.kindLabel || "Go"}
                </span>
                <span className="quick-switcher__copy">
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="quick-switcher__empty">Ничего не найдено.</div>
          )}
        </div>
      </div>
    </div>
  );
}

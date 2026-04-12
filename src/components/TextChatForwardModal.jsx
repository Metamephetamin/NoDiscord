import AnimatedAvatar from "./AnimatedAvatar";
import { getTargetDisplayName } from "../utils/textChatHelpers";

export default function TextChatForwardModal({
  forwardModal,
  forwardableCount,
  targets,
  onClose,
  onQueryChange,
  onToggleTarget,
  onSubmit,
}) {
  if (!forwardModal.open) {
    return null;
  }

  return (
    <div className="forward-modal__backdrop" onClick={onClose} role="presentation">
      <div className="forward-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Переслать сообщения">
        <div className="forward-modal__header">
          <div>
            <h3>Переслать сообщения</h3>
            <p>{forwardableCount} {forwardableCount === 1 ? "сообщение" : "сообщения"} можно переслать выбранным друзьям</p>
          </div>
          <button type="button" className="forward-modal__close" onClick={onClose} aria-label="Закрыть">
            ?
          </button>
        </div>

        <input
          className="forward-modal__search"
          type="text"
          value={forwardModal.query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Поиск друзей"
        />

        <div className="forward-modal__list">
          {targets.length ? (
            targets.map((target) => {
              const isSelectedTarget = forwardModal.targetIds.some((targetId) => String(targetId) === String(target.id));
              return (
                <button
                  key={target.id}
                  type="button"
                  className={`forward-modal__target ${isSelectedTarget ? "forward-modal__target--active" : ""}`}
                  onClick={() => onToggleTarget(target.id)}
                >
                  <AnimatedAvatar className="forward-modal__target-avatar" src={target.avatar || ""} alt={getTargetDisplayName(target)} />
                  <span className="forward-modal__target-copy">
                    <strong>{getTargetDisplayName(target)}</strong>
                    <small>{target.email || "Без email"}</small>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="forward-modal__empty">Подходящие друзья не найдены.</div>
          )}
        </div>

        <div className="forward-modal__actions">
          <button type="button" className="forward-modal__button forward-modal__button--ghost" onClick={onClose} disabled={forwardModal.submitting}>
            Отмена
          </button>
          <button
            type="button"
            className="forward-modal__button"
            onClick={onSubmit}
            disabled={!forwardModal.targetIds.length || forwardableCount <= 0 || forwardModal.submitting}
          >
            {forwardModal.submitting ? "Отправляем..." : "Переслать"}
          </button>
        </div>
      </div>
    </div>
  );
}

import "../css/TextChatReportModal.css";

export default function TextChatReportModal({
  report,
  onReasonChange,
  onClose,
  onSubmit,
  title = "Пожаловаться",
  ariaLabel = "Жалоба на сообщение",
  placeholder = "Спам, оскорбления, угрозы...",
  maxLength = 240,
}) {
  if (!report?.open) {
    return null;
  }

  const reason = report.reason || "";

  return (
    <div className="chat-report-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button type="button" className="chat-report-modal__backdrop" aria-label="Закрыть жалобу" onClick={onClose} />
      <form className="chat-report-modal__dialog" onSubmit={onSubmit}>
        <div className="chat-report-modal__header">
          <h3>{title}</h3>
          <button type="button" className="chat-report-modal__close" onClick={onClose} disabled={report.busy} aria-label="Закрыть">
            ×
          </button>
        </div>
        <label className="chat-report-modal__field">
          <span>Причина жалобы</span>
          <textarea
            value={reason}
            onChange={(event) => onReasonChange?.(event.target.value)}
            maxLength={maxLength}
            rows={4}
            autoFocus
            placeholder={placeholder}
          />
        </label>
        {report.status ? <p className="chat-report-modal__status">{report.status}</p> : null}
        <div className="chat-report-modal__actions">
          <button type="button" className="chat-report-modal__cancel" onClick={onClose} disabled={report.busy}>
            Отмена
          </button>
          <button type="submit" className="chat-report-modal__submit" disabled={report.busy || reason.trim().length < 4}>
            {report.busy ? "Отправляем..." : "Отправить"}
          </button>
        </div>
      </form>
    </div>
  );
}

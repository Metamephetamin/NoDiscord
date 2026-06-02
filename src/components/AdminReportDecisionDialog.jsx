import { useMemo, useState } from "react";

const getDisplayValue = (value, fallback = "нет данных") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

export default function AdminReportDecisionDialog({
  event,
  busy = false,
  onClose,
  onBanTarget,
  onDismissReport,
}) {
  const [banReason, setBanReason] = useState(() => (event?.reason ? `Жалоба ${event.reportId}: ${event.reason}` : ""));
  const [dismissMessage, setDismissMessage] = useState("Мы проверили жалобу и не нашли нарушения. Спасибо, что сообщили.");

  const details = useMemo(() => {
    if (!event) {
      return [];
    }

    return [
      ["Тип", event.reportKindLabel || event.title || "Жалоба"],
      ["Статус", event.status || "open"],
      ["Дата", event.createdAtLabel || event.createdAt || "нет данных"],
      ["Канал", event.channelId || "не указан"],
      ["Сообщение", event.messageId ? `#${event.messageId}` : "не указано"],
      ["Сервер", event.serverId || "не указан"],
    ];
  }, [event]);

  if (!event) {
    return null;
  }

  const reporterLabel = event.reporterName
    ? `${event.reporterName} · ID ${getDisplayValue(event.reporterUserId, "?")}`
    : `ID ${getDisplayValue(event.reporterUserId, "?")}`;
  const targetLabel = event.targetName
    ? `${event.targetName} · ID ${getDisplayValue(event.targetUserId, "?")}`
    : `ID ${getDisplayValue(event.targetUserId, "?")}`;

  return (
    <div className="admin-report-dialog__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Детали жалобы"
        onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <header className="admin-report-dialog__header">
          <div>
            <span>Жалоба #{event.reportId}</span>
            <h3>{event.title || "Детали жалобы"}</h3>
          </div>
          <button type="button" className="admin-report-dialog__close" onClick={onClose} aria-label="Закрыть детали жалобы" />
        </header>

        <div className="admin-report-dialog__people">
          <div>
            <span>От кого жалоба</span>
            <strong>{reporterLabel}</strong>
          </div>
          <div>
            <span>На кого жалоба</span>
            <strong>{targetLabel}</strong>
          </div>
        </div>

        <section className="admin-report-dialog__reason">
          <span>Причина</span>
          <p>{event.reason || "Причина не указана."}</p>
        </section>

        <dl className="admin-report-dialog__details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <section className="admin-report-dialog__decision">
          <label className="admin-settings-field">
            <span>Причина бана</span>
            <textarea
              className="settings-input admin-report-dialog__textarea"
              value={banReason}
              maxLength={500}
              onChange={(changeEvent) => setBanReason(changeEvent.target.value)}
              placeholder="Что увидит пользователь в уведомлении о бане"
            />
          </label>
          <label className="admin-settings-field">
            <span>Сообщение автору жалобы</span>
            <textarea
              className="settings-input admin-report-dialog__textarea"
              value={dismissMessage}
              maxLength={500}
              onChange={(changeEvent) => setDismissMessage(changeEvent.target.value)}
              placeholder="Коротко объясните, что все нормально"
            />
          </label>
        </section>

        <footer className="admin-report-dialog__actions">
          <button type="button" className="settings-inline-button" disabled={busy} onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="settings-inline-button settings-inline-button--danger" disabled={busy || !event.targetUserId} onClick={() => onBanTarget?.(event, banReason)}>
            {busy ? "..." : "Забанить нарушителя"}
          </button>
          <button type="button" className="settings-inline-button" disabled={busy || !event.canDismiss} onClick={() => onDismissReport?.(event, dismissMessage)}>
            {busy ? "..." : "Отклонить и уведомить"}
          </button>
        </footer>
      </section>
    </div>
  );
}

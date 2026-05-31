import "../../css/AccountSessionsPanel.css";

const formatDeviceSessionDate = (value) => {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
};

export default function AccountSessionsPanel({
  sessions = [],
  loading = false,
  error = "",
  actionBusy = "",
  onRefresh,
  onRevokeSession,
  onRevokeOtherSessions,
}) {
  const hasOtherSessions = sessions.some((session) => !session?.isCurrent);

  return (
    <section className="voice-settings-card device-sessions-panel">
      <div className="device-sessions-panel__header">
        <div className="voice-settings-card__title">Активные сессии</div>
        <div className="device-sessions-panel__actions">
          <button type="button" className="settings-inline-button" onClick={onRefresh} disabled={loading || Boolean(actionBusy)}>
            {loading ? "Обновляем..." : "Обновить"}
          </button>
          <button
            type="button"
            className="settings-inline-button"
            onClick={onRevokeOtherSessions}
            disabled={!hasOtherSessions || loading || Boolean(actionBusy)}
          >
            {actionBusy === "revoke-others" ? "Завершаем..." : "Выйти на других"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="profile-settings-form__status">{error}</div>
      ) : null}

      {!loading && sessions.length === 0 ? (
        <div className="settings-empty-state">
          <h3>Устройств пока нет</h3>
          <p>После входа на новом телефоне, планшете или компьютере он появится здесь автоматически.</p>
        </div>
      ) : (
        <div className="device-sessions-list">
          {sessions.map((session) => (
            <div key={session.id} className={`device-session-card ${session.isCurrent ? "device-session-card--current" : ""}`}>
              <div className="device-session-card__row">
                <div className="device-session-card__copy">
                  <strong>{session.deviceLabel || "Устройство"}</strong>
                  <span>{session.userAgent || "Браузер"}</span>
                </div>
                <div className="device-session-card__actions">
                  {session.isCurrent ? <span className="device-session-card__badge">Это устройство</span> : null}
                  {!session.isCurrent ? (
                    <button
                      type="button"
                      className="settings-inline-button"
                      onClick={() => onRevokeSession?.(session.id)}
                      disabled={loading || actionBusy === `revoke:${session.id}` || actionBusy === "revoke-others"}
                    >
                      {actionBusy === `revoke:${session.id}` ? "Выходим..." : "Выйти"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="device-session-card__meta">
                <span><b>Активность</b>{formatDeviceSessionDate(session.lastUsedAt) || "недавно"}</span>
                <span><b>Истекает</b>{formatDeviceSessionDate(session.expiresAt) || "позже"}</span>
                {session.lastIp ? <span><b>IP</b>{session.lastIp}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

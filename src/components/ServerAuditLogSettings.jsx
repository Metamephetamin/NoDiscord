import { useState } from "react";

const AUDIT_ACTION_LABELS = {
  "server.create": "Сервер создан",
  "server.settings.update": "Настройки сервера изменены",
  "server.roles.create": "Роль создана",
  "server.roles.update": "Роли изменены",
  "server.roles.delete": "Роль удалена",
  "server.member.role.update": "Роль участника изменена",
  "server.channels.update": "Каналы изменены",
  "server.invite.create": "Создано приглашение",
  "server.delete": "Сервер удален",
  "moderation.report.create": "Жалоба создана",
  "moderation.report.status": "Статус жалобы изменен",
  "moderation.ban.apply": "Бан применен",
  "moderation.ban.revoke": "Бан снят",
  "moderation.mute.apply": "Мут применен",
  "moderation.mute.revoke": "Мут снят",
};

const formatAuditAction = (actionType) => AUDIT_ACTION_LABELS[actionType] || actionType || "Действие";

const formatAuditDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseAuditMetadata = (entry) => {
  try {
    const parsed = JSON.parse(String(entry?.metadataJson || entry?.metadata || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const formatAuditDetails = (entry) => {
  const metadata = parseAuditMetadata(entry);
  const parts = [
    metadata.roleName ? `роль: ${metadata.roleName}` : "",
    metadata.serverName ? `сервер: ${metadata.serverName}` : "",
    entry?.targetId ? `цель: ${entry.targetId}` : "",
    entry?.actorUserId ? `пользователь ID: ${entry.actorUserId}` : "",
  ].filter(Boolean);

  return parts.join(" · ");
};

export default function ServerAuditLogSettings({
  activeServer,
  auditLogs = [],
  onRefreshAuditLog,
}) {
  const [auditBusy, setAuditBusy] = useState(false);

  const refreshAuditLog = async () => {
    if (typeof onRefreshAuditLog !== "function") {
      return;
    }

    setAuditBusy(true);
    try {
      await onRefreshAuditLog();
    } finally {
      setAuditBusy(false);
    }
  };

  return (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Журнал действий</h2>
          <p>История важных изменений сервера, ролей, приглашений и модерации.</p>
        </div>
      </div>

      {!activeServer ? (
        <section className="voice-settings-card">
          <div className="settings-empty-state">
            <h3>Сервер не выбран</h3>
            <p>Выберите сервер, чтобы увидеть его журнал действий.</p>
          </div>
        </section>
      ) : (
        <section className="voice-settings-card">
          <div className="settings-section__header">
            <h4>События сервера</h4>
            <span className="settings-role-current">{auditLogs.length}</span>
            <button type="button" className="settings-inline-button" disabled={auditBusy} onClick={refreshAuditLog}>
              {auditBusy ? "Обновление..." : "Обновить"}
            </button>
          </div>
          <div className="settings-audit-list">
            {auditLogs.length ? (
              auditLogs.slice(0, 20).map((entry) => (
                <div key={entry.id || `${entry.actionType}-${entry.createdAt}`} className="settings-audit-item">
                  <div className="settings-audit-item__main">
                    <strong>{formatAuditAction(entry.actionType)}</strong>
                    <span>{formatAuditDate(entry.createdAt)}</span>
                  </div>
                  <span className="settings-role-description">{formatAuditDetails(entry) || "Деталей нет"}</span>
                </div>
              ))
            ) : (
              <span className="settings-role-description">Пока нет записей.</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

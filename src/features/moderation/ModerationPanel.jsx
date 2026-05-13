import { useEffect, useState } from "react";
import {
  applyModerationAction,
  fetchModerationReports,
  updateModerationReportStatus,
} from "./moderationApi";

export default function ModerationPanel({ serverId, canManage = false, onStatus = null }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!serverId || !canManage) {
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setLoading(true);
          setError("");
        }
        return fetchModerationReports(serverId, { status: statusFilter });
      })
      .then((items) => {
        if (!cancelled) {
          setReports(Array.isArray(items) ? items : []);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError?.message || "Не удалось загрузить жалобы.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, serverId, statusFilter]);

  const updateStatus = async (reportId, nextStatus) => {
    try {
      setError("");
      const updated = await updateModerationReportStatus(reportId, nextStatus);
      setReports((previous) => previous.map((report) => (report.id === updated.id ? updated : report)));
      onStatus?.({ tone: "success", message: "Статус жалобы обновлен" });
    } catch (updateError) {
      setError(updateError?.message || "Не удалось обновить жалобу.");
    }
  };

  const muteTarget = async (report) => {
    try {
      setError("");
      await applyModerationAction(serverId, {
        targetUserId: report.targetUserId,
        actionType: "mute",
        reason: `report:${report.id}`,
        durationMinutes: 60,
      });
      await updateStatus(report.id, "actioned");
      onStatus?.({ tone: "success", message: "Пользователь замучен на 1 час" });
    } catch (muteError) {
      setError(muteError?.message || "Не удалось применить мут.");
    }
  };

  if (!serverId || !canManage) {
    return null;
  }

  return (
    <section className="moderation-panel">
      <div className="moderation-panel__toolbar">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="open">Открытые</option>
          <option value="reviewed">Проверенные</option>
          <option value="actioned">С действием</option>
          <option value="dismissed">Отклоненные</option>
        </select>
      </div>
      {error ? <div className="settings-error">{error}</div> : null}
      {loading ? <div className="settings-muted">Загрузка...</div> : null}
      {!loading && reports.length === 0 ? <div className="settings-muted">Жалоб нет.</div> : null}
      <div className="moderation-panel__list">
        {reports.map((report) => (
          <article className="moderation-panel__item" key={report.id}>
            <div className="moderation-panel__meta">
              <strong>{report.reason || "not_specified"}</strong>
              <span>#{report.messageId || "channel"} · target {report.targetUserId}</span>
            </div>
            <div className="moderation-panel__actions">
              <button type="button" onClick={() => updateStatus(report.id, "reviewed")}>Проверено</button>
              <button type="button" onClick={() => muteTarget(report)}>Мут 1ч</button>
              <button type="button" onClick={() => updateStatus(report.id, "dismissed")}>Отклонить</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatUpdateProgress(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  return `${Math.max(0, Math.min(100, Math.round(numericValue)))}%`;
}

export default function AppUpdateBanner({ state, onInstall, onRetry }) {
  if (!state || typeof state !== "object") {
    return null;
  }

  const status = String(state.status || "").trim().toLowerCase();
  if (!["checking", "available", "downloading", "downloaded", "error"].includes(status)) {
    return null;
  }

  const progressLabel = formatUpdateProgress(state.downloadProgress);
  const title = state.required ? "Обязательное обновление клиента" : "Обновление клиента";
  const message = String(state.message || "").trim();

  return (
    <div className={`app-update-banner app-update-banner--${status}`}>
      <div className="app-update-banner__copy">
        <strong>{title}</strong>
        <span>{message}</span>
        {status === "downloading" && progressLabel ? (
          <span className="app-update-banner__meta">Загрузка: {progressLabel}</span>
        ) : null}
        {status === "downloaded" && state.latestVersion ? (
          <span className="app-update-banner__meta">Готова версия {state.latestVersion}</span>
        ) : null}
      </div>

      <div className="app-update-banner__actions">
        {status === "downloaded" ? (
          <button type="button" className="app-update-banner__button" onClick={onInstall}>
            Перезапустить и установить
          </button>
        ) : null}

        {status === "error" ? (
          <button type="button" className="app-update-banner__button app-update-banner__button--ghost" onClick={onRetry}>
            Повторить
          </button>
        ) : null}
      </div>
    </div>
  );
}

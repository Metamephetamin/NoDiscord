import AnimatedAvatar from "./AnimatedAvatar";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import AnimatedMedia from "./AnimatedMedia";
import ServerInvitesPanel from "./ServerInvitesPanel";
import { emitInsertMentionRequest } from "../utils/textChatMentionInterop";
import PercentageSlider from "./PercentageSlider";
import { formatIntegrationActivityStatus } from "../utils/integrations";

const VoiceSwitch = ({ active, onClick, label }) => (
  <button
    type="button"
    className={`voice-switch ${active ? "voice-switch--active" : ""}`}
    onClick={onClick}
    aria-pressed={active}
    aria-label={label}
  >
    <span />
  </button>
);

const IntegrationBrandIcon = ({ provider, className = "" }) => {
  const providerId = provider?.id || "";
  const tone = provider?.meta?.tone || "#8b95ad";
  const label = provider?.name || provider?.meta?.label || providerId;

  const commonProps = {
    viewBox: "0 0 32 32",
    width: "24",
    height: "24",
    focusable: "false",
    "aria-hidden": "true",
  };

  return (
    <span className={`integration-brand-icon integration-brand-icon--${providerId} ${className}`} style={{ "--integration-color": tone }} title={label}>
      {providerId === "spotify" ? (
        <svg {...commonProps}>
          <circle cx="16" cy="16" r="15" fill="#1ed760" />
          <path d="M9 12.3c4.9-1.4 10.1-.9 14.2 1.5" fill="none" stroke="#101318" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M10.1 16.4c3.8-1 7.9-.6 11.1 1.2" fill="none" stroke="#101318" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M11.2 20.1c2.9-.7 5.8-.4 8.1.9" fill="none" stroke="#101318" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : null}
      {providerId === "steam" ? (
        <svg {...commonProps}>
          <circle cx="16" cy="16" r="15" fill="#171a21" />
          <circle cx="21.7" cy="11.1" r="4.1" fill="none" stroke="#ffffff" strokeWidth="2" />
          <circle cx="21.7" cy="11.1" r="1.5" fill="#ffffff" />
          <path d="M6.9 18.4l6.7 2.8 5-6.2" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="11.9" cy="21.4" r="3.7" fill="none" stroke="#ffffff" strokeWidth="2" />
        </svg>
      ) : null}
      {providerId === "battlenet" ? (
        <svg {...commonProps}>
          <rect width="32" height="32" rx="16" fill="#00aeff" />
          <path d="M9.5 20.9c3.4-9.4 9.8-13.9 13.7-10.9 3 2.3.5 8.6-5.7 12.4-5.4 3.3-9.6 1.8-8-1.5Z" fill="none" stroke="#07131f" strokeWidth="2" />
          <path d="M8.7 12c9.2 2.2 14.8 7.7 12.7 11.6-1.8 3.3-8.4 2.5-12.9-2.7-3.9-4.6-3.3-8.9.2-8.9Z" fill="none" stroke="#07131f" strokeWidth="2" />
          <path d="M22.3 8.7c-5.8 7.2-13.2 9.6-15.4 5.7-1.8-3.2 2.6-8.2 9.4-8.9 6-.6 8.9 2.6 6 3.2Z" fill="none" stroke="#07131f" strokeWidth="2" />
        </svg>
      ) : null}
      {providerId === "github" ? (
        <svg {...commonProps}>
          <rect width="32" height="32" rx="16" fill="#f0f6fc" />
          <path d="M16 6.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-2c-2.9.6-3.5-1.2-3.5-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.2-4.7-5.1 0-1.1.4-2 1-2.8-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.9 1.1.8-.2 1.6-.3 2.4-.3s1.6.1 2.4.3c2-1.4 2.9-1.1 2.9-1.1.6 1.4.2 2.5.1 2.8.6.7 1 1.7 1 2.8 0 4-2.4 4.8-4.7 5.1.4.3.7 1 .7 2v2.8c0 .3.2.6.7.5A9.5 9.5 0 0 0 16 6.5Z" fill="#0d1117" />
        </svg>
      ) : null}
      {providerId === "yandex_music" ? (
        <svg {...commonProps}>
          <rect width="32" height="32" rx="9" fill="#ffcc00" />
          <circle cx="16" cy="16" r="8.5" fill="#ef2e24" />
          <circle cx="16" cy="16" r="4.4" fill="#11131a" />
          <path d="M19.6 8.8v10.7a2.8 2.8 0 1 1-2-2.7v-8h2Z" fill="#11131a" />
        </svg>
      ) : null}
      {!["spotify", "steam", "battlenet", "github", "yandex_music"].includes(providerId) ? (
        <span className="integration-brand-icon__fallback">{String(label || "?").charAt(0).toUpperCase()}</span>
      ) : null}
    </span>
  );
};

const maskEmail = (value) => {
  const normalized = String(value || "").trim();
  const [name, domain] = normalized.split("@");
  if (!name || !domain) {
    return normalized || "Почта не указана";
  }

  return `${"*".repeat(Math.max(6, Math.min(12, name.length)))}@${domain}`;
};

const TotpAuthenticatorCard = ({
  isTotpEnabled,
  totpSetup,
  onTotpCodeChange,
  onStartTotpSetup,
  onVerifyTotpSetup,
  onDisableTotp,
}) => {
  const [qrState, setQrState] = useState({ uri: "", svg: "" });
  const isSetupOpen = Boolean(totpSetup?.secret || totpSetup?.otpauthUri);
  const statusLabel = isTotpEnabled ? "Подключён" : "Не подключён";
  const qrUri = String(totpSetup?.otpauthUri || "");
  const qrSvg = qrState.uri === qrUri ? qrState.svg : "";

  useEffect(() => {
    let isMounted = true;
    const uri = String(totpSetup?.otpauthUri || "");

    if (!uri) {
      return () => {
        isMounted = false;
      };
    }

    QRCode.toString(uri, {
      type: "svg",
      margin: 1,
      width: 156,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((svg) => {
        if (isMounted) {
          setQrState({ uri, svg });
        }
      })
      .catch(() => {
        if (isMounted) {
          setQrState({ uri, svg: "" });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [qrUri]);

  return (
    <section className={`totp-settings-card ${isSetupOpen ? "totp-settings-card--setup" : ""}`}>
      <div className="totp-settings-card__summary">
        <div className="totp-settings-card__title">
          <h3>Google Authenticator</h3>
          <span>{statusLabel}</span>
        </div>
        <p>Код из приложения будет запрашиваться при входе.</p>
        {!isSetupOpen && !isTotpEnabled ? (
          <button type="button" className="settings-inline-button" onClick={onStartTotpSetup} disabled={totpSetup?.isBusy}>
            {totpSetup?.isBusy ? "Готовим..." : "Подключить"}
          </button>
        ) : null}
        {!isSetupOpen && isTotpEnabled ? (
          <div className="totp-settings-card__inline-code">
            <input
              className="settings-input"
              inputMode="numeric"
              value={totpSetup?.code || ""}
              onChange={(event) => onTotpCodeChange?.(event.target.value)}
              maxLength={6}
              placeholder="123456"
            />
            <button type="button" className="settings-inline-button settings-inline-button--danger" onClick={onDisableTotp} disabled={totpSetup?.isBusy}>
              {totpSetup?.isBusy ? "Отключаем..." : "Отключить"}
            </button>
          </div>
        ) : null}
      </div>

      {isSetupOpen ? (
        <div className="totp-settings-card__setup">
          <div className="totp-settings-card__qr" aria-label="QR-код для Google Authenticator">
            {qrSvg ? <div dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <span>QR</span>}
          </div>
          <div className="totp-settings-card__setup-body">
            <span>Отсканируйте QR-код в Google Authenticator или добавьте ключ вручную.</span>
            <input className="settings-input totp-settings-card__secret" value={totpSetup?.secret || ""} readOnly />
            <div className="totp-settings-card__confirm">
              <input
                className="settings-input"
                inputMode="numeric"
                value={totpSetup?.code || ""}
                onChange={(event) => onTotpCodeChange?.(event.target.value)}
                maxLength={6}
                placeholder="123456"
              />
              <button type="button" className="settings-inline-button" onClick={onVerifyTotpSetup} disabled={totpSetup?.isBusy}>
                {totpSetup?.isBusy ? "Проверяем..." : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {totpSetup?.status ? <div className="profile-settings-form__status">{totpSetup.status}</div> : null}
    </section>
  );
};

export const AccountSettings = ({
  profileBackgroundSrc,
  profileBackgroundFrame,
  avatarSrc,
  avatarFrame,
  displayName,
  nickname,
  email,
  profileDraft,
  profileStatus,
  emailChangeState,
  isTotpEnabled,
  totpSetup,
  onTotpCodeChange,
  onOpenProfileSettings,
  onSaveProfile,
  onUpdateProfileDraft,
  onUpdateEmailChangeDraft,
  onStartEmailChange,
  onConfirmEmailChange,
  onStartTotpSetup,
  onVerifyTotpSetup,
  onDisableTotp,
  onLogout,
}) => {
  const [editingAccountField, setEditingAccountField] = useState("");
  const isEditingDisplayName = editingAccountField === "displayName";
  const isEditingNickname = editingAccountField === "nickname";
  const isEditingEmail = editingAccountField === "email" || emailChangeState?.awaitingCode;
  const normalizedDisplayName = String(displayName || "").trim();
  const normalizedNickname = String(nickname || "").trim();
  const shouldShowHeaderNickname = normalizedNickname && normalizedNickname !== normalizedDisplayName;

  return (
    <div className="settings-shell__content settings-shell__content--account">
      <div className="settings-shell__content-header">
        <div>
          <h2>Моя учётная запись</h2>
        </div>
      </div>

      <section className="account-settings-panel">
        <div className="account-settings-panel__cover" aria-hidden="true">
          {profileBackgroundSrc ? (
            <AnimatedMedia
              className="account-settings-panel__cover-media"
              src={profileBackgroundSrc}
              alt=""
              frame={profileBackgroundFrame}
            />
          ) : (
            <div className="account-settings-panel__cover-fallback" />
          )}
        </div>
        <div className="account-settings-panel__identity">
          <AnimatedAvatar className="account-settings-panel__avatar" src={avatarSrc} alt={displayName} frame={avatarFrame} />
          <div className="account-settings-panel__name">
            <strong>{displayName}</strong>
            {shouldShowHeaderNickname ? <span>{nickname}</span> : null}
          </div>
          <button type="button" className="settings-inline-button" onClick={onOpenProfileSettings}>
            Визуал профиля
          </button>
        </div>

        <section className="account-settings-card account-settings-card--rows">
          <div className="account-settings-row">
            <div className="account-settings-row__copy">
              <strong>Имя пользователя</strong>
              <span>{displayName}</span>
            </div>
            <button type="button" className="settings-inline-button" onClick={() => setEditingAccountField(isEditingDisplayName ? "" : "displayName")}>
              {isEditingDisplayName ? "Скрыть" : "Изменить"}
            </button>
          </div>
          {isEditingDisplayName ? (
            <form className="account-settings-row-editor" onSubmit={onSaveProfile}>
              <div className="account-settings-card__grid">
                <label className="account-settings-field">
                  <span>Имя</span>
                  <input
                    className="settings-input"
                    type="text"
                    value={profileDraft?.firstName || ""}
                    onChange={(event) => onUpdateProfileDraft?.("firstName", event.target.value)}
                  />
                </label>
                <label className="account-settings-field">
                  <span>Фамилия</span>
                  <input
                    className="settings-input"
                    type="text"
                    value={profileDraft?.lastName || ""}
                    onChange={(event) => onUpdateProfileDraft?.("lastName", event.target.value)}
                  />
                </label>
              </div>
              <button type="submit" className="settings-inline-button">Сохранить имя</button>
            </form>
          ) : null}

          <div className="account-settings-row">
            <div className="account-settings-row__copy">
              <strong>Отображаемое имя</strong>
              <span>{nickname || "Не указано"}</span>
            </div>
            <button type="button" className="settings-inline-button" onClick={() => setEditingAccountField(isEditingNickname ? "" : "nickname")}>
              {isEditingNickname ? "Скрыть" : "Изменить"}
            </button>
          </div>
          {isEditingNickname ? (
            <form className="account-settings-row-editor account-settings-row-editor--single" onSubmit={onSaveProfile}>
              <label className="account-settings-field">
                <span>Никнейм</span>
                <input
                  className="settings-input"
                  type="text"
                  value={profileDraft?.nickname || ""}
                  onChange={(event) => onUpdateProfileDraft?.("nickname", event.target.value)}
                />
              </label>
              <button type="submit" className="settings-inline-button">Сохранить ник</button>
            </form>
          ) : null}

          <div className="account-settings-row">
            <div className="account-settings-row__copy">
              <strong>Электронная почта</strong>
              <span>{maskEmail(email)}</span>
            </div>
            <button type="button" className="settings-inline-button" onClick={() => setEditingAccountField(isEditingEmail ? "" : "email")}>
              {isEditingEmail ? "Скрыть" : "Изменить"}
            </button>
          </div>
          {isEditingEmail ? (
            <div className="account-settings-row-editor account-settings-row-editor--email">
              <label className="account-settings-field">
                <span>Новая почта</span>
                <input
                  className="settings-input"
                  type="email"
                  value={emailChangeState?.email || ""}
                  onChange={(event) => onUpdateEmailChangeDraft?.("email", event.target.value)}
                />
              </label>
              {emailChangeState?.awaitingCode ? (
                <div className="account-settings-card__grid">
                  <label className="account-settings-field">
                    <span>Код из письма</span>
                    <input
                      className="settings-input"
                      inputMode="numeric"
                      value={emailChangeState?.code || ""}
                      onChange={(event) => onUpdateEmailChangeDraft?.("code", event.target.value)}
                      maxLength={6}
                      placeholder="123456"
                    />
                  </label>
                  {isTotpEnabled ? (
                    <label className="account-settings-field">
                      <span>Код Google Authenticator</span>
                      <input
                        className="settings-input"
                        inputMode="numeric"
                        value={emailChangeState?.totpCode || ""}
                        onChange={(event) => onUpdateEmailChangeDraft?.("totpCode", event.target.value)}
                        maxLength={6}
                        placeholder="123456"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              <div className="account-settings-row-editor__actions">
                <span>Для смены почты нужен код из письма{isTotpEnabled ? " и Google Authenticator" : ""}.</span>
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={emailChangeState?.awaitingCode ? onConfirmEmailChange : onStartEmailChange}
                  disabled={emailChangeState?.isBusy}
                >
                  {emailChangeState?.isBusy ? "Проверяем..." : emailChangeState?.awaitingCode ? "Подтвердить почту" : "Отправить код"}
                </button>
              </div>
            </div>
          ) : null}
          {profileStatus ? <div className="profile-settings-form__status">{profileStatus}</div> : null}
          {emailChangeState?.status ? <div className="profile-settings-form__status">{emailChangeState.status}</div> : null}
        </section>
      </section>

      <section className="account-settings-section">
        <h3>Пароль и аутентификация</h3>
        <button type="button" className="settings-inline-button" disabled>
          Изменить пароль
        </button>
        <TotpAuthenticatorCard
          isTotpEnabled={isTotpEnabled}
          totpSetup={totpSetup}
          onTotpCodeChange={onTotpCodeChange}
          onStartTotpSetup={onStartTotpSetup}
          onVerifyTotpSetup={onVerifyTotpSetup}
          onDisableTotp={onDisableTotp}
        />
      </section>

      <section className="account-settings-section account-settings-section--danger">
        <h3>Управление сессией</h3>
        <p>Выход завершит текущую сессию на этом устройстве.</p>
        <button type="button" className="settings-inline-button settings-inline-button--danger" onClick={onLogout}>
          Выйти из аккаунта
        </button>
      </section>
    </div>
  );
};

export const PersonalProfileSettings = ({
  profileBackgroundSrc,
  profileBackgroundFrame,
  avatarSrc,
  avatarFrame,
  displayName,
  email,
  onChangeAvatar,
  onChangeBackground,
}) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Личный профиль</h2>
        <p>Настройте только внешний вид профиля. Имя, никнейм и почта теперь находятся в учётной записи.</p>
      </div>
    </div>

    <section className="voice-settings-card voice-settings-card--profile">
      <div className="profile-settings-form">
        <div className="profile-settings-form__preview-card">
          <div className="profile-settings-form__cover">
            {profileBackgroundSrc ? (
              <AnimatedMedia
                className="profile-settings-form__cover-media"
                src={profileBackgroundSrc}
                alt=""
                frame={profileBackgroundFrame}
              />
            ) : (
              <div className="profile-settings-form__cover-fallback" aria-hidden="true" />
            )}
            <button type="button" className="settings-inline-button profile-settings-form__cover-action" onClick={onChangeBackground}>
              Сменить фон профиля
            </button>
          </div>

          <div className="profile-settings-form__preview-body">
            <button type="button" className="profile-settings-form__avatar-wrap profile-settings-form__avatar-wrap--interactive" onClick={onChangeAvatar}>
              <AnimatedAvatar className="profile-settings-form__avatar" src={avatarSrc} alt={displayName} frame={avatarFrame} />
            </button>
            <div className="profile-settings-form__identity">
              <strong>{displayName}</strong>
              <span>{email}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
);

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

export const DevicesSettings = ({
  deviceSessions,
  deviceSessionsLoading,
  deviceSessionsError,
  onRefreshSessions,
  onOpenQrScanner,
}) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Устройства</h2>
        <p>Подключайте новые устройства по QR-коду и проверяйте, где сейчас открыт ваш аккаунт.</p>
      </div>
      <div className="settings-shell__actions">
        <button type="button" className="settings-inline-button" onClick={onRefreshSessions} disabled={deviceSessionsLoading}>
          {deviceSessionsLoading ? "Обновляем..." : "Обновить"}
        </button>
        <button type="button" className="settings-inline-button device-connect-button" onClick={onOpenQrScanner}>
          Подключить устройство
        </button>
      </div>
    </div>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Подключение по QR</div>
      <div className="device-connect-guide">
        <div className="device-connect-guide__item">
          <strong>Из приложения</strong>
          <span>Нажмите кнопку выше, и мы сразу откроем внутреннюю камеру для сканирования QR-кода.</span>
        </div>
        <div className="device-connect-guide__item">
          <strong>Через обычную камеру телефона</strong>
          <span>Если вы уже отсканировали QR системной камерой, откроется только экран подтверждения входа без повторного запуска камеры.</span>
        </div>
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Активные сессии</div>

      {deviceSessionsError ? (
        <div className="profile-settings-form__status">{deviceSessionsError}</div>
      ) : null}

      {!deviceSessionsLoading && deviceSessions.length === 0 ? (
        <div className="settings-empty-state">
          <h3>Устройств пока нет</h3>
          <p>После входа на новом телефоне, планшете или компьютере он появится здесь автоматически.</p>
        </div>
      ) : (
        <div className="device-sessions-list">
          {deviceSessions.map((session) => (
            <div key={session.id} className={`device-session-card ${session.isCurrent ? "device-session-card--current" : ""}`}>
              <div className="device-session-card__row">
                <div className="device-session-card__copy">
                  <strong>{session.deviceLabel || "Устройство"}</strong>
                  <span>{session.userAgent || "Браузер"}</span>
                </div>
                {session.isCurrent ? <span className="device-session-card__badge">Это устройство</span> : null}
              </div>

              <div className="device-session-card__meta">
                <span>Последняя активность: {formatDeviceSessionDate(session.lastUsedAt) || "недавно"}</span>
                <span>Истекает: {formatDeviceSessionDate(session.expiresAt) || "позже"}</span>
                {session.lastIp ? <span>IP: {session.lastIp}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  </div>
);

export const IntegrationsSettings = ({
  integrations,
  integrationsLoading,
  integrationsStatus,
  integrationActionBusy,
  onConnectIntegration,
  onDisconnectIntegration,
  onToggleIntegrationSetting,
}) => {
  const connectedProviders = integrations.filter((provider) => provider.connected);
  const disconnectedProviders = integrations.filter((provider) => !provider.connected);

  return (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Интеграции</h2>
          <p>Добавьте учётные записи в профиль и показывайте музыку или игру в статусе.</p>
        </div>
      </div>

      <section className="integrations-connect-panel">
        <div>
          <strong>Добавьте учётные записи в свой профиль</strong>
          <span>Статус обновляется только после настоящего OAuth-подключения сервиса.</span>
        </div>
        <div className="integrations-connect-row" aria-label="Доступные интеграции">
          {disconnectedProviders.map((provider) => {
            const isBusy = integrationActionBusy === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                className="integrations-connect-button"
                onClick={() => onConnectIntegration(provider.id)}
                disabled={isBusy || integrationsLoading}
                aria-label={`Подключить ${provider.name}`}
                title={provider.oauthEnabled ? `Подключить ${provider.name}` : `${provider.name}: настоящее подключение ещё не добавлено`}
              >
                <IntegrationBrandIcon provider={provider} />
              </button>
            );
          })}
        </div>
      </section>

      {integrationsStatus ? <div className="profile-settings-form__status">{integrationsStatus}</div> : null}

      <div className="integrations-list">
        {connectedProviders.map((provider) => {
          const isBusy = integrationActionBusy === provider.id;
          const activityLabel = formatIntegrationActivityStatus(provider.activity);
          return (
            <section key={provider.id} className="integration-card integration-card--connected">
              <div className="integration-card__top">
                <div className="integration-card__main">
                  <IntegrationBrandIcon provider={provider} className="integration-brand-icon--large" />
                  <div className="integration-card__copy">
                    <strong>{provider.displayName || provider.name}</strong>
                    <span>{provider.name}</span>
                    {activityLabel ? <small>{activityLabel}</small> : null}
                  </div>
                </div>
                <button
                  type="button"
                  className="integration-card__remove"
                  onClick={() => onDisconnectIntegration(provider.id)}
                  disabled={isBusy}
                  aria-label={`Отключить ${provider.name}`}
                  title="Отключить"
                >
                  ×
                </button>
              </div>

              <div className="integration-card__toggles">
                <div className="voice-toggle-row voice-toggle-row--compact">
                  <div>
                    <strong>Отображать в профиле</strong>
                  </div>
                  <VoiceSwitch
                    active={provider.displayInProfile}
                    onClick={() => onToggleIntegrationSetting(provider.id, "displayInProfile", !provider.displayInProfile)}
                    label="Отображать интеграцию в профиле"
                  />
                </div>
                <div className="voice-toggle-row voice-toggle-row--compact">
                  <div>
                    <strong>Отображать {provider.name} как свой статус</strong>
                  </div>
                  <VoiceSwitch
                    active={provider.useAsStatus}
                    onClick={() => onToggleIntegrationSetting(provider.id, "useAsStatus", !provider.useAsStatus)}
                    label="Показывать активность как статус"
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export const VoiceSettingsPanel = ({
  audioInputDevices,
  audioOutputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputSelectionAvailable,
  micVolume,
  audioVolume,
  activeMicSettingsBars,
  isMicTestActive,
  noiseProfileOptions,
  noiseSuppressionMode,
  noiseSuppressionStrength,
  echoCancellationEnabled,
  autoInputSensitivity,
  onInputDeviceChange,
  onOutputDeviceChange,
  onMicVolumeChange,
  onAudioVolumeChange,
  onToggleMicTest,
  onNoiseProfileChange,
  onNoiseStrengthChange,
  onToggleEchoCancellation,
  onToggleAutoSensitivity,
}) => (
  <div className="settings-shell__content settings-shell__content--voice">
    <div className="settings-shell__content-header">
      <div>
        <h2>Голос и видео</h2>
        <p>Настройте микрофон, вывод и профиль обработки так, как в вашем макете.</p>
      </div>
    </div>

    <section className="voice-settings-card voice-settings-card--voice">
      <div className="voice-settings-card__title">Голос</div>
      <div className="voice-settings-grid">
        <label className="voice-settings-field">
          <span>Микрофон</span>
          <select className="voice-settings-select voice-settings-select--native" value={selectedInputDeviceId} onChange={(event) => onInputDeviceChange(event.target.value)}>
            {audioInputDevices.length > 0 ? audioInputDevices.map((device) => (
              <option key={device.id} value={device.id}>{device.label}</option>
            )) : <option value="">Системный микрофон</option>}
          </select>
          <span className="voice-settings-caption">Выбранное устройство ввода будет использоваться в звонке и при проверке.</span>
        </label>

        <label className="voice-settings-field">
          <span>Динамик</span>
          <select className="voice-settings-select voice-settings-select--native" value={selectedOutputDeviceId} onChange={(event) => onOutputDeviceChange(event.target.value)} disabled={!outputSelectionAvailable}>
            {audioOutputDevices.length > 0 ? audioOutputDevices.map((device) => (
              <option key={device.id} value={device.id}>{device.label}</option>
            )) : <option value="">Системный вывод</option>}
          </select>
          <span className="voice-settings-caption">
            {outputSelectionAvailable ? "Выход звука можно переключать прямо отсюда." : "Эта система пока не дает приложению переключать устройство вывода напрямую."}
          </span>
        </label>

        <label className="voice-settings-field voice-settings-field--volume">
          <span>Громкость микрофона</span>
          <PercentageSlider
            min={0}
            max={200}
            value={micVolume}
            onChange={(event) => onMicVolumeChange(Number(event.target.value))}
            ariaLabel="Громкость микрофона"
          />
        </label>
        <label className="voice-settings-field voice-settings-field--volume">
          <span>Громкость динамика</span>
          <PercentageSlider
            min={0}
            max={200}
            value={audioVolume}
            onChange={(event) => onAudioVolumeChange(Number(event.target.value))}
            ariaLabel="Громкость динамика"
          />
        </label>
      </div>

      <div className="voice-settings-meter">
        <button type="button" className="voice-settings-meter__button" onClick={onToggleMicTest}>
          {isMicTestActive ? "Остановить проверку" : "Проверка микрофона"}
        </button>
        <div className="voice-settings-meter__bars" aria-hidden="true">
          {Array.from({ length: 48 }).map((_, index) => (
            <span key={index} className={index < activeMicSettingsBars ? "is-active" : ""} />
          ))}
        </div>
      </div>

      <div className="voice-settings-help">
        Нужна помощь? Здесь собраны все быстрые настройки голоса, чтобы не вылезать из звонка.
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Профиль ввода</div>
      <div className="voice-profile-list">
        {noiseProfileOptions.map((option) => (
          <label key={option.id} className="voice-profile-option">
            <input type="radio" name="noiseProfile" checked={noiseSuppressionMode === option.id} onChange={() => onNoiseProfileChange(option.id)} />
            <span className="voice-profile-option__copy">
              <strong>{option.title}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="voice-settings-field voice-settings-field--noise-strength">
        <span>Сила шумоподавления</span>
        <PercentageSlider
          min={0}
          max={100}
          value={noiseSuppressionStrength}
          onChange={(event) => onNoiseStrengthChange(Number(event.target.value))}
          ariaLabel="Сила шумоподавления"
        />
        <span className="voice-settings-caption">0 — мягче и натуральнее, 100 — сильнее режет клавиатуру, мышь и удары по столу.</span>
      </label>

      <div className="voice-toggle-row voice-toggle-row--compact">
        <div>
          <strong>Эхоподавление</strong>
        </div>
        <VoiceSwitch active={echoCancellationEnabled} onClick={onToggleEchoCancellation} label="Эхоподавление" />
      </div>

      <div className="voice-toggle-row">
        <div>
          <strong>Автоматически определять чувствительность ввода</strong>
          <span>Система сама подстраивает порог срабатывания микрофона под текущий шум.</span>
        </div>
        <VoiceSwitch active={autoInputSensitivity} onClick={onToggleAutoSensitivity} label="Автоматическая чувствительность" />
      </div>
    </section>
  </div>
);

export const NotificationsSettings = ({
  directNotificationsEnabled,
  conversationNotificationsEnabled,
  serverNotificationsEnabled,
  directMessageSoundEnabled,
  directMessageSendSoundId,
  directMessageReceiveSoundId,
  notificationSoundEnabled,
  notificationSoundId,
  notificationSoundOptions,
  customNotificationSoundData,
  customNotificationSoundName,
  notificationSoundError,
  notificationSoundInputRef,
  onToggleDirectNotifications,
  onToggleConversationNotifications,
  onToggleServerNotifications,
  onToggleDirectMessageSound,
  onSendSoundChange,
  onReceiveSoundChange,
  onToggleNotificationSound,
  onNotificationSoundChange,
  onRemoveCustomNotificationSound,
  onCustomNotificationSoundChange,
  getDirectMessageSoundOptions,
}) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Уведомления</h2>
        <p>Настройте личные, групповые, серверные и звуковые уведомления так, как вам удобно.</p>
      </div>
    </div>

    <section className="voice-settings-card">
      <div className="voice-toggle-row">
        <div>
          <strong>Личные чаты</strong>
          <span>Показывать всплывающие уведомления, когда личный чат не открыт.</span>
        </div>
        <VoiceSwitch active={directNotificationsEnabled} onClick={onToggleDirectNotifications} label="Личные уведомления" />
      </div>

      <div className="voice-toggle-row">
        <div>
          <strong>Беседы</strong>
          <span>Показывать уведомления о новых сообщениях в беседах, когда они не открыты.</span>
        </div>
        <VoiceSwitch active={conversationNotificationsEnabled} onClick={onToggleConversationNotifications} label="Уведомления бесед" />
      </div>

      <div className="voice-toggle-row">
        <div>
          <strong>Серверные сообщения</strong>
          <span>Показывать уведомления о новых сообщениях в других текстовых каналах сервера.</span>
        </div>
        <VoiceSwitch active={serverNotificationsEnabled} onClick={onToggleServerNotifications} label="Серверные уведомления" />
      </div>

      <div className="voice-toggle-row">
        <div>
          <strong>Звуки личных сообщений</strong>
          <span>Отдельные send/receive звуки для DM в стиле iMessage, без замены серверных уведомлений.</span>
        </div>
        <VoiceSwitch active={directMessageSoundEnabled} onClick={onToggleDirectMessageSound} label="Звуки личных сообщений" />
      </div>

      <div className="voice-settings-field-grid">
        <label className="voice-settings-field voice-settings-field--stacked">
          <span>Отправка в DM</span>
          <select className="voice-settings-select voice-settings-select--native voice-settings-select--compact" value={directMessageSendSoundId} onChange={(event) => onSendSoundChange(event.target.value)} disabled={!directMessageSoundEnabled}>
            {getDirectMessageSoundOptions("send").map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="voice-settings-field voice-settings-field--stacked">
          <span>Получение в DM</span>
          <select className="voice-settings-select voice-settings-select--native voice-settings-select--compact" value={directMessageReceiveSoundId} onChange={(event) => onReceiveSoundChange(event.target.value)} disabled={!directMessageSoundEnabled}>
            {getDirectMessageSoundOptions("receive").map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="voice-toggle-row">
        <div>
          <strong>Звук уведомлений</strong>
          <span>Оставить визуальные тосты, но включать или выключать их звуковой сигнал отдельно.</span>
        </div>
        <VoiceSwitch active={notificationSoundEnabled} onClick={onToggleNotificationSound} label="Звук уведомлений" />
      </div>

      <label className="voice-settings-field voice-settings-field--stacked">
        <span>Звук уведомления</span>
        <select className="voice-settings-select voice-settings-select--native voice-settings-select--compact" value={notificationSoundId} onChange={(event) => onNotificationSoundChange(event.target.value)} disabled={!notificationSoundEnabled}>
          {notificationSoundOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <span className="voice-settings-caption">Можно оставить встроенный вариант или переключиться на свой файл ниже.</span>
      </label>

      <div className="voice-settings-field voice-settings-field--stacked">
        <span>Свой звук уведомления</span>
        <div className="settings-shell__actions">
          <button type="button" className="settings-inline-button" onClick={() => notificationSoundInputRef.current?.click()}>
            Выбрать MP3/WAV
          </button>
          {customNotificationSoundData ? (
            <button type="button" className="settings-inline-button settings-inline-button--ghost" onClick={onRemoveCustomNotificationSound}>
              Убрать файл
            </button>
          ) : null}
        </div>
        <input ref={notificationSoundInputRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="hidden-input" onChange={onCustomNotificationSoundChange} />
        <span className="voice-settings-caption">
          Можно выбрать только MP3 или WAV до 3 секунд.
          {customNotificationSoundName ? ` Сейчас выбран: ${customNotificationSoundName}.` : ""}
        </span>
        {notificationSoundError ? <span className="settings-inline-error">{notificationSoundError}</span> : null}
      </div>
    </section>
  </div>
);

export const AppearanceAccessibilitySettings = ({
  uiDensity,
  uiFontScale,
  uiReduceMotion,
  uiTouchTargetSize,
  onDensityChange,
  onFontScaleChange,
  onReduceMotionChange,
  onTouchTargetSizeChange,
}) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Внешний вид и доступность</h2>
        <p>Настройте плотность интерфейса, размер шрифта, размеры зон попадания и уровень анимаций под свой ритм работы.</p>
      </div>
    </div>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Плотность интерфейса</div>
      <div className="voice-profile-list">
        {[
          { id: "standard", title: "Стандартно", description: "Обычная плотность блоков и отступов." },
          { id: "compact", title: "Компактно", description: "Больше информации на экране и быстрее для ПК-навигации." },
        ].map((option) => (
          <label key={option.id} className="voice-profile-option">
            <input type="radio" name="uiDensity" checked={uiDensity === option.id} onChange={() => onDensityChange(option.id)} />
            <span className="voice-profile-option__copy">
              <strong>{option.title}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Размер текста</div>
      <div className="voice-profile-list">
        {[
          { id: "sm", title: "Чуть меньше", description: "Компактнее и плотнее для больших списков." },
          { id: "md", title: "Стандартный", description: "Сбалансированный базовый размер." },
          { id: "lg", title: "Крупнее", description: "Лучше читается и легче воспринимается." },
        ].map((option) => (
          <label key={option.id} className="voice-profile-option">
            <input type="radio" name="uiFontScale" checked={uiFontScale === option.id} onChange={() => onFontScaleChange(option.id)} />
            <span className="voice-profile-option__copy">
              <strong>{option.title}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Взаимодействие</div>
      <div className="voice-toggle-row voice-toggle-row--first">
        <div>
          <strong>Уменьшить анимации</strong>
          <span>Снижает движение интерфейса и делает переходы спокойнее.</span>
        </div>
        <VoiceSwitch active={uiReduceMotion} onClick={() => onReduceMotionChange((previous) => !previous)} label="Уменьшить анимации" />
      </div>

      <div className="voice-profile-list">
        {[
          { id: "standard", title: "Обычные зоны попадания", description: "Стандартные размеры кнопок и контролов." },
          { id: "large", title: "Увеличенные зоны попадания", description: "Кнопки и поля становятся чуть удобнее для касания." },
        ].map((option) => (
          <label key={option.id} className="voice-profile-option">
            <input type="radio" name="uiTouchTargetSize" checked={uiTouchTargetSize === option.id} onChange={() => onTouchTargetSizeChange(option.id)} />
            <span className="voice-profile-option__copy">
              <strong>{option.title}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  </div>
);

export const RolesSettings = ({ activeServer, currentServerRole, rolePermissionLabels }) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Роли и участники</h2>
        <p>Иерархия ролей, участники сервера и быстрый обзор прав без длинных полотен текста.</p>
      </div>
    </div>

    {!activeServer ? (
      <section className="voice-settings-card">
        <div className="settings-empty-state">
          <h3>Нет активного сервера</h3>
          <p>Когда сервер будет выбран, здесь появятся роли, участники и обзор прав.</p>
        </div>
      </section>
    ) : (
      <>
        <section className="voice-settings-card">
          <div className="settings-section__header">
            <h4>Роли</h4>
            <span className="settings-role-current">{currentServerRole?.name || "Member"}</span>
          </div>
          <div className="settings-list">
            {(activeServer?.roles || []).map((role) => (
              <div key={role.id} className="settings-list__row settings-list__row--stacked">
                <div className="settings-role-meta">
                  <span className="settings-role-badge" style={{ backgroundColor: role.color || "#7b89a8" }}>{role.name}</span>
                  <span className="settings-role-description">
                    {(role.permissions || []).length
                      ? role.permissions.map((permission) => rolePermissionLabels[permission] || permission).join(", ")
                      : "Базовый доступ"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="voice-settings-card">
          <div className="settings-section__header">
            <h4>Участники</h4>
            <span className="settings-role-current">{activeServer?.members?.length || 0}</span>
          </div>
          <div className="settings-list">
            {(activeServer?.members || []).map((member) => {
              const memberRole = activeServer?.roles?.find((role) => role.id === member.roleId);
              return (
                <div key={member.userId} className="settings-list__row settings-list__row--stacked">
                  <div className="settings-role-meta">
                    <span className="settings-member-name">{member.name}</span>
                    <span className="settings-role-description">{memberRole?.name || member.roleId || "Member"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </>
    )}
  </div>
);

export const ServerSettings = ({
  activeServer,
  user,
  canManageServer,
  canInviteMembers,
  isDefaultServer,
  currentUserId,
  voiceParticipantByUserId,
  defaultServerIcon,
  icons,
  onServerNameChange,
  onServerDescriptionChange,
  onChangeServerIcon,
  onDeleteServer,
  canManageTargetMember,
  canAssignRoleToMember,
  onOpenMemberActionsMenu,
  onSyncServerSnapshot,
  onImportServer,
  onServerShared,
}) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Сервер</h2>
        <p>Быстрые настройки сервера без отдельного всплывающего окна на каждое действие.</p>
      </div>
    </div>

    {!activeServer ? (
      <section className="voice-settings-card">
        <div className="settings-empty-state">
          <h3>Сервер не выбран</h3>
          <p>Создайте сервер или присоединитесь по приглашению, и здесь появятся его настройки.</p>
        </div>
      </section>
    ) : (
      <>
        <section className="voice-settings-card">
          <div className="settings-server-card settings-server-card--shell">
            {activeServer?.icon ? (
              <AnimatedAvatar className="settings-server-card__icon" src={activeServer.icon} fallback={defaultServerIcon} alt={activeServer?.name || "Без названия"} />
            ) : (
              <div className="settings-server-card__icon settings-server-card__icon--empty" aria-hidden="true" />
            )}
            <label className="voice-settings-field voice-settings-field--stacked voice-settings-field--grow">
              <span>Название сервера</span>
              <input className="settings-input" type="text" value={activeServer?.name || ""} onChange={(event) => onServerNameChange(event.target.value)} disabled={!canManageServer} />
            </label>
          </div>

          <label className="voice-settings-field voice-settings-field--stacked voice-settings-field--grow">
            <span>Описание сервера</span>
            <textarea
              className="settings-input settings-input--textarea"
              value={activeServer?.description || ""}
              onChange={(event) => onServerDescriptionChange(event.target.value)}
              placeholder="Коротко опишите, для чего нужен этот сервер."
              maxLength={280}
              rows={4}
              disabled={!canManageServer}
            />
            <span className="voice-settings-caption">Это описание увидят люди, которые откроют ссылку-приглашение.</span>
          </label>

          <div className="settings-shell__actions">
            <button type="button" className="settings-inline-button" onClick={onChangeServerIcon}>Сменить картинку</button>
            <button type="button" className="settings-inline-button settings-inline-button--danger" onClick={() => onDeleteServer(activeServer?.id)} disabled={!canManageServer}>Удалить сервер</button>
          </div>
        </section>

        <section className="voice-settings-card">
          <div className="settings-section__header">
            <h4>Участники сервера</h4>
            <span className="settings-role-current">{activeServer?.members?.length || 0}</span>
          </div>
          <div className="settings-list">
            {(activeServer?.members || []).map((member) => {
              const memberRole = activeServer?.roles?.find((role) => role.id === member.roleId);
              const memberVoiceState = voiceParticipantByUserId.get(String(member.userId));
              const canRenameMember = canManageTargetMember(activeServer, currentUserId, member.userId, "manage_nicknames");
              const canMuteMember = canManageTargetMember(activeServer, currentUserId, member.userId, "mute_members");
              const canDeafenMember = canManageTargetMember(activeServer, currentUserId, member.userId, "deafen_members");
              const canManageMemberRoles = (activeServer?.roles || []).some((role) =>
                canAssignRoleToMember(activeServer, currentUserId, member.userId, role.id)
              );
              const canOpenMemberMenu = canRenameMember || canMuteMember || canDeafenMember || canManageMemberRoles;

              return (
                <div key={member.userId} className="server-members-panel__item server-members-panel__item--settings">
                  <AnimatedAvatar className="server-members-panel__avatar" src={member.avatar} alt={member.name} />
                  <div className="server-members-panel__meta">
                    <button
                      type="button"
                      className="server-members-panel__name server-members-panel__name--interactive"
                      onClick={() => emitInsertMentionRequest({
                        type: "user",
                        userId: member.userId,
                        displayName: member.name,
                      })}
                    >
                      <span className="server-members-panel__role-dot" style={{ backgroundColor: memberRole?.color || "#7b89a8" }} aria-hidden="true" />
                      {member.name}
                    </button>
                    <span className="server-members-panel__role">{memberRole?.name || "Member"}</span>
                  </div>
                  <div className="server-members-panel__indicators">
                    {memberVoiceState?.isMicMuted ? (
                      <span className="server-members-panel__voice-flag server-members-panel__voice-flag--slashed" title="Микрофон выключен">
                        <img src={icons.microphone} alt="" />
                      </span>
                    ) : null}
                    {memberVoiceState?.isDeafened ? (
                      <span className="server-members-panel__voice-flag server-members-panel__voice-flag--slashed" title="Не слышит участников">
                        <img src={icons.headphones} alt="" />
                      </span>
                    ) : null}
                    {canOpenMemberMenu ? (
                      <button type="button" className="server-members-panel__gear" aria-label={`Управление участником ${member.name}`} onClick={(event) => onOpenMemberActionsMenu(event, member)}>
                        <img src={icons.settings} alt="" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="voice-settings-card">
          <div className="settings-section__header">
            <h4>Приглашения</h4>
            <span className="settings-role-current">Invite</span>
          </div>
          <ServerInvitesPanel
            activeServer={activeServer}
            user={user}
            canInvite={canInviteMembers && !isDefaultServer}
            onBeforeCreateInvite={onSyncServerSnapshot}
            onImportServer={onImportServer}
            onServerShared={onServerShared}
          />
        </section>
      </>
    )}
  </div>
);

export const MobileSettingsShell = ({
  activeSettingsTabMeta,
  userAvatarSrc,
  userAvatarFrame,
  displayName,
  email,
  navItems,
  settingsTab,
  onClose,
  onSelectTab,
  children,
}) => (
  <div className="settings-mobile-shell">
    <div className="settings-mobile-shell__header">
      <div className="settings-mobile-shell__header-copy">
        <strong>{activeSettingsTabMeta?.label || "Настройки"}</strong>
        <span>{activeSettingsTabMeta?.section || "Параметры приложения"}</span>
      </div>
      <button type="button" className="settings-mobile-shell__close" onClick={onClose}>
        Готово
      </button>
    </div>

    <div className="settings-mobile-shell__profile">
      <AnimatedAvatar className="settings-mobile-shell__avatar" src={userAvatarSrc} alt={displayName} frame={userAvatarFrame} />
      <div className="settings-mobile-shell__profile-copy">
        <strong>{displayName}</strong>
        <span>{email || "Ваш аккаунт Tend"}</span>
      </div>
    </div>

    <div className="settings-mobile-shell__tabs" role="tablist" aria-label="Разделы настроек">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={settingsTab === item.id}
          className={`settings-mobile-shell__tab ${settingsTab === item.id ? "settings-mobile-shell__tab--active" : ""}`}
          onClick={() => onSelectTab(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>

    <div className="settings-mobile-shell__body">
      {children}
    </div>
  </div>
);

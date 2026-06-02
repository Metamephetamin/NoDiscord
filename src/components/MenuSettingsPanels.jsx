import AnimatedAvatar from "./AnimatedAvatar";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import AnimatedMedia from "./AnimatedMedia";
import AdminReportDecisionDialog from "./AdminReportDecisionDialog";
import ServerInvitesPanel from "./ServerInvitesPanel";
import "../css/AdminSecurity.css";
import "../css/MenuVoiceProfileSettings.css";
import "../css/MenuAccountSettings.css";
import { emitInsertMentionRequest } from "../utils/textChatMentionInterop";
import PercentageSlider from "./PercentageSlider";
import { formatIntegrationActivityStatus } from "../utils/integrations";
import {
  PROFILE_AVATAR_FRAME_OPTIONS,
  PROFILE_STORE_FEATURED_ITEMS,
  applyProfileStoreItem,
  getProfileCustomPalette,
  getProfileCustomizationClassName,
  getProfileCustomizationStyle,
  getProfileStoreItemById,
  updateProfileAvatarFrame,
  updateProfileCustomPalette,
} from "../utils/profileCustomization";
import { APP_LOGO_OPTIONS } from "../utils/appLogo";
import { UI_THEME_OPTIONS } from "../utils/uiTheme.mjs";
import { CHAT_BACKGROUND_FIT_OPTIONS, CHAT_THEME_OPTIONS, resolveChatBackgroundFit } from "../utils/chatTheme.mjs";
import { API_BASE_URL, API_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, getStoredRefreshToken, parseApiResponse } from "../utils/auth";
import { MAX_SERVER_NAME_LENGTH } from "../utils/menuMainModel";
import { DEVICE_SESSION_REFRESH_TOKEN_HEADER } from "../features/menu-main/menuMainControllerUtils";
import {
  APP_CACHE_LIMIT_OPTIONS,
  clearAppCacheStorage,
  enforceAppCachePolicy,
  formatStorageBytes,
  getAppStorageUsage,
  getStorageUsagePercent,
  readAppCachePolicy,
  shouldAutoClearAppCache,
  writeAppCachePolicy,
} from "../utils/appStorageUsage.mjs";
import AccountSessionsPanel from "../features/account-security/AccountSessionsPanel";

function buildCurrentSessionHeaders(extraHeaders = {}) {
  const refreshToken = getStoredRefreshToken();
  return refreshToken
    ? { ...extraHeaders, [DEVICE_SESSION_REFRESH_TOKEN_HEADER]: refreshToken }
    : extraHeaders;
}

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

const PROFILE_PREVIEW_ICON_PATHS = {
  about: (
    <>
      <path d="M8 9.2h8" />
      <path d="M8 13h5.5" />
      <path d="M6.5 19.5h11a2 2 0 0 0 2-2v-11a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z" />
    </>
  ),
  info: (
    <>
      <path d="M12 10.5v5" />
      <path d="M12 7.4h.01" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </>
  ),
  common: (
    <>
      <path d="M8.5 11.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" />
      <path d="M15.8 10.5a2.7 2.7 0 1 0 0-5.4" />
      <path d="M3.7 19.1c.7-2.8 2.4-4.2 4.8-4.2s4.1 1.4 4.8 4.2" />
      <path d="M13.9 15.2c2.3.2 3.8 1.5 4.4 3.9" />
    </>
  ),
  activity: <path d="M4 13.2h4.1l2.2-6.4 3.4 10.4 2.1-4h4.2" />,
  contact: (
    <>
      <path d="M5 7.8 12 12l7-4.2" />
      <path d="M5.8 6h12.4A1.8 1.8 0 0 1 20 7.8v8.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 16.2V7.8A1.8 1.8 0 0 1 5.8 6Z" />
    </>
  ),
  id: (
    <>
      <path d="M9 7.5 7.8 16.5" />
      <path d="M16.2 7.5 15 16.5" />
      <path d="M6.8 10h11" />
      <path d="M6 14h11" />
    </>
  ),
  message: (
    <>
      <path d="M6.5 17.5 4 20V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V15a2.5 2.5 0 0 1-2.5 2.5h-11Z" />
      <path d="M8 9h8" />
      <path d="M8 12.5h5.5" />
    </>
  ),
  call: <path d="M7.2 4.8 9.5 7c.6.6.7 1.5.2 2.2l-.8 1.1a10.5 10.5 0 0 0 4.8 4.8l1.1-.8c.7-.5 1.6-.4 2.2.2l2.2 2.3c.5.5.6 1.3.2 1.9-.7 1.1-1.9 1.8-3.2 1.5C10 19 5 14 3.8 7.8c-.3-1.3.4-2.5 1.5-3.2.6-.4 1.4-.3 1.9.2Z" />,
  copy: (
    <>
      <path d="M8 8.5V6.8A2.8 2.8 0 0 1 10.8 4h6.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8h-1.7" />
      <path d="M6.8 8h6.4A2.8 2.8 0 0 1 16 10.8v6.4A2.8 2.8 0 0 1 13.2 20H6.8A2.8 2.8 0 0 1 4 17.2v-6.4A2.8 2.8 0 0 1 6.8 8Z" />
    </>
  ),
};

const ProfilePreviewIcon = ({ kind, className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {PROFILE_PREVIEW_ICON_PATHS[kind] || PROFILE_PREVIEW_ICON_PATHS.info}
  </svg>
);

const ProfilePreviewSectionIcon = ({ kind }) => (
  <span className={`profile-settings-form__public-section-icon profile-settings-form__public-section-icon--${kind}`} aria-hidden="true">
    <ProfilePreviewIcon kind={kind} className="profile-settings-form__public-section-svg" />
  </span>
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

const HIDDEN_SETTINGS_INTEGRATION_PROVIDER_IDS = new Set(["battlenet", "yandex_music"]);

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
  onTotpResetPasswordChange,
  onTotpResetCodeChange,
  onStartTotpSetup,
  onVerifyTotpSetup,
  onDisableTotp,
  onRequestTotpResetCode,
  onResetTotp,
}) => {
  const [qrState, setQrState] = useState({ uri: "", svg: "" });
  const [enabledAction, setEnabledAction] = useState("");
  const isSetupOpen = Boolean(totpSetup?.secret || totpSetup?.otpauthUri);
  const statusLabel = isTotpEnabled ? "Подключён" : "Не подключён";
  const qrUri = String(totpSetup?.otpauthUri || "");
  const qrSvg = qrState.uri === qrUri ? qrState.svg : "";
  const activeEnabledAction = isTotpEnabled && !isSetupOpen && totpSetup?.resetRequested ? "reset" : enabledAction;

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
          <div className="totp-settings-card__enabled-actions">
            {!activeEnabledAction ? (
              <button
                type="button"
                className="settings-inline-button settings-inline-button--danger"
                onClick={() => setEnabledAction("disable")}
                disabled={totpSetup?.isBusy}
              >
                Отключить
              </button>
            ) : null}

            {activeEnabledAction === "disable" ? (
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
                <button type="button" className="settings-inline-button" onClick={() => setEnabledAction("reset")} disabled={totpSetup?.isBusy}>
                  Нет кода
                </button>
                <button type="button" className="settings-inline-button" onClick={() => setEnabledAction("")} disabled={totpSetup?.isBusy}>
                  Отмена
                </button>
              </div>
            ) : null}

            {activeEnabledAction === "reset" ? (
              <div className="totp-settings-card__reset">
                <input
                  className="settings-input"
                  type="password"
                  value={totpSetup?.resetPassword || ""}
                  onChange={(event) => onTotpResetPasswordChange?.(event.target.value)}
                  placeholder="Пароль"
                  autoComplete="current-password"
                />
                {totpSetup?.resetRequested ? (
                  <input
                    className="settings-input"
                    inputMode="numeric"
                    value={totpSetup?.resetCode || ""}
                    onChange={(event) => onTotpResetCodeChange?.(event.target.value)}
                    maxLength={6}
                    placeholder="Код из письма"
                  />
                ) : null}
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={totpSetup?.resetRequested ? onResetTotp : onRequestTotpResetCode}
                  disabled={totpSetup?.isBusy}
                >
                  {totpSetup?.isBusy ? "Проверяем..." : totpSetup?.resetRequested ? "Сбросить" : "Код на почту"}
                </button>
                <button type="button" className="settings-inline-button" onClick={() => setEnabledAction("")} disabled={totpSetup?.isBusy}>
                  Отмена
                </button>
              </div>
            ) : null}
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
  accountName,
  displayName,
  nickname,
  email,
  profileDraft,
  profileStatus,
  maxProfileStatusLength,
  maxNicknameLength,
  emailChangeState,
  locationSharing,
  isTotpEnabled,
  totpSetup,
  onTotpCodeChange,
  onTotpResetPasswordChange,
  onTotpResetCodeChange,
  onSaveProfile,
  onUpdateProfileDraft,
  onUpdateEmailChangeDraft,
  onToggleLocationSharing,
  onStartEmailChange,
  onConfirmEmailChange,
  onStartTotpSetup,
  onVerifyTotpSetup,
  onDisableTotp,
  onRequestTotpResetCode,
  onResetTotp,
  onLogout,
}) => {
  const [editingAccountField, setEditingAccountField] = useState("");
  const isEditingDisplayName = editingAccountField === "displayName";
  const isEditingNickname = editingAccountField === "nickname";
  const isEditingEmail = editingAccountField === "email" || emailChangeState?.awaitingCode;
  const normalizedAccountName = String(accountName || "").trim();
  const normalizedNickname = String(nickname || "").trim();
  const headerDisplayName = normalizedNickname || normalizedAccountName || displayName;
  const isLocationSharingEnabled = Boolean(locationSharing?.enabled);

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
          <AnimatedAvatar className="account-settings-panel__avatar" src={avatarSrc} alt={headerDisplayName} frame={avatarFrame} />
          <div className="account-settings-panel__name">
            <strong>{headerDisplayName}</strong>
          </div>
        </div>

        <section className="account-settings-card account-settings-card--rows">
          <div className="account-settings-row">
            <div className="account-settings-row__copy">
              <strong>Имя пользователя</strong>
              <span>{normalizedAccountName || "Не указано"}</span>
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
                  maxLength={maxNicknameLength}
                />
              </label>
              <button type="submit" className="settings-inline-button">Сохранить ник</button>
            </form>
          ) : null}

          <div className="account-settings-row">
            <div className="account-settings-row__copy">
              <strong>Статус</strong>
              <span>{profileDraft?.profileStatus || "Не указан"}</span>
            </div>
            <button type="button" className="settings-inline-button" onClick={() => setEditingAccountField(editingAccountField === "profileStatus" ? "" : "profileStatus")}>
              {editingAccountField === "profileStatus" ? "Скрыть" : "Изменить"}
            </button>
          </div>
          {editingAccountField === "profileStatus" ? (
            <form className="account-settings-row-editor account-settings-row-editor--single" onSubmit={onSaveProfile}>
              <label className="account-settings-field">
                <span>Текст под никнеймом</span>
                <input
                  className="settings-input"
                  type="text"
                  value={profileDraft?.profileStatus || ""}
                  onChange={(event) => onUpdateProfileDraft?.("profileStatus", event.target.value)}
                  maxLength={maxProfileStatusLength}
                  placeholder="Например: работаю над проектом"
                />
              </label>
              <button type="submit" className="settings-inline-button">Сохранить статус</button>
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
        <h3>Геопозиция</h3>
        <div className="voice-toggle-row">
          <div>
            <strong>Показывать меня на карте</strong>
            <span>Твоё местоположение видно пользователям Lanaya, если геопозиция включена.</span>
          </div>
          <VoiceSwitch
            active={isLocationSharingEnabled}
            onClick={() => onToggleLocationSharing?.(!isLocationSharingEnabled)}
            label="Показывать меня на карте"
          />
        </div>
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
          onTotpResetPasswordChange={onTotpResetPasswordChange}
          onTotpResetCodeChange={onTotpResetCodeChange}
          onStartTotpSetup={onStartTotpSetup}
          onVerifyTotpSetup={onVerifyTotpSetup}
          onDisableTotp={onDisableTotp}
          onRequestTotpResetCode={onRequestTotpResetCode}
          onResetTotp={onResetTotp}
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

const COMPANY_WORK_EMAIL = "andrey1689123pro@gmail.com";
const COMPANY_TELEGRAM_HANDLE = "zzzCHUL";
const COMPANY_PROFILE_PHOTO_SRC = "/image/company-profile-photo.png";

const writeClipboardFallback = (value) => {
  if (typeof document === "undefined") {
    return false;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
};

export const ProductCompanyInfoSettings = () => {
  const [copiedContact, setCopiedContact] = useState("");
  const [isProfilePhotoMissing, setIsProfilePhotoMissing] = useState(false);

  const copyCompanyContact = async (value, label) => {
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(value);
      } else if (!writeClipboardFallback(value)) {
        throw new Error("Clipboard fallback failed");
      }
      setCopiedContact(label);
    } catch {
      if (writeClipboardFallback(value)) {
        setCopiedContact(label);
      } else {
        setCopiedContact("Ошибка копирования");
      }
    }
  };

  useEffect(() => {
    if (!copiedContact) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setCopiedContact(""), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copiedContact]);

  return (
    <div className="settings-shell__content settings-shell__content--company-info">
      <section className="account-settings-section company-info-panel" aria-label="О Lanaya">
        <div className="company-info-panel__mark" aria-hidden="true">
          {isProfilePhotoMissing ? (
            <span className="company-info-panel__photo-fallback">A</span>
          ) : (
            <img
              className="company-info-panel__photo"
              src={COMPANY_PROFILE_PHOTO_SRC}
              alt=""
              onError={() => setIsProfilePhotoMissing(true)}
            />
          )}
        </div>
        <h2>Lanaya</h2>
        <p>
          Lanaya — приложение для общения с личными чатами, серверами, голосовыми комнатами и звонками.
          Здесь можно переписываться, собирать сообщества и общаться голосом в реальном времени.
        </p>
        <dl className="company-info-panel__facts">
          <div>
            <dt>Почта</dt>
            <dd>
              <button type="button" onClick={() => copyCompanyContact(COMPANY_WORK_EMAIL, "почта")}>
                {COMPANY_WORK_EMAIL}
              </button>
            </dd>
          </div>
          <div>
            <dt>Telegram</dt>
            <dd>
              <button type="button" onClick={() => copyCompanyContact(COMPANY_TELEGRAM_HANDLE, "Telegram")}>
                @{COMPANY_TELEGRAM_HANDLE}
              </button>
            </dd>
          </div>
        </dl>
        <div className={`company-info-panel__toast ${copiedContact ? "company-info-panel__toast--visible" : ""}`} role="status" aria-live="polite">
          {copiedContact === "Ошибка копирования" ? copiedContact : copiedContact ? `Скопировано: ${copiedContact}` : "Скопировано"}
        </div>
      </section>
    </div>
  );
};

export const MemorySettings = () => {
  const [storageUsage, setStorageUsage] = useState(null);
  const [storageStatus, setStorageStatus] = useState("loading");
  const [storageError, setStorageError] = useState("");
  const [appCachePolicy, setAppCachePolicy] = useState(() => readAppCachePolicy());
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isApplyingCachePolicy, setIsApplyingCachePolicy] = useState(false);

  const loadStorageUsage = async ({ applyPolicy = true } = {}) => {
    setStorageStatus("loading");
    setStorageError("");

    try {
      const usage = await getAppStorageUsage();
      if (applyPolicy && shouldAutoClearAppCache(appCachePolicy, usage)) {
        setIsApplyingCachePolicy(true);
        const result = await enforceAppCachePolicy({ policy: appCachePolicy, usage });
        setStorageUsage(result.usage || usage);
        setStorageStatus(result.cleared ? "auto-cleared" : "ready");
        setIsApplyingCachePolicy(false);
        return;
      }

      setStorageUsage(usage);
      setStorageStatus("ready");
    } catch (error) {
      setStorageUsage(null);
      setStorageStatus("error");
      setStorageError(error?.message || "Не удалось посчитать память приложения.");
      setIsApplyingCachePolicy(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setStorageStatus("loading");
      setStorageError("");

      try {
        const usage = await getAppStorageUsage();
        if (isMounted) {
          if (shouldAutoClearAppCache(appCachePolicy, usage)) {
            setIsApplyingCachePolicy(true);
            const result = await enforceAppCachePolicy({ policy: appCachePolicy, usage });
            if (isMounted) {
              setStorageUsage(result.usage || usage);
              setStorageStatus(result.cleared ? "auto-cleared" : "ready");
              setIsApplyingCachePolicy(false);
            }
            return;
          }

          setStorageUsage(usage);
          setStorageStatus("ready");
        }
      } catch (error) {
        if (isMounted) {
          setStorageUsage(null);
          setStorageStatus("error");
          setStorageError(error?.message || "Не удалось посчитать память приложения.");
          setIsApplyingCachePolicy(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [appCachePolicy]);

  const clearCache = async () => {
    setIsClearingCache(true);
    setStorageError("");

    try {
      await clearAppCacheStorage();
      setStorageStatus("cleared");
      setStorageUsage((previous) => previous ? { ...previous, cacheBytes: 0, indexedDbCacheBytes: 0 } : previous);
      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (error) {
      setStorageStatus("error");
      setStorageError(error?.message || "Не удалось очистить кеш.");
      setIsClearingCache(false);
    }
  };

  const updateAppCachePolicy = async (partialPolicy) => {
    const nextPolicy = writeAppCachePolicy({
      ...appCachePolicy,
      ...partialPolicy,
    });
    setAppCachePolicy(nextPolicy);
    setStorageStatus("policy-updated");
    setStorageError("");

    if (!storageUsage || !shouldAutoClearAppCache(nextPolicy, storageUsage)) {
      return;
    }

    setIsApplyingCachePolicy(true);
    try {
      const result = await enforceAppCachePolicy({ policy: nextPolicy, usage: storageUsage });
      setStorageUsage(result.usage || storageUsage);
      setStorageStatus(result.cleared ? "auto-cleared" : "policy-updated");
    } catch (error) {
      setStorageStatus("error");
      setStorageError(error?.message || "Не удалось применить лимит кеша.");
    } finally {
      setIsApplyingCachePolicy(false);
    }
  };

  const usageRows = storageUsage ? [
    {
      label: "Кеш",
      value: formatStorageBytes(storageUsage.cacheBytes),
      tone: "cache",
    },
    {
      label: "Данные приложения",
      value: formatStorageBytes(storageUsage.appDataBytes),
      tone: "data",
    },
    {
      label: "Локальные настройки",
      value: formatStorageBytes((storageUsage.localStorageBytes || 0) + (storageUsage.sessionStorageBytes || 0)),
      tone: "local",
    },
    {
      label: "Доступно хранилища",
      value: storageUsage.quotaBytes ? formatStorageBytes(storageUsage.quotaBytes) : "нет данных",
      tone: "quota",
    },
  ] : [];
  const usagePercent = storageUsage ? getStorageUsagePercent(storageUsage.totalBytes, storageUsage.quotaBytes) : 0;
  const statusText =
    storageStatus === "loading"
      ? "Считаем память..."
      : storageStatus === "cleared"
        ? "Кеш очищен. Обновляем страницу..."
        : storageStatus === "auto-cleared"
          ? "Кеш превысил лимит и был очищен автоматически."
          : storageStatus === "policy-updated"
            ? "Настройки автоочистки сохранены."
        : storageError || "Память обновлена.";
  const cacheControlsDisabled = storageStatus === "loading" || isClearingCache || isApplyingCachePolicy;

  return (
    <div className="settings-shell__content settings-shell__content--memory">
      <div className="settings-shell__content-header">
        <div>
          <h2>Память</h2>
          <p>Размер приложения, кеша и локальных данных на этом устройстве.</p>
        </div>
      </div>

      <section className="voice-settings-card memory-settings-card memory-settings-card--hero">
        <div className="memory-settings-card__main">
          <span>Занято приложением</span>
          <strong>{storageUsage ? formatStorageBytes(storageUsage.totalBytes) : "считаем..."}</strong>
          <small>{storageUsage?.desktopAvailable ? "Данные Electron и кеш интерфейса" : "Данные браузера и интерфейса"}</small>
        </div>
        <div className="memory-settings-card__meter" aria-hidden="true">
          <span style={{ width: `${usagePercent}%` }} />
        </div>
      </section>

      <section className="memory-settings-grid" aria-label="Детали памяти">
        {usageRows.map((row) => (
          <div key={row.label} className={`memory-settings-tile memory-settings-tile--${row.tone}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </section>

      <section className="voice-settings-card memory-settings-card memory-settings-card--policy">
        <div>
          <div className="voice-settings-card__title">Автоочистка кеша</div>
          <p>Если кеш станет больше выбранного лимита, приложение само удалит временные данные и кеш чата.</p>
        </div>
        <div className="memory-settings-policy">
          <div className="voice-toggle-row voice-toggle-row--compact memory-settings-policy__toggle">
            <div>
              <strong>Автоочистка</strong>
              <span>{appCachePolicy.autoClearEnabled ? "включена" : "выключена"}</span>
            </div>
            <VoiceSwitch
              active={appCachePolicy.autoClearEnabled}
              onClick={() => {
                void updateAppCachePolicy({ autoClearEnabled: !appCachePolicy.autoClearEnabled });
              }}
              label="Автоочистка кеша"
            />
          </div>
          <label className="memory-settings-policy__limit">
            <span>Максимум кеша</span>
            <select
              className="voice-settings-select voice-settings-select--native"
              value={appCachePolicy.maxCacheBytes}
              onChange={(event) => {
                void updateAppCachePolicy({ maxCacheBytes: Number(event.target.value) });
              }}
              disabled={cacheControlsDisabled}
            >
              {APP_CACHE_LIMIT_OPTIONS.map((limitBytes) => (
                <option key={limitBytes} value={limitBytes}>{formatStorageBytes(limitBytes)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="voice-settings-card memory-settings-card memory-settings-card--actions">
        <div>
          <div className="voice-settings-card__title">Очистка кеша</div>
          <p>Удаляются временные файлы, HTTP-кеш, Cache API и локальный кеш чата. Вход, профиль и настройки остаются на месте.</p>
          <span className="memory-settings-card__status" aria-live="polite">{statusText}</span>
        </div>
        <div className="memory-settings-card__buttons">
          <button type="button" className="settings-inline-button" onClick={() => { void loadStorageUsage(); }} disabled={cacheControlsDisabled}>
            {isApplyingCachePolicy ? "Проверяем..." : "Обновить"}
          </button>
          <button type="button" className="settings-inline-button settings-inline-button--danger" onClick={clearCache} disabled={cacheControlsDisabled}>
            {isClearingCache ? "Очищаем..." : "Очистить кеш"}
          </button>
        </div>
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
  profileCustomization,
  profileStatus,
  onProfileCustomizationChange,
  onChangeAvatar,
  onChangeBackground,
  onResetCustomization,
}) => {
  const profileThemeClassName = getProfileCustomizationClassName(profileCustomization, "profileCard");
  const profileCustomizationStyle = getProfileCustomizationStyle(profileCustomization);
  const appliedTheme = getProfileStoreItemById(profileCustomization?.appliedItemId);
  const customPalette = getProfileCustomPalette(profileCustomization);
  const selectedAvatarFrame = profileCustomization?.profileCard?.avatarFrame || "none";
  const themeItems = PROFILE_STORE_FEATURED_ITEMS;
  const applyTheme = (item) => {
    onProfileCustomizationChange?.(applyProfileStoreItem(profileCustomization, item));
  };
  const applyAvatarFrame = (frameId) => {
    onProfileCustomizationChange?.(updateProfileAvatarFrame(profileCustomization, frameId));
  };
  const applyPaletteColor = (key, value) => {
    onProfileCustomizationChange?.(updateProfileCustomPalette(profileCustomization, { [key]: value }));
  };

  return (
    <div className="settings-shell__content settings-shell__content--profile">
      <div className="settings-shell__content-header">
        <div>
          <h2>Личный профиль</h2>
        </div>
      </div>

      <section className="voice-settings-card voice-settings-card--profile">
        <div className="profile-settings-form profile-settings-form--public">
          <div className="profile-settings-form__public-preview">
            <div className={`profile-settings-form__public-card ${profileThemeClassName}`.trim()} style={profileCustomizationStyle}>
              {profileBackgroundSrc ? (
                <AnimatedMedia
                  className="profile-settings-form__public-backdrop"
                  src={profileBackgroundSrc}
                  alt=""
                  frame={profileBackgroundFrame}
                />
              ) : (
                <div className="profile-settings-form__public-backdrop profile-settings-form__public-backdrop--fallback" aria-hidden="true" />
              )}
              <div className="profile-settings-form__public-scrim" aria-hidden="true" />

              <div className="profile-settings-form__public-hero">
                <button type="button" className="profile-settings-form__avatar-wrap profile-settings-form__avatar-wrap--interactive" onClick={onChangeAvatar}>
                  <AnimatedAvatar className="profile-settings-form__avatar" src={avatarSrc} alt={displayName} frame={avatarFrame} />
                </button>
                <div className="profile-settings-form__public-identity">
                  <strong>{displayName}</strong>
                  <div className="profile-settings-form__public-chips">
                    <span>Друг</span>
                    <span>Ваш ID</span>
                  </div>
                  <small>{appliedTheme?.title || "как вас видят друзья"}</small>
                </div>
              </div>

              <div className="profile-settings-form__public-body">
                <div className="profile-settings-form__public-main">
                  <div className="profile-settings-form__public-grid" aria-hidden="true">
                    <div className="profile-settings-form__public-tone-card">
                      <ProfilePreviewIcon kind="activity" className="profile-settings-form__public-quick-icon" />
                      <span />
                      <b />
                    </div>
                    <div className="profile-settings-form__public-tone-card">
                      <ProfilePreviewIcon kind="contact" className="profile-settings-form__public-quick-icon" />
                      <span />
                      <b />
                    </div>
                    <div className="profile-settings-form__public-tone-card">
                      <ProfilePreviewIcon kind="id" className="profile-settings-form__public-quick-icon" />
                      <span />
                      <b />
                    </div>
                  </div>
                  <div className="profile-settings-form__public-section">
                    <ProfilePreviewSectionIcon kind="about" />
                    <div className="profile-settings-form__public-section-copy">
                      <strong />
                      <p />
                    </div>
                  </div>
                  <div className="profile-settings-form__public-section profile-settings-form__public-section--info">
                    <ProfilePreviewSectionIcon kind="info" />
                    <div className="profile-settings-form__public-section-copy">
                      <div className="profile-settings-form__public-info-list">
                        <div><em /><b /></div>
                        <div><em /><b /></div>
                        <div><em /><b /></div>
                        <div><em /><b /></div>
                      </div>
                    </div>
                  </div>
                  <div className="profile-settings-form__public-section">
                    <ProfilePreviewSectionIcon kind="common" />
                    <div className="profile-settings-form__public-section-copy">
                      <strong />
                      <p />
                    </div>
                  </div>
                </div>

                <div className="profile-settings-form__public-side" aria-hidden="true">
                  <div className="profile-settings-form__public-actions">
                    <div><ProfilePreviewIcon kind="message" className="profile-settings-form__public-action-icon" />Сообщение</div>
                    <div><ProfilePreviewIcon kind="call" className="profile-settings-form__public-action-icon" />Позвонить</div>
                    <div><ProfilePreviewIcon kind="copy" className="profile-settings-form__public-action-icon" />Копировать ID</div>
                  </div>
                  <div className="profile-settings-form__public-widget">
                    <div className="profile-settings-form__public-widget-header">
                      <ProfilePreviewIcon kind="info" className="profile-settings-form__public-widget-icon" />
                      <strong />
                    </div>
                    <div className="profile-settings-form__public-widget-list">
                      <div>
                        <span />
                        <b />
                      </div>
                      <div>
                        <span />
                        <b />
                      </div>
                      <div>
                        <span />
                        <b />
                      </div>
                      <div>
                        <span />
                        <b />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-settings-form__control-panel">
            <div className="profile-settings-form__control-group">
              <strong>Тема</strong>
              <div className="profile-settings-form__theme-list">
                {themeItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`profile-settings-form__theme-button ${profileCustomization?.appliedItemId === item.id ? "profile-settings-form__theme-button--active" : ""}`.trim()}
                    style={{
                      "--profile-theme-option-1": item.colors?.[0] || "#7c86ff",
                      "--profile-theme-option-2": item.colors?.[1] || item.colors?.[0] || "#5898ff",
                      "--profile-theme-option-3": item.colors?.[2] || item.colors?.[1] || "#38bdf8",
                    }}
                    onClick={() => applyTheme(item)}
                  >
                    <span className="profile-settings-form__theme-swatches" aria-hidden="true">
                      {(item.colors || []).slice(0, 4).map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                    </span>
                    <b>{item.title}</b>
                  </button>
                ))}
              </div>
              <div className="profile-settings-form__palette-panel">
                <div className="profile-settings-form__palette-header">
                  <span>Своя палитра</span>
                  <small>Цвета сразу применяются к профилю</small>
                </div>
                <div className="profile-settings-form__palette-grid">
                  {[
                    ["primary", "Акцент"],
                    ["secondary", "Второй"],
                    ["surface", "Основа"],
                  ].map(([key, label]) => (
                    <label key={key} className="profile-settings-form__color-field">
                      <span>{label}</span>
                      <input
                        type="color"
                        value={customPalette[key]}
                        onChange={(event) => applyPaletteColor(key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="profile-settings-form__control-group profile-settings-form__control-group--media">
              <strong>Медиа</strong>
              <div className="profile-settings-form__actions">
                <button type="button" className="settings-inline-button" onClick={onChangeAvatar}>
                  Аватар
                </button>
                <button type="button" className="settings-inline-button" onClick={onChangeBackground}>
                  Фон
                </button>
              </div>
              <div className="profile-settings-form__avatar-frame-picker">
                <span>Рамка аватара</span>
                <div className="profile-settings-form__avatar-frame-list">
                  {PROFILE_AVATAR_FRAME_OPTIONS.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`profile-settings-form__avatar-frame-option ${selectedAvatarFrame === item.id ? "profile-settings-form__avatar-frame-option--active" : ""}`.trim()}
                      style={{
                        "--avatar-frame-option-1": item.colors[0],
                        "--avatar-frame-option-2": item.colors[1],
                      }}
                      onClick={() => applyAvatarFrame(item.id)}
                    >
                      <i aria-hidden="true" />
                      <b>{item.title}</b>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="settings-inline-button settings-inline-button--danger profile-settings-form__reset-button" onClick={onResetCustomization}>
                Убрать всё
              </button>
            </div>

            <div className="profile-settings-form__control-spacer" />
            {profileStatus ? <div className="profile-settings-form__status profile-settings-form__status--inline">{profileStatus}</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
};

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
  deviceSessionActionBusy,
  onRefreshDeviceSessions,
  onRevokeDeviceSession,
  onRevokeOtherDeviceSessions,
  onOpenQrScanner,
}) => {
  const [accountQrState, setAccountQrState] = useState({
    svg: "",
    expiresAt: "",
    loading: false,
    error: "",
  });

  const createAccountQr = async () => {
    setAccountQrState((previous) => ({ ...previous, loading: true, error: "" }));

    try {
      const response = await authFetch(`${API_BASE_URL}/auth/qr-login/account-session`, {
        method: "POST",
        headers: buildCurrentSessionHeaders(),
      });
      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось создать QR-код."));
      }

      const publicOrigin =
        typeof window !== "undefined" && /^https?:$/i.test(String(window.location?.protocol || ""))
          ? window.location.origin
          : API_URL;
      const qrUrl = new URL("/qr-login", `${publicOrigin}/`);
      qrUrl.searchParams.set("sid", data.sessionId);
      qrUrl.searchParams.set("token", data.scannerToken);

      const svg = await QRCode.toString(qrUrl.toString(), {
        type: "svg",
        margin: 1,
        width: 196,
        color: {
          dark: "#111827",
          light: "#ffffff",
        },
      });

      setAccountQrState({
        svg,
        expiresAt: data.expiresAt || "",
        loading: false,
        error: "",
      });
    } catch (error) {
      setAccountQrState({
        svg: "",
        expiresAt: "",
        loading: false,
        error: error?.message || "Не удалось создать QR-код.",
      });
    }
  };

  return (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Устройства</h2>
          <p>Подключайте новые устройства по QR-коду и проверяйте, где сейчас открыт ваш аккаунт.</p>
        </div>
      </div>

      <section className="voice-settings-card">
        <div className="voice-settings-card__title">Подключение по QR</div>
        <div className="device-connect-guide">
          <div className="device-connect-guide__item">
            <strong>Подтвердить вход на ПК</strong>
            <span>Если QR открыт на другом устройстве, можно отсканировать его из приложения.</span>
            <div className="device-connect-guide__actions">
              <button type="button" className="settings-inline-button" onClick={onOpenQrScanner}>
                Сканировать QR
              </button>
              <button type="button" className="settings-inline-button device-connect-button" onClick={createAccountQr} disabled={accountQrState.loading}>
                {accountQrState.loading ? "Создаём..." : "Показать QR для входа"}
              </button>
            </div>
          </div>
        </div>

        {accountQrState.svg || accountQrState.error ? (
          <div className="device-login-qr">
            {accountQrState.svg ? (
              <div className="device-login-qr__code" dangerouslySetInnerHTML={{ __html: accountQrState.svg }} />
            ) : null}
            <div className="device-login-qr__copy">
              <strong>QR для входа</strong>
              <span>
                {accountQrState.error ||
                  `Действует до ${formatDeviceSessionDate(accountQrState.expiresAt) || "ближайших минут"}.`}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <AccountSessionsPanel
        sessions={deviceSessions}
        loading={deviceSessionsLoading}
        error={deviceSessionsError}
        actionBusy={deviceSessionActionBusy}
        onRefresh={onRefreshDeviceSessions}
        onRevokeSession={onRevokeDeviceSession}
        onRevokeOtherSessions={onRevokeOtherDeviceSessions}
      />
    </div>
  );
};

export const IntegrationsSettings = ({
  integrations,
  integrationsLoading,
  integrationsStatus,
  integrationActionBusy,
  onConnectIntegration,
  onDisconnectIntegration,
  onToggleIntegrationSetting,
}) => {
  const visibleIntegrations = integrations.filter((provider) => !HIDDEN_SETTINGS_INTEGRATION_PROVIDER_IDS.has(provider.id));
  const connectedProviders = visibleIntegrations.filter((provider) => provider.connected);
  const disconnectedProviders = visibleIntegrations.filter((provider) => !provider.connected);

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

const formatAdminDate = (value) => {
  if (!value) {
    return "нет данных";
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "нет данных";
};

const formatAdminNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toLocaleString("ru-RU") : "0";
};

const formatAdminBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 Б";
  }

  const units = ["Б", "КБ", "МБ", "ГБ"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toLocaleString("ru-RU", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
};

const getAdminOverviewArray = (overview, key) => (
  Array.isArray(overview?.[key]) ? overview[key] : []
);

const getAdminUserAvatarUrl = (user) => (
  String(user?.avatarUrl ?? user?.avatar_url ?? user?.AvatarUrl ?? user?.avatar ?? "").trim()
);

const getAdminReportKindLabel = (report) => (
  report?.reportKind === "conversation_spam" ? "Спам-беседа" : "Жалоба на сообщение"
);

const buildAdminRiskEvents = ({
  alerts,
  suspiciousUsers,
  recentReports,
  recentUserReports,
  recentFiles,
  recentMessages,
}) => ([
  ...alerts.map((alert) => ({
    id: `alert-${alert.kind}-${alert.createdAt}`,
    tone: alert.severity === "danger" ? "danger" : "warning",
    title: alert.title || "Алерт",
    meta: `${formatAdminDate(alert.createdAt)} · ${formatAdminNumber(alert.count)}`,
    detail: alert.description || "Есть активность, которую стоит проверить.",
  })),
  ...suspiciousUsers.slice(0, 12).map((targetUser) => ({
    id: `suspect-${targetUser.id}`,
    tone: targetUser.suspicionScore >= 70 ? "danger" : "warning",
    title: targetUser.displayName || targetUser.nickname || `User ${targetUser.id}`,
    meta: `ID ${targetUser.id} · риск ${targetUser.suspicionScore || 0}`,
    detail: (Array.isArray(targetUser.suspicionReasons) && targetUser.suspicionReasons.length)
      ? targetUser.suspicionReasons.join(" · ")
      : "Нестандартная активность без подробных сигналов.",
  })),
  ...recentReports.slice(0, 16).map((report) => ({
    id: `chat-report-${report.id}`,
    reportId: report.id,
    reportSource: "chat",
    reportKindLabel: getAdminReportKindLabel(report),
    reportKind: report.reportKind || "message_report",
    serverId: report.serverId || "",
    channelId: report.channelId || "",
    messageId: report.messageId || null,
    reporterUserId: report.reporterUserId || "",
    targetUserId: report.targetUserId || "",
    reason: report.reason || "",
    createdAt: report.createdAt || "",
    createdAtLabel: formatAdminDate(report.createdAt),
    status: report.status || "open",
    canDismiss: (report.status || "open") === "open",
    tone: report.reportKind === "conversation_spam" ? "danger" : "neutral",
    title: getAdminReportKindLabel(report),
    meta: `${report.status || "open"} · reporter ${report.reporterUserId || "?"} · target ${report.targetUserId || "?"}`,
    detail: `${report.reason || "без причины"} · ${formatAdminDate(report.createdAt)} · ${report.channelId || "канал не указан"}`,
  })),
  ...recentUserReports.slice(0, 12).map((report) => ({
    id: `user-report-${report.id}`,
    reportId: report.id,
    reportSource: "user",
    reportKindLabel: "Жалоба на профиль",
    reportKind: "user_report",
    reporterUserId: report.reporterUserId || "",
    reporterName: report.reporterName || "",
    targetUserId: report.targetUserId || "",
    targetName: report.targetName || "",
    reason: report.reason || "",
    createdAt: report.createdAt || "",
    createdAtLabel: formatAdminDate(report.createdAt),
    status: report.status || "open",
    canDismiss: (report.status || "open") === "open",
    tone: "neutral",
    title: `${report.reporterName || `User ${report.reporterUserId}`} → ${report.targetName || `User ${report.targetUserId}`}`,
    meta: `${report.status || "open"} · ${formatAdminDate(report.createdAt)}`,
    detail: report.reason || "без причины",
  })),
  ...recentFiles.slice(0, 10).map((file) => ({
    id: `file-${file.id}`,
    tone: "neutral",
    title: file.displayFileName || "Файл",
    meta: `User ${file.ownerUserId || "?"} · ${formatAdminBytes(file.size)} · ${file.contentType || "type unknown"}`,
    detail: `${formatAdminDate(file.createdAt)} · ${file.channelId || "канал не указан"}`,
  })),
  ...recentMessages.slice(0, 8).map((message) => ({
    id: `message-${message.id}`,
    tone: "neutral",
    title: message.username || `User ${message.authorUserId}`,
    meta: `${formatAdminDate(message.timestamp)} · ${message.channelId || "канал не указан"}`,
    detail: message.isEncrypted
      ? "Контент скрыт: сообщение зашифровано. Смотри жалобы, метаданные и частоту действий."
      : (message.preview || "без превью"),
  })),
]).slice(0, 80);

export const AdminSettingsPanel = ({ currentUserId, showHeader = true }) => {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [users, setUsers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [status, setStatus] = useState("");
  const [overviewStatus, setOverviewStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");
  const [busyReportId, setBusyReportId] = useState("");
  const [selectedReportEvent, setSelectedReportEvent] = useState(null);
  const suspiciousUsers = useMemo(() => getAdminOverviewArray(overview, "suspiciousUsers"), [overview]);
  const recentMessages = useMemo(() => getAdminOverviewArray(overview, "recentMessages"), [overview]);
  const recentFiles = useMemo(() => getAdminOverviewArray(overview, "recentFiles"), [overview]);
  const recentReports = useMemo(() => getAdminOverviewArray(overview, "recentReports"), [overview]);
  const recentUserReports = useMemo(() => getAdminOverviewArray(overview, "recentUserReports"), [overview]);
  const alerts = useMemo(() => getAdminOverviewArray(overview, "alerts"), [overview]);
  const riskEvents = useMemo(() => buildAdminRiskEvents({
    alerts,
    suspiciousUsers,
    recentReports,
    recentUserReports,
    recentFiles,
    recentMessages,
  }), [alerts, suspiciousUsers, recentReports, recentUserReports, recentFiles, recentMessages]);
  const overviewMetrics = useMemo(() => ([
    { label: "Пользователи", value: overview?.totalUsers },
    { label: "В бане", value: overview?.bannedUsers },
    { label: "Сообщения за 24ч", value: overview?.recentMessageCount24h },
    { label: "Файлы за 7д", value: overview?.recentFileCount7d },
    { label: "Открытые жалобы", value: overview?.openReportCount },
  ]), [overview]);

  const loadUsers = async (nextQuery = query) => {
    setLoading(true);
    setStatus("");
    try {
      const params = new URLSearchParams();
      const normalizedQuery = String(nextQuery || "").trim();
      if (normalizedQuery) {
        params.set("query", normalizedQuery);
      }
      params.set("limit", "60");

      const response = await authFetch(`${API_BASE_URL}/admin/users?${params.toString()}`, { method: "GET" });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить пользователей."));
      }

      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (error) {
      setStatus(error?.message || "Не удалось загрузить пользователей.");
    } finally {
      setLoading(false);
    }
  };

  const loadSecurityOverview = async () => {
    setOverviewLoading(true);
    setOverviewStatus("");
    try {
      const response = await authFetch(`${API_BASE_URL}/admin/security-overview`, { method: "GET" });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось загрузить безопасность."));
      }

      setOverview(data || null);
      const overviewUsers = Array.isArray(data?.users) ? data.users : [];
      if (!query.trim() && overviewUsers.length) {
        setUsers(overviewUsers);
      }
    } catch (error) {
      setOverviewStatus(error?.message || "Не удалось загрузить безопасность.");
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    loadUsers("");
    loadSecurityOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    loadUsers(query);
  };

  const updateBanState = async (targetUser, shouldBan, reasonOverride = null) => {
    const userId = String(targetUser?.id || "").trim();
    if (!userId || (String(userId) === String(currentUserId || "") && shouldBan)) {
      return;
    }

    setBusyUserId(userId);
    setStatus("");
    const nextReason = reasonOverride == null ? reason : String(reasonOverride || "");
    try {
      const response = await authFetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/${shouldBan ? "ban" : "unban"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: shouldBan ? JSON.stringify({ reason: nextReason }) : undefined,
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, shouldBan ? "Не удалось заблокировать пользователя." : "Не удалось снять блокировку."));
      }

      setUsers((previousUsers) => previousUsers.map((user) => (
        String(user.id) === userId
          ? {
              ...user,
              isBanned: shouldBan,
              bannedAt: shouldBan ? new Date().toISOString() : "",
              banReason: shouldBan ? nextReason.trim() : "",
              bannedByUserId: shouldBan ? currentUserId : null,
            }
          : user
      )));
      setStatus(shouldBan ? "Пользователь заблокирован, активные сессии отозваны." : "Блокировка снята.");
      void loadSecurityOverview();
    } catch (error) {
      setStatus(error?.message || "Не удалось изменить блокировку.");
    } finally {
      setBusyUserId("");
    }
  };

  const dismissReport = async (event, messageOverride = null) => {
    if (!event?.reportId || !event?.reportSource) {
      return;
    }

    const busyKey = `${event.reportSource}:${event.reportId}`;
    setBusyReportId(busyKey);
    setOverviewStatus("");
    try {
      const response = await authFetch(`${API_BASE_URL}/admin/reports/${encodeURIComponent(event.reportSource)}/${encodeURIComponent(event.reportId)}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageOverride || "Мы проверили жалобу и не нашли нарушения. Спасибо, что сообщили.",
        }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось отклонить жалобу."));
      }

      setOverviewStatus("Жалоба отклонена, пользователю отправлен push, если уведомления включены.");
      setSelectedReportEvent(null);
      void loadSecurityOverview();
    } catch (error) {
      setOverviewStatus(error?.message || "Не удалось отклонить жалобу.");
    } finally {
      setBusyReportId("");
    }
  };

  const banReportTarget = async (event, banReasonText) => {
    const targetUserId = String(event?.targetUserId || "").trim();
    if (!targetUserId) {
      return;
    }

    await updateBanState({ id: targetUserId }, true, banReasonText || event?.reason || "");
    setSelectedReportEvent(null);
  };

  return (
    <div className="settings-shell__content settings-shell__content--admin">
      {showHeader ? (
        <div className="settings-shell__content-header">
          <h2>Безопасность</h2>
          <p>Отдельная страница для просмотра пользователей, подозрительных сигналов, сообщений, файлов и жалоб.</p>
        </div>
      ) : null}

      <section className="admin-security-metrics" aria-busy={overviewLoading}>
        {overviewMetrics.map((metric) => (
          <article key={metric.label} className="admin-security-metric">
            <span>{metric.label}</span>
            <strong>{overviewLoading && !overview ? "..." : formatAdminNumber(metric.value)}</strong>
          </article>
        ))}
      </section>

      {overviewStatus ? <div className="admin-settings-status">{overviewStatus}</div> : null}

      <section className="admin-security-workspace">
        <div className="admin-security-main-column">
          <section className="admin-security-section admin-security-section--risk">
            <div className="admin-security-section__header">
              <div>
                <h3>События риска</h3>
                <p>Алерты, жалобы, подозрительные профили и файлы в одном списке для быстрой проверки.</p>
              </div>
              <button type="button" className="settings-inline-button admin-security-refresh-button" disabled={overviewLoading} onClick={loadSecurityOverview}>
                {overviewLoading ? "Обновляем..." : "Обновить"}
              </button>
            </div>
            <div className="admin-security-list admin-risk-event-list">
              {riskEvents.map((event) => (
                <article key={event.id} className={`admin-risk-event admin-risk-event--${event.tone || "neutral"}`}>
                  <span className="admin-risk-event__tone" aria-hidden="true" />
                  <div className="admin-risk-event__body">
                    <strong className="admin-security-overflow-safe">{event.title}</strong>
                    <span className="admin-security-overflow-safe">{event.meta}</span>
                    <p className="admin-security-overflow-safe">{event.detail}</p>
                    {event.canDismiss ? (
                      <div className="admin-risk-event__actions">
                        <button
                          type="button"
                          className="settings-inline-button"
                          disabled={busyReportId === `${event.reportSource}:${event.reportId}`}
                          onClick={() => setSelectedReportEvent(event)}
                        >
                          {busyReportId === `${event.reportSource}:${event.reportId}` ? "..." : "Открыть"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {!overviewLoading && riskEvents.length === 0 ? (
                <div className="admin-users-list__empty">Странной активности пока нет.</div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="admin-security-side-column">
          <section className="admin-settings-card admin-accounts-panel">
            <div className="admin-security-section__header">
              <div>
                <h3>Аккаунты</h3>
                <p>Поиск, бан и разбан без бесконечной прокрутки всей страницы.</p>
              </div>
            </div>
            <form className="admin-settings-search" onSubmit={submitSearch}>
              <label className="admin-settings-field">
                <span>Поиск пользователя</span>
                <input
                  className="settings-input"
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ID, ник или email"
                />
              </label>
              <button type="submit" className="settings-inline-button" disabled={loading}>
                {loading ? "Ищем..." : "Найти"}
              </button>
            </form>

            <label className="admin-settings-field admin-settings-field--reason">
              <span>Причина бана</span>
              <textarea
                className="settings-input admin-settings-reason"
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Будет видно только в админке и уведомлении о бане"
              />
            </label>

            {status ? <div className="admin-settings-status">{status}</div> : null}

            <div className="admin-users-window">
              <section className="admin-users-list" aria-busy={loading}>
                {users.map((targetUser) => {
                  const userId = String(targetUser.id || "");
                  const isSelf = String(currentUserId || "") === userId || targetUser.isSelf;
                  const busy = busyUserId === userId;

                  return (
                    <article key={userId} className={`admin-user-row ${targetUser.isBanned ? "admin-user-row--banned" : ""}`}>
                      <AnimatedAvatar className="admin-user-row__avatar" src={getAdminUserAvatarUrl(targetUser)} alt={targetUser.displayName || targetUser.nickname || userId} />
                      <div className="admin-user-row__body">
                        <div className="admin-user-row__title">
                          <strong className="admin-security-overflow-safe">{targetUser.displayName || targetUser.nickname || `User ${userId}`}</strong>
                          <span>ID {userId}</span>
                          {targetUser.isAdmin ? <span className="admin-user-row__badge">admin</span> : null}
                          {targetUser.isBanned ? <span className="admin-user-row__badge admin-user-row__badge--danger">ban</span> : null}
                        </div>
                        <div className="admin-user-row__meta">
                          <span className="admin-security-overflow-safe">{targetUser.email || "email не указан"}</span>
                          <span>визит: {formatAdminDate(targetUser.lastSeenAt)}</span>
                          {targetUser.isBanned ? <span>бан: {formatAdminDate(targetUser.bannedAt)}</span> : null}
                        </div>
                        {targetUser.isBanned && targetUser.banReason ? (
                          <p className="admin-user-row__reason admin-security-overflow-safe">{targetUser.banReason}</p>
                        ) : null}
                      </div>
                      <div className="admin-user-row__actions">
                        {targetUser.isBanned ? (
                          <button type="button" className="settings-inline-button" disabled={busy} onClick={() => updateBanState(targetUser, false)}>
                            {busy ? "..." : "Разбанить"}
                          </button>
                        ) : (
                          <button type="button" className="settings-inline-button settings-inline-button--danger" disabled={busy || isSelf} onClick={() => updateBanState(targetUser, true)}>
                            {busy ? "..." : "Бан"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {!loading && users.length === 0 ? <div className="admin-users-list__empty">Пользователи не найдены.</div> : null}
              </section>
            </div>
          </section>
        </aside>
      </section>

      <AdminReportDecisionDialog
        key={selectedReportEvent?.id || "admin-report-dialog-empty"}
        event={selectedReportEvent}
        busy={Boolean(
          selectedReportEvent && (
            busyReportId === `${selectedReportEvent.reportSource}:${selectedReportEvent.reportId}` ||
            busyUserId === String(selectedReportEvent.targetUserId || "")
          )
        )}
        onClose={() => setSelectedReportEvent(null)}
        onBanTarget={banReportTarget}
        onDismissReport={dismissReport}
      />
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
  echoCancellationEnabled,
  autoInputSensitivity,
  manualInputSensitivityDb,
  onInputDeviceChange,
  onOutputDeviceChange,
  onMicVolumeChange,
  onAudioVolumeChange,
  onToggleMicTest,
  onNoiseProfileChange,
  onToggleEchoCancellation,
  onToggleAutoSensitivity,
  onManualInputSensitivityChange,
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
            {Array.from({ length: 32 }).map((_, index) => (
              <span key={index} className={index < activeMicSettingsBars ? "is-active" : ""} />
            ))}
          </div>
        </div>

        <div className="voice-settings-help">
          Нужна помощь? Здесь собраны все быстрые настройки голоса, чтобы не вылезать из звонка.
        </div>
      </section>

      <section className="voice-settings-card voice-settings-card--processing">
        <div className="voice-settings-card__title">Профиль ввода</div>
        <div className="voice-profile-list voice-profile-list--processing">
          {noiseProfileOptions.map((option) => (
            <label key={option.id} className="voice-profile-option">
              <input type="radio" name="noiseProfile" checked={noiseSuppressionMode === option.id} onChange={() => onNoiseProfileChange(option.id)} />
              <span className="voice-profile-option__copy">
                <strong>{option.title}</strong>
              </span>
            </label>
          ))}
        </div>

        <div className="voice-settings-processing-toggles">
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

          {!autoInputSensitivity && (
            <label className="voice-settings-field voice-settings-field--manual-threshold">
              <span>Порог срабатывания микрофона: {Math.round(manualInputSensitivityDb)} dB</span>
              <PercentageSlider
                min={-80}
                max={-20}
                value={manualInputSensitivityDb}
                onChange={(event) => onManualInputSensitivityChange(Number(event.target.value))}
                ariaLabel="Порог срабатывания микрофона"
                formatValue={(value) => `${Math.round(value)} dB`}
              />
            </label>
          )}
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
  systemSoundVolume,
  systemSoundEventOptions = [],
  systemSoundEvents = {},
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
  onSystemSoundVolumeChange,
  onSystemSoundEventToggle,
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

    <section className="voice-settings-card voice-settings-card--notifications">
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

      <label className="voice-settings-field voice-settings-field--volume">
        <span>Громкость системных звуков</span>
        <PercentageSlider
          min={0}
          max={100}
          value={systemSoundVolume}
          onChange={(event) => onSystemSoundVolumeChange(Number(event.target.value))}
          ariaLabel="Громкость системных звуков"
        />
        <span className="voice-settings-caption">Влияет на уведомления и звуки голосовой комнаты.</span>
      </label>

      <div className="voice-settings-field voice-settings-field--stacked system-sound-controls">
        <span>Управление системными звуками</span>
        <div className="system-sound-controls__list">
          {systemSoundEventOptions.map((option) => (
            <div key={option.id} className="voice-toggle-row voice-toggle-row--compact system-sound-controls__row">
              <div>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </div>
              <VoiceSwitch
                active={systemSoundEvents?.[option.id] !== false}
                onClick={() => onSystemSoundEventToggle?.(option.id)}
                label={option.label}
              />
            </div>
          ))}
        </div>
        <span className="voice-settings-caption">Не влияет на голоса участников, звук стрима и индивидуальную громкость людей.</span>
      </div>

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
  uiTheme,
  uiAccentColor,
  chatThemeId,
  customChatBackgroundData,
  customChatBackgroundFit,
  chatThemeError,
  appLogoId,
  onDensityChange,
  onFontScaleChange,
  onReduceMotionChange,
  onTouchTargetSizeChange,
  onThemeChange,
  onAccentColorChange,
  onChatThemeChange,
  onCustomChatBackgroundFitChange,
  onCustomChatBackgroundChange,
  onRemoveCustomChatBackground,
  onAppLogoChange,
}) => {
  const chatBackgroundInputRef = useRef(null);
  const resolvedChatBackgroundFit = resolveChatBackgroundFit(customChatBackgroundFit);
  const hasCustomChatAppearance = chatThemeId !== "default" || Boolean(customChatBackgroundData);
  const handleResetChatAppearance = () => {
    onChatThemeChange("default");
    if (customChatBackgroundData) {
      onRemoveCustomChatBackground();
    }
  };

  return (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Внешний вид и доступность</h2>
        </div>
      </div>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Тема интерфейса</div>
      <div className="theme-choice-list" role="radiogroup" aria-label="Тема интерфейса">
        {UI_THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`theme-choice theme-choice--${option.id} ${uiTheme === option.id ? "theme-choice--active" : ""}`}
            onClick={() => onThemeChange(option.id)}
            role="radio"
            aria-checked={uiTheme === option.id}
          >
            <span className="theme-choice__swatch" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="theme-choice__copy">
              <strong>{option.title}</strong>
            </span>
          </button>
        ))}
      </div>
      <div className="theme-accent-picker">
        <label className="theme-accent-picker__field">
          <span>Акцентный цвет</span>
          <input
            type="color"
            value={uiAccentColor || "#8b7cff"}
            onChange={(event) => onAccentColorChange(event.target.value)}
          />
        </label>
        <button type="button" className="settings-inline-button settings-inline-button--ghost" onClick={() => onAccentColorChange("")} disabled={!uiAccentColor}>
          Сбросить цвет
        </button>
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="settings-section__header settings-section__header--compact">
        <div>
          <h4>Темы чата</h4>
        </div>
      </div>

      <div className="chat-theme-choice-list" role="radiogroup" aria-label="Тема чата">
        {CHAT_THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`chat-theme-choice ${chatThemeId === option.id ? "chat-theme-choice--active" : ""}`}
            onClick={() => onChatThemeChange(option.id)}
            role="radio"
            aria-checked={chatThemeId === option.id}
          >
            <span className="chat-theme-choice__preview" style={{ "--chat-theme-preview-bg": option.preview.background }} aria-hidden="true">
              <span style={{ "--chat-theme-preview-bubble": option.preview.bubble }} />
              <span style={{ "--chat-theme-preview-document": option.preview.document }} />
            </span>
            <span className="chat-theme-choice__copy">
              <strong>{option.title}</strong>
            </span>
          </button>
        ))}
      </div>

      <div className="chat-background-picker">
        <div
          className={`chat-background-picker__preview chat-background-picker__preview--${resolvedChatBackgroundFit.id} ${customChatBackgroundData ? "chat-background-picker__preview--filled" : ""}`}
          style={customChatBackgroundData ? { "--chat-background-picker-image": `url("${customChatBackgroundData}")` } : undefined}
          aria-hidden="true"
        >
          <span className="chat-background-picker__preview-topbar" />
          <span className="chat-background-picker__preview-message chat-background-picker__preview-message--incoming" />
          <span className="chat-background-picker__preview-message chat-background-picker__preview-message--own" />
        </div>

        <div className="chat-background-picker__body">
          <div className="chat-background-picker__header">
            <div>
              <strong>Свой фон чата</strong>
            </div>
            <div className="settings-shell__actions chat-background-picker__actions">
              <button type="button" className="settings-inline-button" onClick={() => chatBackgroundInputRef.current?.click()}>
                Выбрать фон
              </button>
              <button
                type="button"
                className="settings-inline-button settings-inline-button--ghost"
                onClick={handleResetChatAppearance}
                disabled={!hasCustomChatAppearance}
                title="Сбросить тему чата и свой фон"
              >
                Убрать тему
              </button>
            </div>
          </div>

          <div className="chat-background-fit" role="radiogroup" aria-label="Отображение фона чата">
            {CHAT_BACKGROUND_FIT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`chat-background-fit__option ${resolvedChatBackgroundFit.id === option.id ? "chat-background-fit__option--active" : ""}`}
                onClick={() => onCustomChatBackgroundFitChange(option.id)}
                role="radio"
                aria-checked={resolvedChatBackgroundFit.id === option.id}
                title={option.description}
              >
                {option.title}
              </button>
            ))}
          </div>
        </div>
        <input
          ref={chatBackgroundInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden-input"
          onChange={onCustomChatBackgroundChange}
        />
      </div>
      {chatThemeError ? <span className="settings-inline-error">{chatThemeError}</span> : null}
    </section>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Плотность интерфейса</div>
      <div className="voice-profile-list">
        {[
          { id: "standard", title: "Стандартно" },
          { id: "compact", title: "Компактно" },
        ].map((option) => (
          <label key={option.id} className="voice-profile-option voice-profile-option--single-line">
            <input type="radio" name="uiDensity" checked={uiDensity === option.id} onChange={() => onDensityChange(option.id)} />
            <span className="voice-profile-option__copy">
              <strong>{option.title}</strong>
            </span>
          </label>
        ))}
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Размер текста</div>
      <div className="voice-profile-list">
        {[
          { id: "sm", title: "Чуть меньше" },
          { id: "md", title: "Стандартный" },
          { id: "lg", title: "Крупнее" },
        ].map((option) => (
          <label key={option.id} className="voice-profile-option voice-profile-option--single-line">
            <input type="radio" name="uiFontScale" checked={uiFontScale === option.id} onChange={() => onFontScaleChange(option.id)} />
            <span className="voice-profile-option__copy">
              <strong>{option.title}</strong>
            </span>
          </label>
        ))}
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="voice-settings-card__title">Взаимодействие</div>
      <div className="voice-toggle-row voice-toggle-row--first voice-toggle-row--no-description">
        <div>
          <strong>Уменьшить анимации</strong>
        </div>
        <VoiceSwitch active={uiReduceMotion} onClick={() => onReduceMotionChange((previous) => !previous)} label="Уменьшить анимации" />
      </div>

      <div className="voice-profile-list">
        {[
          { id: "standard", title: "Обычные зоны попадания" },
          { id: "large", title: "Увеличенные зоны попадания" },
        ].map((option) => (
          <label key={option.id} className="voice-profile-option voice-profile-option--single-line">
            <input type="radio" name="uiTouchTargetSize" checked={uiTouchTargetSize === option.id} onChange={() => onTouchTargetSizeChange(option.id)} />
            <span className="voice-profile-option__copy">
              <strong>{option.title}</strong>
            </span>
          </label>
        ))}
      </div>
    </section>

    <section className="voice-settings-card">
      <div className="settings-section__header settings-section__header--compact">
        <div>
          <h4>Логотип приложения</h4>
        </div>
      </div>
      <div className="app-logo-picker" role="radiogroup" aria-label="Логотип приложения">
        {APP_LOGO_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`app-logo-picker__option ${appLogoId === option.id ? "app-logo-picker__option--active" : ""}`}
            onClick={() => onAppLogoChange(option.id)}
            role="radio"
            aria-checked={appLogoId === option.id}
          >
            <img className="app-logo-picker__preview" src={option.src} alt="" />
            <span className="app-logo-picker__copy">
              <strong>{option.label}</strong>
            </span>
          </button>
        ))}
      </div>
    </section>
  </div>
  );
};

const SYSTEM_ROLE_IDS = new Set(["owner", "member"]);
const normalizeRoleForm = (role) => ({
  name: role?.name || "",
  color: role?.color || "#7b89a8",
  permissions: Array.isArray(role?.permissions) ? role.permissions : [],
});

export const RolesSettings = ({
  activeServer,
  currentUserId,
  canManageRoles,
  currentServerRole,
  rolePermissionLabels,
  canAssignRoleToMember,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onUpdateMemberRole,
}) => {
  const roles = activeServer?.roles || [];
  const members = activeServer?.members || [];
  const isOwner = String(activeServer?.ownerId || "") === String(currentUserId || "");
  const permissionEntries = useMemo(() => Object.entries(rolePermissionLabels || {}), [rolePermissionLabels]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleForm, setRoleForm] = useState(() => normalizeRoleForm(null));
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [roleStatus, setRoleStatus] = useState("");
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleDeleteConfirmId, setRoleDeleteConfirmId] = useState("");

  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === String(selectedRoleId)) || roles[0] || null,
    [roles, selectedRoleId]
  );
  const selectedRoleIsOwner = selectedRole?.id === "owner";
  const selectedRoleIsSystem = SYSTEM_ROLE_IDS.has(selectedRole?.id);
  const selectedRoleIsLocked = selectedRole?.id === "member" || (selectedRoleIsOwner && !isOwner);
  const selectedRolePermissionsLocked = selectedRoleIsOwner;
  const canEditSelectedRole = Boolean(canManageRoles && selectedRole && !selectedRoleIsLocked);

  useEffect(() => {
    if (!activeServer) {
      setSelectedRoleId("");
      setRoleForm(normalizeRoleForm(null));
      setIsCreatingRole(false);
      return;
    }

    if (!isCreatingRole && selectedRole) {
      setRoleForm(normalizeRoleForm(selectedRole));
    }
  }, [activeServer, isCreatingRole, selectedRole]);

  const startCreateRole = () => {
    setIsCreatingRole(true);
    setSelectedRoleId("");
    setRoleStatus("");
    setRoleDeleteConfirmId("");
    setRoleForm({ name: "", color: "#7b89a8", permissions: [] });
  };

  const selectRole = (role) => {
    setIsCreatingRole(false);
    setSelectedRoleId(role.id);
    setRoleStatus("");
    setRoleDeleteConfirmId("");
    setRoleForm(normalizeRoleForm(role));
  };

  const togglePermission = (permission) => {
    if (!isOwner && (permission === "manage_server" || permission === "manage_roles")) {
      return;
    }

    setRoleForm((previous) => ({
      ...previous,
      permissions: previous.permissions.includes(permission)
        ? previous.permissions.filter((item) => item !== permission)
        : [...previous.permissions, permission],
    }));
  };

  const submitRole = async (event) => {
    event.preventDefault();
    if (!canManageRoles || (!isCreatingRole && !canEditSelectedRole)) {
      return;
    }

    setRoleBusy(true);
    setRoleStatus("");
    try {
      const payload = {
        name: roleForm.name.trim(),
        color: roleForm.color,
        permissions: selectedRolePermissionsLocked && selectedRole
          ? selectedRole.permissions || []
          : roleForm.permissions,
      };
      const snapshot = isCreatingRole
        ? await onCreateRole?.(payload)
        : await onUpdateRole?.(selectedRole.id, payload);
      const nextRole = snapshot?.roles?.find((role) => role.name === payload.name) || snapshot?.roles?.find((role) => role.id === selectedRole?.id);
      setIsCreatingRole(false);
      setSelectedRoleId(nextRole?.id || selectedRole?.id || "");
      setRoleDeleteConfirmId("");
      setRoleStatus("Сохранено.");
    } catch (error) {
      setRoleStatus(error instanceof Error ? error.message : "Не удалось сохранить роль.");
    } finally {
      setRoleBusy(false);
    }
  };

  const removeSelectedRole = async () => {
    if (!canEditSelectedRole || selectedRoleIsSystem || !selectedRole) {
      return;
    }

    if (String(roleDeleteConfirmId || "") !== String(selectedRole.id || "")) {
      setRoleDeleteConfirmId(String(selectedRole.id || ""));
      setRoleStatus(`Подтвердите удаление роли «${selectedRole.name}».`);
      return;
    }

    setRoleBusy(true);
    setRoleStatus("");
    try {
      await onDeleteRole?.(selectedRole.id);
      setSelectedRoleId("");
      setRoleDeleteConfirmId("");
      setRoleStatus("Роль удалена.");
    } catch (error) {
      setRoleStatus(error instanceof Error ? error.message : "Не удалось удалить роль.");
    } finally {
      setRoleBusy(false);
    }
  };

  return (
    <div className="settings-shell__content">
      <div className="settings-shell__content-header">
        <div>
          <h2>Роли и участники</h2>
          <p>Создавайте роли, задавайте цвет и права, затем назначайте их участникам сервера.</p>
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
          <section className="voice-settings-card settings-roles-layout">
            <div className="settings-section__header">
              <h4>Роли</h4>
              <span className="settings-role-current">{currentServerRole?.name || "Member"}</span>
            </div>
            <div className="settings-roles-grid">
              <div className="settings-list settings-roles-list">
                {canManageRoles ? (
                  <button type="button" className="settings-inline-button" onClick={startCreateRole}>
                    Создать роль
                  </button>
                ) : null}
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    className={`settings-list__row settings-list__row--stacked settings-role-row ${selectedRole?.id === role.id && !isCreatingRole ? "settings-role-row--active" : ""}`}
                    onClick={() => selectRole(role)}
                  >
                    <div className="settings-role-meta">
                      <span className="settings-role-badge" style={{ backgroundColor: role.color || "#7b89a8" }}>{role.name}</span>
                    </div>
                  </button>
                ))}
              </div>

              <form className="settings-role-editor" onSubmit={submitRole}>
                <h5>{isCreatingRole ? "Новая роль" : selectedRole?.name || "Выберите роль"}</h5>
                <label>
                  Имя роли
                  <input
                    className="settings-input"
                    value={roleForm.name}
                    maxLength={40}
                    disabled={!canManageRoles || (!isCreatingRole && !canEditSelectedRole)}
                    onChange={(event) => setRoleForm((previous) => ({ ...previous, name: event.target.value }))}
                  />
                </label>
                <label>
                  Цвет
                  <input
                    type="color"
                    className="settings-role-color-input"
                    value={roleForm.color}
                    disabled={!canManageRoles || (!isCreatingRole && !canEditSelectedRole)}
                    onChange={(event) => setRoleForm((previous) => ({ ...previous, color: event.target.value }))}
                  />
                </label>
                <div className="settings-role-permissions">
                  {permissionEntries.map(([permission, label]) => {
                    const lockedSensitivePermission = !isOwner && (permission === "manage_server" || permission === "manage_roles");
                    return (
                      <label key={permission} className="settings-role-permission">
                        <input
                          type="checkbox"
                          checked={roleForm.permissions.includes(permission)}
                          disabled={!canManageRoles || (!isCreatingRole && !canEditSelectedRole) || lockedSensitivePermission || selectedRolePermissionsLocked}
                          onChange={() => togglePermission(permission)}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
                {roleStatus ? <span className="settings-role-description">{roleStatus}</span> : null}
                <div className="settings-role-actions">
                  <button type="submit" className="settings-inline-button" disabled={roleBusy || !canManageRoles || (!isCreatingRole && !canEditSelectedRole)}>
                    Сохранить
                  </button>
                  {!isCreatingRole && selectedRole ? (
                    <>
                      <button type="button" className="settings-inline-button settings-inline-button--danger" disabled={roleBusy || selectedRoleIsSystem || !canEditSelectedRole} onClick={removeSelectedRole}>
                        {roleDeleteConfirmId === selectedRole.id ? "Подтвердить удаление" : "Удалить"}
                      </button>
                      {roleDeleteConfirmId === selectedRole.id ? (
                        <button type="button" className="settings-inline-button" disabled={roleBusy} onClick={() => setRoleDeleteConfirmId("")}>
                          Отмена
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </form>
            </div>
          </section>

          <section className="voice-settings-card">
            <div className="settings-section__header">
              <h4>Участники</h4>
              <span className="settings-role-current">{members.length}</span>
            </div>
            <div className="settings-list">
              {members.map((member) => {
                const memberRole = roles.find((role) => role.id === member.roleId);
                const canChangeThisMember = canManageRoles && String(member.userId) !== String(currentUserId) && member.roleId !== "owner";
                return (
                  <div key={member.userId} className="settings-list__row settings-list__row--stacked">
                    <div className="settings-role-meta">
                      <span className="settings-member-name">{member.name}</span>
                      <span className="settings-role-description">{memberRole?.name || member.roleId || "Member"}</span>
                    </div>
                    {canManageRoles ? (
                      <select
                        className="settings-role-select"
                        value={member.roleId}
                        disabled={!canChangeThisMember}
                        onChange={(event) => onUpdateMemberRole?.(member.userId, event.target.value)}
                      >
                        {roles.map((role) => (
                          <option
                            key={role.id}
                            value={role.id}
                            disabled={role.id === "owner" || !canAssignRoleToMember?.(activeServer, currentUserId, member.userId, role.id)}
                          >
                            {role.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

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
              <input className="settings-input" type="text" value={activeServer?.name || ""} maxLength={MAX_SERVER_NAME_LENGTH} onChange={(event) => onServerNameChange(event.target.value)} disabled={!canManageServer} />
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
            {canManageServer ? (
              <button type="button" className="settings-inline-button" onClick={onChangeServerIcon}>Сменить картинку</button>
            ) : null}
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
        <span>{email || "Ваш аккаунт Lanaya"}</span>
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

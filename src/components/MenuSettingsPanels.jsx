import AnimatedAvatar from "./AnimatedAvatar";
import AnimatedMedia from "./AnimatedMedia";
import ServerInvitesPanel from "./ServerInvitesPanel";

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

export const PersonalProfileSettings = ({
  profileBackgroundSrc,
  profileBackgroundFrame,
  avatarSrc,
  avatarFrame,
  displayName,
  email,
  profileDraft,
  profileStatus,
  maxProfileNameLength,
  onSubmit,
  onChangeAvatar,
  onChangeBackground,
  onUpdateDraft,
  onLogout,
}) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Личный профиль</h2>
        <p>Управляйте своим именем, фамилией, email, аватаром и фоном профиля в одном месте.</p>
      </div>
    </div>

    <section className="voice-settings-card voice-settings-card--profile">
      <form className="profile-settings-form" onSubmit={onSubmit}>
        <div className="profile-settings-form__hero">
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

          <button type="button" className="profile-settings-form__avatar-wrap profile-settings-form__avatar-wrap--interactive" onClick={onChangeAvatar}>
            <AnimatedAvatar className="profile-settings-form__avatar" src={avatarSrc} alt={displayName} frame={avatarFrame} />
          </button>

          <div className="profile-settings-form__grid">
            <label className="voice-settings-field voice-settings-field--stacked">
              <span>Имя</span>
              <input className="settings-input" type="text" value={profileDraft.firstName} onChange={(event) => onUpdateDraft("firstName", event.target.value)} maxLength={maxProfileNameLength} />
            </label>
            <label className="voice-settings-field voice-settings-field--stacked">
              <span>Фамилия</span>
              <input className="settings-input" type="text" value={profileDraft.lastName} onChange={(event) => onUpdateDraft("lastName", event.target.value)} maxLength={maxProfileNameLength} />
            </label>
            <label className="voice-settings-field voice-settings-field--stacked profile-settings-form__field--full">
              <span>Email</span>
              <input className="settings-input" type="email" value={email} readOnly />
            </label>
          </div>
        </div>

        {profileStatus ? <div className="profile-settings-form__status">{profileStatus}</div> : null}

        <div className="settings-shell__actions">
          <button type="submit" className="settings-inline-button">Сохранить профиль</button>
          <button type="button" className="settings-inline-button settings-inline-button--danger" onClick={onLogout}>
            Выйти из аккаунта
          </button>
        </div>
      </form>
    </section>
  </div>
);

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
  activeNoiseProfile,
  echoCancellationEnabled,
  autoInputSensitivity,
  onInputDeviceChange,
  onOutputDeviceChange,
  onMicVolumeChange,
  onAudioVolumeChange,
  onToggleMicTest,
  onNoiseProfileChange,
  onToggleEchoCancellation,
  onToggleAutoSensitivity,
}) => (
  <div className="settings-shell__content">
    <div className="settings-shell__content-header">
      <div>
        <h2>Голос и видео</h2>
        <p>Настройте микрофон, вывод и профиль обработки так, как в вашем макете.</p>
      </div>
    </div>

    <section className="voice-settings-card">
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

        <label className="voice-settings-field">
          <span>Громкость микрофона</span>
          <input type="range" min="0" max="100" value={micVolume} onChange={(event) => onMicVolumeChange(Number(event.target.value))} />
        </label>
        <label className="voice-settings-field">
          <span>Громкость динамика</span>
          <input type="range" min="0" max="100" value={audioVolume} onChange={(event) => onAudioVolumeChange(Number(event.target.value))} />
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
      <div className="voice-toggle-row voice-toggle-row--first">
        <div>
          <strong>Эхоподавление</strong>
          <span>Убирает обратный звук из динамиков и теперь включается отдельно от шумоподавления.</span>
        </div>
        <VoiceSwitch active={echoCancellationEnabled} onClick={onToggleEchoCancellation} label="Эхоподавление" />
      </div>

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

      <div className="voice-toggle-row">
        <div>
          <strong>Автоматически определять чувствительность ввода</strong>
          <span>Система сама подстраивает порог срабатывания микрофона под текущий шум.</span>
        </div>
        <VoiceSwitch active={autoInputSensitivity} onClick={onToggleAutoSensitivity} label="Автоматическая чувствительность" />
      </div>

      <div className="voice-settings-field voice-settings-field--stacked">
        <span>Шумоподавление</span>
        <select className="voice-settings-select voice-settings-select--native voice-settings-select--compact" value={noiseSuppressionMode} onChange={(event) => onNoiseProfileChange(event.target.value)}>
          {noiseProfileOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.title}</option>
          ))}
        </select>
        <span className="voice-settings-caption">{activeNoiseProfile.description}</span>
      </div>
    </section>
  </div>
);

export const NotificationsSettings = ({
  directNotificationsEnabled,
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
        <p>Настройте личные, серверные и звуковые уведомления так, как вам удобно.</p>
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
                    <span className="server-members-panel__name">
                      <span className="server-members-panel__role-dot" style={{ backgroundColor: memberRole?.color || "#7b89a8" }} aria-hidden="true" />
                      {member.name}
                    </span>
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

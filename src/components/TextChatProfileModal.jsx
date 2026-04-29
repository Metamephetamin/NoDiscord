import AnimatedAvatar from "./AnimatedAvatar";
import { formatUserPresenceStatus, isUserCurrentlyOnline } from "../utils/menuMainModel";

const PROFILE_ICON_PATHS = {
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
  activity: (
    <path d="M4 13.2h4.1l2.2-6.4 3.4 10.4 2.1-4h4.2" />
  ),
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
  call: (
    <path d="M7.2 4.8 9.5 7c.6.6.7 1.5.2 2.2l-.8 1.1a10.5 10.5 0 0 0 4.8 4.8l1.1-.8c.7-.5 1.6-.4 2.2.2l2.2 2.3c.5.5.6 1.3.2 1.9-.7 1.1-1.9 1.8-3.2 1.5C10 19 5 14 3.8 7.8c-.3-1.3.4-2.5 1.5-3.2.6-.4 1.4-.3 1.9.2Z" />
  ),
  friend: (
    <>
      <path d="M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M3.8 19c.7-2.8 2.5-4.2 5.2-4.2 1.8 0 3.2.6 4.1 1.8" />
      <path d="m16 18 4-4" />
      <path d="m16 14 4 4" />
    </>
  ),
  copy: (
    <>
      <path d="M8 8.5V6.8A2.8 2.8 0 0 1 10.8 4h6.4A2.8 2.8 0 0 1 20 6.8v6.4a2.8 2.8 0 0 1-2.8 2.8h-1.7" />
      <path d="M6.8 8h6.4A2.8 2.8 0 0 1 16 10.8v6.4a2.8 2.8 0 0 1-2.8 2.8H6.8A2.8 2.8 0 0 1 4 17.2v-6.4A2.8 2.8 0 0 1 6.8 8Z" />
    </>
  ),
};

const ProfileIcon = ({ kind, className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {PROFILE_ICON_PATHS[kind] || PROFILE_ICON_PATHS.info}
  </svg>
);

const getProfileAbout = (profile) => {
  if (profile?.isSelf) {
    return "Подберите фон и аватар так, чтобы они работали как единая сцена.";
  }

  return `${profile?.username || "Пользователь"} пока ничего не рассказал о себе.`;
};

const getRelationshipLabel = (profile) => {
  if (profile?.isSelf) {
    return "Это вы";
  }

  return profile?.isFriend ? "Друг" : "Открыт к общению";
};

const getCommonText = (profile) => {
  if (profile?.isSelf) {
    return "Это ваш профиль.";
  }

  return profile?.isFriend ? "Вы друзья." : "Вы пока не в друзьях.";
};

const formatLastSeen = (value) => {
  if (!value) {
    return "Неизвестно";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Неизвестно";
  }

  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
};

const ProfileSectionIcon = ({ kind }) => (
  <span className={`chat-profile-modal__section-icon chat-profile-modal__section-icon--${kind}`} aria-hidden="true">
    <ProfileIcon kind={kind} className="chat-profile-modal__section-svg" />
  </span>
);

export default function TextChatProfileModal({
  profile,
  onClose,
  onOpenDirectChat,
  onStartDirectCall,
  onAddFriend,
  onCopyUserId,
}) {
  if (!profile) {
    return null;
  }

  const backgroundSrc = profile.backgroundUrl || profile.avatarUrl || "";
  const displayName = profile.username || "User";
  const isOnline = isUserCurrentlyOnline(profile);
  const presenceLabel = profile.isSelf ? "Это вы" : formatUserPresenceStatus(profile);
  const relationshipLabel = getRelationshipLabel(profile);
  const detailCards = [
    { id: "activity", icon: "activity", label: "Активность", value: presenceLabel },
    { id: "contact", icon: "contact", label: "Контакт", value: profile.canOpenDirectChat ? "Личные сообщения" : "Недоступно" },
    { id: "id", icon: "id", label: "ID", value: profile.userId ? `#${profile.userId}` : "Не указан" },
  ];

  return (
    <div className="chat-profile-modal-backdrop" onClick={onClose}>
      <div
        className="chat-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Профиль ${displayName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {backgroundSrc ? (
          <AnimatedAvatar
            className="chat-profile-modal__backdrop-media"
            src={backgroundSrc}
            alt=""
            frame={profile.backgroundFrame}
            loading="eager"
            decoding="sync"
            aria-hidden="true"
          />
        ) : (
          <div className="chat-profile-modal__backdrop-fallback" aria-hidden="true" />
        )}
        <div className="chat-profile-modal__backdrop-scrim" aria-hidden="true" />

        <button type="button" className="chat-profile-modal__close" onClick={onClose} aria-label="Закрыть профиль">
          <span className="chat-profile-modal__close-icon" aria-hidden="true" />
        </button>

        <div className="chat-profile-modal__hero">
          <div className="chat-profile-modal__hero-content">
            <AnimatedAvatar
              className="chat-profile-modal__avatar"
              src={profile.avatarUrl}
              alt={displayName}
              frame={profile.avatarFrame}
              loading="eager"
              decoding="sync"
            />
            <div className="chat-profile-modal__identity">
              <strong>{displayName}</strong>
              <div className="chat-profile-modal__chips">
                {profile.isSelf ? <span className="chat-profile-modal__chip">Ваш профиль</span> : null}
                {profile.isFriend ? <span className="chat-profile-modal__chip chat-profile-modal__chip--friend">Друг</span> : null}
                {!profile.isFriend && !profile.isSelf ? <span className="chat-profile-modal__chip">Пользователь</span> : null}
                {profile.userId ? <span className="chat-profile-modal__chip chat-profile-modal__chip--id">#{profile.userId}</span> : null}
              </div>
              <span className={`chat-profile-modal__presence ${isOnline ? "chat-profile-modal__presence--online" : ""}`}>
                <i aria-hidden="true" />
                {presenceLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="chat-profile-modal__body">
          <div className="chat-profile-modal__main">
            <div className="chat-profile-modal__quick-grid" aria-label="Краткая информация">
              {detailCards.map((item) => (
                <div key={item.id} className="chat-profile-modal__quick-card">
                  <ProfileIcon kind={item.icon} className="chat-profile-modal__quick-icon" />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            <section className="chat-profile-modal__section">
              <ProfileSectionIcon kind="about" />
              <div className="chat-profile-modal__section-copy">
                <strong>О себе</strong>
                <p>{getProfileAbout(profile)}</p>
              </div>
            </section>

            <section className="chat-profile-modal__section">
              <ProfileSectionIcon kind="info" />
              <div className="chat-profile-modal__section-copy">
                <strong>Информация</strong>
                <div className="chat-profile-modal__info-list">
                  <div className="chat-profile-modal__info-row">
                    <span>Имя</span>
                    <b>{displayName}</b>
                  </div>
                  <div className="chat-profile-modal__info-row">
                    <span>Статус</span>
                    <b>{relationshipLabel}</b>
                  </div>
                  <div className="chat-profile-modal__info-row">
                    <span>Последний визит</span>
                    <b>{isOnline ? "Сейчас в сети" : formatLastSeen(profile.lastSeenAt)}</b>
                  </div>
                </div>
              </div>
            </section>

            <section className="chat-profile-modal__section">
              <ProfileSectionIcon kind="common" />
              <div className="chat-profile-modal__section-copy">
                <strong>Общее</strong>
                <p>{getCommonText(profile)}</p>
              </div>
            </section>
          </div>

          <aside className="chat-profile-modal__side">
            <div className="chat-profile-modal__actions">
              <button
                type="button"
                className="chat-profile-modal__action chat-profile-modal__action--primary"
                onClick={onOpenDirectChat}
                disabled={!profile.canOpenDirectChat}
              >
                <ProfileIcon kind="message" className="chat-profile-modal__action-icon" />
                Сообщение
              </button>
              <button
                type="button"
                className="chat-profile-modal__action"
                onClick={onStartDirectCall}
                disabled={!profile.canOpenDirectChat || !profile.isFriend || profile.isBlocked || profile.blockedYou || typeof onStartDirectCall !== "function"}
              >
                <ProfileIcon kind="call" className="chat-profile-modal__action-icon" />
                Позвонить
              </button>
              <button
                type="button"
                className="chat-profile-modal__action"
                onClick={onAddFriend}
                disabled={Boolean(profile.isSelf || profile.isFriend)}
              >
                <ProfileIcon kind="friend" className="chat-profile-modal__action-icon" />
                {profile.isFriend ? "Уже в друзьях" : "Добавить в друзья"}
              </button>
              <button type="button" className="chat-profile-modal__action chat-profile-modal__action--ghost" onClick={onCopyUserId}>
                <ProfileIcon kind="copy" className="chat-profile-modal__action-icon" />
                Копировать ID
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

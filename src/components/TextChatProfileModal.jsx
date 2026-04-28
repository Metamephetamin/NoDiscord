import AnimatedAvatar from "./AnimatedAvatar";
import { formatUserPresenceStatus, isUserCurrentlyOnline } from "../utils/menuMainModel";

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

const ProfileSectionIcon = ({ kind }) => (
  <span className={`chat-profile-modal__section-icon chat-profile-modal__section-icon--${kind}`} aria-hidden="true" />
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

  return (
    <div className="chat-profile-modal-backdrop" onClick={onClose}>
      <div
        className="chat-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Профиль ${displayName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="chat-profile-modal__close" onClick={onClose} aria-label="Закрыть профиль">
          <span className="chat-profile-modal__close-icon" aria-hidden="true" />
        </button>

        <div className="chat-profile-modal__hero">
          {backgroundSrc ? (
            <AnimatedAvatar
              className="chat-profile-modal__hero-media"
              src={backgroundSrc}
              alt={displayName}
              frame={profile.backgroundFrame}
              loading="eager"
              decoding="sync"
            />
          ) : (
            <div className="chat-profile-modal__hero-fallback" aria-hidden="true" />
          )}
          <div className="chat-profile-modal__hero-scrim" aria-hidden="true" />
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
                <span className="chat-profile-modal__action-icon chat-profile-modal__action-icon--message" aria-hidden="true" />
                Сообщение
              </button>
              <button
                type="button"
                className="chat-profile-modal__action"
                onClick={onStartDirectCall}
                disabled={!profile.canOpenDirectChat || !profile.isFriend || typeof onStartDirectCall !== "function"}
              >
                <span className="chat-profile-modal__action-icon chat-profile-modal__action-icon--call" aria-hidden="true" />
                Позвонить
              </button>
              <button
                type="button"
                className="chat-profile-modal__action"
                onClick={onAddFriend}
                disabled={Boolean(profile.isSelf || profile.isFriend)}
              >
                <span className="chat-profile-modal__action-icon chat-profile-modal__action-icon--friend" aria-hidden="true" />
                {profile.isFriend ? "Уже в друзьях" : "Добавить в друзья"}
              </button>
              <button type="button" className="chat-profile-modal__action chat-profile-modal__action--ghost" onClick={onCopyUserId}>
                <span className="chat-profile-modal__action-icon chat-profile-modal__action-icon--copy" aria-hidden="true" />
                Копировать ID
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

import AnimatedAvatar from "./AnimatedAvatar";

const getProfileSubtitle = (profile) => {
  if (profile?.isSelf) {
    return "Это вы";
  }

  if (profile?.isFriend) {
    return "У вас уже есть личный чат";
  }

  return profile?.userId ? `ID: ${profile.userId}` : "Профиль пользователя";
};

const getProfileAbout = (profile) => {
  if (profile?.isSelf) {
    return "Подберите фон и аватар так, чтобы они работали как единая сцена. Здесь это особенно хорошо видно.";
  }

  return `${profile?.username || "Пользователь"} пока ничего не рассказал о себе.`;
};

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

  return (
    <div className="chat-profile-modal-backdrop" onClick={onClose}>
      <div
        className="chat-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Профиль ${profile.username || "пользователя"}`}
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
              alt={profile.username || "Фон профиля"}
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
              alt={profile.username || "Аватар"}
              frame={profile.avatarFrame}
              loading="eager"
              decoding="sync"
            />
            <div className="chat-profile-modal__identity">
              <strong>{profile.username || "User"}</strong>
              <span>{getProfileSubtitle(profile)}</span>
            </div>
          </div>
        </div>

        <div className="chat-profile-modal__body">
          <div className="chat-profile-modal__main">
            <div className="chat-profile-modal__chips">
              {profile.isSelf ? <span className="chat-profile-modal__chip">Ваш профиль</span> : null}
              {profile.isFriend ? <span className="chat-profile-modal__chip">Друг</span> : null}
              {!profile.isFriend && !profile.isSelf ? <span className="chat-profile-modal__chip">Пользователь</span> : null}
              {profile.userId ? <span className="chat-profile-modal__chip">#{profile.userId}</span> : null}
            </div>

            <div className="chat-profile-modal__section">
              <span className="chat-profile-modal__eyebrow">Визуал</span>
              <p>
                Фон идет на всю ширину шапки, а аватар полностью лежит внутри композиции слева. Так проще подбирать
                парные картинки и делать профиль более цельным.
              </p>
            </div>

            <div className="chat-profile-modal__section">
              <span className="chat-profile-modal__eyebrow">Описание</span>
              <p>{getProfileAbout(profile)}</p>
            </div>
          </div>

          <aside className="chat-profile-modal__side">
            <div className="chat-profile-modal__actions">
              <button
                type="button"
                className="chat-profile-modal__action chat-profile-modal__action--primary"
                onClick={onOpenDirectChat}
                disabled={!profile.canOpenDirectChat}
              >
                Сообщение
              </button>
              <button
                type="button"
                className="chat-profile-modal__action"
                onClick={onStartDirectCall}
                disabled={!profile.canOpenDirectChat || !profile.isFriend || typeof onStartDirectCall !== "function"}
              >
                Позвонить
              </button>
              <button
                type="button"
                className="chat-profile-modal__action"
                onClick={onAddFriend}
                disabled={Boolean(profile.isSelf || profile.isFriend)}
              >
                {profile.isFriend ? "Уже в друзьях" : "Добавить в друзья"}
              </button>
              <button type="button" className="chat-profile-modal__action chat-profile-modal__action--ghost" onClick={onCopyUserId}>
                Копировать ID
              </button>
            </div>

            <div className="chat-profile-modal__meta">
              <div className="chat-profile-modal__meta-row">
                <span>Имя</span>
                <strong>{profile.username || "User"}</strong>
              </div>
              <div className="chat-profile-modal__meta-row">
                <span>Статус</span>
                <strong>{profile.isSelf ? "Это вы" : profile.isFriend ? "Друг" : "Открыт к общению"}</strong>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

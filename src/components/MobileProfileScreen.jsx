import AnimatedAvatar from "./AnimatedAvatar";
import AnimatedMedia from "./AnimatedMedia";

export default function MobileProfileScreen({
  profileBackgroundSrc,
  profileBackgroundFrame,
  avatarSrc,
  avatarFrame,
  displayName,
  email,
  isSpeaking,
  currentVoiceChannelName,
  onChangeAvatar,
  onChangeBackground,
  onOpenProfileSettings,
  onOpenVoiceSettings,
  onOpenNotificationSettings,
  onLogout,
}) {
  return (
    <section className="mobile-profile-screen">
      <div className="mobile-profile-screen__hero">
        {profileBackgroundSrc ? (
          <AnimatedMedia
            className="mobile-profile-screen__cover-media"
            src={profileBackgroundSrc}
            alt=""
            frame={profileBackgroundFrame}
          />
        ) : (
          <div className="mobile-profile-screen__cover-fallback" aria-hidden="true" />
        )}
        <div className="mobile-profile-screen__cover-overlay" aria-hidden="true" />
        <div className="mobile-profile-screen__hero-topbar">
          <button type="button" className="mobile-profile-screen__toolbar-button" onClick={onChangeBackground}>
            Сменить фон
          </button>
          <button type="button" className="mobile-profile-screen__toolbar-button" onClick={onOpenProfileSettings}>
            Профиль
          </button>
        </div>
        <div className="mobile-profile-screen__hero-main">
          <button type="button" className="mobile-profile-screen__avatar-button" onClick={onChangeAvatar}>
            <AnimatedAvatar
              className={`mobile-profile-screen__avatar ${isSpeaking ? "mobile-profile-screen__avatar--speaking" : ""}`}
              src={avatarSrc}
              alt={displayName}
              frame={avatarFrame}
              loading="eager"
              decoding="sync"
            />
          </button>
          <div className="mobile-profile-screen__identity">
            <h1>{displayName}</h1>
            <p>{email || "Ваш аккаунт Tend"}</p>
          </div>
        </div>
        <div className="mobile-profile-screen__hero-actions">
          <button type="button" className="mobile-profile-screen__primary" onClick={onOpenProfileSettings}>
            Редактировать профиль
          </button>
          <button type="button" className="mobile-profile-screen__secondary" onClick={onChangeBackground}>
            Сменить фон
          </button>
        </div>
      </div>

      <div className="mobile-profile-screen__cards">
        <button type="button" className="mobile-profile-screen__card mobile-profile-screen__card--action" onClick={onOpenProfileSettings}>
          <strong>Имя и профиль</strong>
          <span>Изменить имя, фамилию, открыть настройки аккаунта и проверить текущий email.</span>
        </button>
        <button type="button" className="mobile-profile-screen__card mobile-profile-screen__card--action" onClick={onChangeAvatar}>
          <strong>Аватарка</strong>
          <span>Загрузить новую статичную или анимированную аватарку для профиля.</span>
        </button>
        <button type="button" className="mobile-profile-screen__card mobile-profile-screen__card--action" onClick={onOpenVoiceSettings}>
          <strong>Голос и видео</strong>
          <span>Микрофон, камера, устройства и чувствительность.</span>
        </button>
        <button type="button" className="mobile-profile-screen__card mobile-profile-screen__card--action" onClick={onOpenNotificationSettings}>
          <strong>Уведомления</strong>
          <span>Личные чаты, серверы и звуки оповещений.</span>
        </button>
        <div className="mobile-profile-screen__card">
          <strong>Аккаунт</strong>
          <span>{currentVoiceChannelName ? `Подключено к ${currentVoiceChannelName}` : "Сейчас вы не в голосовом канале."}</span>
        </div>
        <div className="mobile-profile-screen__card mobile-profile-screen__card--danger">
          <button type="button" className="mobile-profile-screen__danger-button" onClick={onLogout}>
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </section>
  );
}

import AnimatedAvatar from "./AnimatedAvatar";
import "../css/AccountBannedScreen.css";
import { resolveStaticAssetUrl } from "../utils/media";
import { formatBannedAt, normalizeBannedAccount } from "../utils/accountBan";

const BAN_BACKGROUND_VIDEO_URL = resolveStaticAssetUrl("/video/GoldenDustGlow2.mp4");
const BAN_BACKGROUND_POSTER_URL = resolveStaticAssetUrl("/video/GoldenDustGlow2-poster.jpg");

export default function AccountBannedScreen({ account, onBackToLogin }) {
  const bannedAccount = normalizeBannedAccount(account) || {};
  const bannedAt = formatBannedAt(bannedAccount.bannedAt);
  const reason = String(bannedAccount.banReason || "").trim() || "Причина не указана. Если это ошибка, обратитесь к администрации.";

  return (
    <main className="ban-page">
      <video
        className="ban-page__video"
        src={BAN_BACKGROUND_VIDEO_URL}
        poster={BAN_BACKGROUND_POSTER_URL}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="ban-page__shade" aria-hidden="true" />

      <section className="ban-card" aria-labelledby="ban-title">
        <div className="ban-card__character" aria-hidden="true">
          <div className="ban-girl">
            <div className="ban-girl__hair ban-girl__hair--back" />
            <div className="ban-girl__head">
              <div className="ban-girl__bang ban-girl__bang--left" />
              <div className="ban-girl__bang ban-girl__bang--right" />
              <div className="ban-girl__eye ban-girl__eye--left" />
              <div className="ban-girl__eye ban-girl__eye--right" />
              <div className="ban-girl__mouth" />
            </div>
            <div className="ban-girl__hand ban-girl__hand--left" />
            <div className="ban-girl__hand ban-girl__hand--right" />
          </div>
        </div>

        <div className="ban-card__content">
          <span className="ban-card__eyebrow">Доступ закрыт</span>
          <h1 id="ban-title">Аккаунт заблокирован</h1>
          <p className="ban-card__lead">Эта учётная запись больше не может входить в Lanaya.</p>

          <div className="ban-profile">
            <AnimatedAvatar
              className="ban-profile__avatar"
              src={bannedAccount.avatarUrl || ""}
              alt={bannedAccount.displayName || "Пользователь"}
            />
            <div className="ban-profile__copy">
              <strong>{bannedAccount.displayName || "Пользователь"}</strong>
              {bannedAccount.email ? <span>{bannedAccount.email}</span> : null}
            </div>
          </div>

          <div className="ban-reason">
            <span>Причина бана</span>
            <p>{reason}</p>
          </div>

          {bannedAt ? (
            <div className="ban-card__meta">
              <span>Заблокирован</span>
              <strong>{bannedAt}</strong>
            </div>
          ) : null}

          <button type="button" className="ban-card__button" onClick={onBackToLogin}>
            Вернуться к входу
          </button>
        </div>
      </section>
    </main>
  );
}

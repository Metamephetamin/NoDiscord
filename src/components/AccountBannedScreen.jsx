import AnimatedAvatar from "./AnimatedAvatar";
import "../css/AccountBannedScreen.css";
import { formatBannedAt, normalizeBannedAccount } from "../utils/accountBan";

export default function AccountBannedScreen({ account, onBackToLogin }) {
  const bannedAccount = normalizeBannedAccount(account) || {};
  const bannedAt = formatBannedAt(bannedAccount.bannedAt);
  const reason = String(bannedAccount.banReason || "").trim() || "Причина не указана. Если это ошибка, обратитесь к администрации.";

  return (
    <main className="ban-page">
      <div className="ban-page__shade" aria-hidden="true" />

      <section className="ban-card" aria-labelledby="ban-title">
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

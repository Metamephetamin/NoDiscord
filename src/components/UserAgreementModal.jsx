import { USER_AGREEMENT_SECTIONS, USER_AGREEMENT_VERSION } from "../legal/userAgreementText";

export default function UserAgreementModal({ open, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div className="auth-terms-modal" role="dialog" aria-modal="true" aria-labelledby="auth-terms-title">
      <div className="auth-terms-modal__backdrop" onClick={onClose} />
      <section className="auth-terms-modal__panel">
        <header className="auth-terms-modal__header">
          <div>
            <span className="auth-terms-modal__badge">Редакция РФ · физическое лицо</span>
            <h2 id="auth-terms-title">Пользовательское соглашение</h2>
            <p>
              Кратко описывает правила сервиса, обработку данных, ответственность пользователя
              и технические ограничения Lanaya.
            </p>
            <span className="auth-terms-modal__version">Версия {USER_AGREEMENT_VERSION}</span>
          </div>
          <button type="button" className="auth-terms-modal__close" onClick={onClose} aria-label="Закрыть соглашение">
            x
          </button>
        </header>
        <div className="auth-terms-modal__body">
          {USER_AGREEMENT_SECTIONS.map((section) => (
            <section key={section.title} className="auth-terms-modal__section">
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        <footer className="auth-terms-modal__footer">
          <button type="button" className="auth-submit auth-submit--secondary" onClick={onClose}>
            Понятно
          </button>
        </footer>
      </section>
    </div>
  );
}

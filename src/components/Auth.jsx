import { useMemo, useState } from "react";
import "../css/Auth.css";
import { API_BASE_URL } from "../config/runtime";
import { getApiErrorMessage, parseApiResponse } from "../utils/auth";

const initialRegisterForm = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  passportSeries: "",
  passportNumber: "",
  snils: "",
  inn: "",
  residence: "",
  birthDate: "",
  phone: "",
  foreignPassportSeries: "",
  foreignPassportNumber: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvc: "",
};

const initialLoginForm = {
  email: "",
  password: "",
};

const formatCardNumber = (value) =>
  value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();

const formatCardExpiry = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const formatPhone = (value) => value.replace(/[^\d+\-()\s]/g, "").slice(0, 22);

function mapAuthUser(data) {
  return {
    id: data?.id,
    firstName: data?.first_name || "",
    lastName: data?.last_name || "",
    email: data?.email || "",
  };
}

async function submitAuthRequest(endpoint, payload, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, data, fallbackMessage));
  }

  return data;
}

export default function Auth({ onAuthSuccess }) {
  const [mode, setMode] = useState("login");
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [passportScanFile, setPassportScanFile] = useState(null);
  const [facePhotoFile, setFacePhotoFile] = useState(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  const cardHolderName = useMemo(() => {
    const composed = `${registerForm.firstName} ${registerForm.lastName}`.trim();
    return composed || "Ваше имя";
  }, [registerForm.firstName, registerForm.lastName]);

  const displayedCardNumber = useMemo(() => {
    const formatted = formatCardNumber(registerForm.cardNumber);
    return formatted || "0000 0000 0000 0000";
  }, [registerForm.cardNumber]);

  const displayedCardExpiry = useMemo(
    () => formatCardExpiry(registerForm.cardExpiry) || "MM/YY",
    [registerForm.cardExpiry]
  );

  const displayedCardCvc = useMemo(() => {
    const digits = registerForm.cardCvc.replace(/\D/g, "").slice(0, 3);
    return digits || "000";
  }, [registerForm.cardCvc]);

  const handleRegisterFieldChange = (field) => (event) => {
    let nextValue = event.target.value;

    if (field === "cardNumber") {
      nextValue = formatCardNumber(nextValue);
    } else if (field === "cardExpiry") {
      nextValue = formatCardExpiry(nextValue);
    } else if (field === "cardCvc") {
      nextValue = nextValue.replace(/\D/g, "").slice(0, 3);
    } else if (field === "phone") {
      nextValue = formatPhone(nextValue);
    }

    setRegisterForm((previous) => ({ ...previous, [field]: nextValue }));
  };

  const handleLoginFieldChange = (field) => (event) => {
    setLoginForm((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");

    const payload = {
      email: loginForm.email.trim(),
      password: loginForm.password,
    };

    if (!payload.email || !payload.password) {
      setMessage("Введите email и пароль.");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest("/auth/login", payload, "Не удалось войти в аккаунт.");
      onAuthSuccess(mapAuthUser(data), data.token);
    } catch (error) {
      setMessage(error.message || "Не удалось войти в аккаунт.");
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage("");

    const payload = {
      first_name: registerForm.firstName.trim(),
      last_name: registerForm.lastName.trim(),
      email: registerForm.email.trim(),
      password: registerForm.password,
      passport_series: registerForm.passportSeries.trim(),
      passport_number: registerForm.passportNumber.trim(),
      snils: registerForm.snils.trim(),
      inn: registerForm.inn.trim(),
      residence: registerForm.residence.trim(),
      birth_date: registerForm.birthDate || "",
      phone: registerForm.phone.trim(),
      foreign_passport_series: registerForm.foreignPassportSeries.trim(),
      foreign_passport_number: registerForm.foreignPassportNumber.trim(),
      card_number: registerForm.cardNumber.replace(/\s/g, ""),
      card_expiry: registerForm.cardExpiry.trim(),
      passport_scan_name: passportScanFile?.name || "",
      face_photo_name: facePhotoFile?.name || "",
    };

    if (!payload.first_name || !payload.last_name || !payload.email) {
      setMessage("Заполните обязательные поля.");
      return;
    }

    if (payload.password.length < 6) {
      setMessage("Пароль должен быть не короче 6 символов.");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest("/auth/register", payload, "Не удалось создать аккаунт.");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      onAuthSuccess(mapAuthUser(data), data.token);
    } catch (error) {
      setMessage(error.message || "Не удалось создать аккаунт.");
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setIsSubmitting(false);
  };

  return (
    <div className="auth-page">
      <video className="auth-video-bg" autoPlay muted loop playsInline>
        <source src="/image/grad.mp4" type="video/mp4" />
      </video>

      <div className="auth-brand">
        <div className="auth-brand__badge">
          <img className="auth-brand__logo" src="/image/image.png" alt="MAX" />
        </div>
        <div className="auth-brand__copy">
          <span className="auth-brand__name">MAX</span>
          <h1 className="auth-brand__title">Связь без лишнего шума</h1>
        </div>
      </div>

      <form className="auth-card auth-card--wide" onSubmit={mode === "login" ? handleLogin : handleRegister}>
        <div className="auth-card__main">
          <div className="auth-card__heading">
            <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
            <p className="auth-subtitle">
              {mode === "login"
                ? "Войдите в аккаунт, чтобы снова получить доступ к серверам, чату и приглашениям."
                : "Создайте аккаунт. Дополнительные поля можно заполнить сразу или оставить на потом."}
            </p>
          </div>

          <div className="auth-grid auth-grid--double">
            <button
              type="button"
              className={`auth-mode-button ${mode === "login" ? "auth-mode-button--active" : ""}`}
              onClick={() => switchMode("login")}
              disabled={mode === "login" || isSubmitting}
            >
              Войти
            </button>
            <button
              type="button"
              className={`auth-mode-button ${mode === "register" ? "auth-mode-button--active" : ""}`}
              onClick={() => switchMode("register")}
              disabled={mode === "register" || isSubmitting}
            >
              Зарегистрироваться
            </button>
          </div>

          {mode === "login" ? (
            <div className="auth-section">
              <div className="auth-section__title">Данные для входа</div>
              <input
                className="auth-input"
                placeholder="Email"
                type="email"
                value={loginForm.email}
                onChange={handleLoginFieldChange("email")}
                required
              />
              <input
                className="auth-input"
                placeholder="Пароль"
                type="password"
                value={loginForm.password}
                onChange={handleLoginFieldChange("password")}
                required
              />
            </div>
          ) : (
            <>
              <div className="auth-section">
                <div className="auth-section__title">Обязательные данные</div>
                <div className="auth-grid auth-grid--double">
                  <input
                    className="auth-input"
                    placeholder="Имя"
                    value={registerForm.firstName}
                    onChange={handleRegisterFieldChange("firstName")}
                    required
                  />
                  <input
                    className="auth-input"
                    placeholder="Фамилия"
                    value={registerForm.lastName}
                    onChange={handleRegisterFieldChange("lastName")}
                    required
                  />
                </div>
                <input
                  className="auth-input"
                  placeholder="Email"
                  type="email"
                  value={registerForm.email}
                  onChange={handleRegisterFieldChange("email")}
                  required
                />
                <input
                  className="auth-input"
                  placeholder="Пароль"
                  type="password"
                  value={registerForm.password}
                  onChange={handleRegisterFieldChange("password")}
                  minLength={6}
                  required
                />
              </div>

              <div className="auth-section">
                <div className="auth-section__title">Дополнительные данные</div>
                <div className="auth-grid auth-grid--triple">
                  <input
                    className="auth-input"
                    placeholder="Серия паспорта"
                    value={registerForm.passportSeries}
                    onChange={handleRegisterFieldChange("passportSeries")}
                  />
                  <input
                    className="auth-input"
                    placeholder="Номер паспорта"
                    value={registerForm.passportNumber}
                    onChange={handleRegisterFieldChange("passportNumber")}
                  />
                  <input className="auth-input" placeholder="СНИЛС" value={registerForm.snils} onChange={handleRegisterFieldChange("snils")} />
                  <input className="auth-input" placeholder="ИНН" value={registerForm.inn} onChange={handleRegisterFieldChange("inn")} />
                  <input
                    className="auth-input"
                    type="date"
                    placeholder="Дата рождения"
                    value={registerForm.birthDate}
                    onChange={handleRegisterFieldChange("birthDate")}
                  />
                  <input
                    className="auth-input"
                    placeholder="Номер телефона"
                    value={registerForm.phone}
                    onChange={handleRegisterFieldChange("phone")}
                  />
                </div>
                <input
                  className="auth-input"
                  placeholder="Место жительства"
                  value={registerForm.residence}
                  onChange={handleRegisterFieldChange("residence")}
                />
                <div className="auth-grid auth-grid--double">
                  <input
                    className="auth-input"
                    placeholder="Серия загранпаспорта"
                    value={registerForm.foreignPassportSeries}
                    onChange={handleRegisterFieldChange("foreignPassportSeries")}
                  />
                  <input
                    className="auth-input"
                    placeholder="Номер загранпаспорта"
                    value={registerForm.foreignPassportNumber}
                    onChange={handleRegisterFieldChange("foreignPassportNumber")}
                  />
                </div>
                <div className="auth-grid auth-grid--double">
                  <label className="auth-file">
                    <span className="auth-file__label">Скан паспорта</span>
                    <input type="file" accept="image/*,.pdf" onChange={(event) => setPassportScanFile(event.target.files?.[0] || null)} />
                    <span className="auth-file__value">{passportScanFile?.name || "Выбрать файл"}</span>
                  </label>
                  <label className="auth-file">
                    <span className="auth-file__label">Фото лица</span>
                    <input type="file" accept="image/*" onChange={(event) => setFacePhotoFile(event.target.files?.[0] || null)} />
                    <span className="auth-file__value">{facePhotoFile?.name || "Выбрать файл"}</span>
                  </label>
                </div>
              </div>
            </>
          )}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "login"
                ? "Входим..."
                : "Создаем аккаунт..."
              : mode === "login"
                ? "Войти"
                : "Зарегистрироваться"}
          </button>

          {message && <p className="auth-message">{message}</p>}
        </div>

        <aside className="auth-card__side">
          {mode === "login" ? (
            <>
              <div className="auth-side__title">Что изменилось</div>
              <p className="auth-side__subtitle">
                Защита backend стала строже: чат, приглашения и загрузки теперь требуют корректный токен. Если сессия устарела,
                приложение попросит войти заново вместо бесконечных 401 и падений в интерфейсе.
              </p>
            </>
          ) : (
            <>
              <div className="auth-side__title">Платежная карта</div>
              <p className="auth-side__subtitle">
                Эти поля необязательны. Карта обновляется во время ввода, а при переходе к CVC разворачивается.
              </p>

              <div className={`bank-card ${isCardFlipped ? "bank-card--flipped" : ""}`}>
                <div className="bank-card__face bank-card__face--front">
                  <div className="bank-card__brand">MAX PAY</div>
                  <div className="bank-card__number">{displayedCardNumber}</div>
                  <div className="bank-card__meta">
                    <div>
                      <span className="bank-card__label">Держатель</span>
                      <span className="bank-card__value">{cardHolderName}</span>
                    </div>
                    <div>
                      <span className="bank-card__label">Срок</span>
                      <span className="bank-card__value">{displayedCardExpiry}</span>
                    </div>
                  </div>
                </div>

                <div className="bank-card__face bank-card__face--back">
                  <div className="bank-card__stripe" />
                  <div className="bank-card__cvc-box">
                    <span className="bank-card__label">CVC</span>
                    <span className="bank-card__cvc">{displayedCardCvc}</span>
                  </div>
                </div>
              </div>

              <div className="auth-grid auth-grid--double auth-grid--card">
                <input
                  className="auth-input"
                  placeholder="Номер карты"
                  value={registerForm.cardNumber}
                  onChange={handleRegisterFieldChange("cardNumber")}
                  onFocus={() => setIsCardFlipped(false)}
                />
                <input
                  className="auth-input"
                  placeholder="Срок действия"
                  value={registerForm.cardExpiry}
                  onChange={handleRegisterFieldChange("cardExpiry")}
                  onFocus={() => setIsCardFlipped(false)}
                />
                <input
                  className="auth-input auth-input--compact"
                  placeholder="CVC"
                  value={registerForm.cardCvc}
                  onChange={handleRegisterFieldChange("cardCvc")}
                  onFocus={() => setIsCardFlipped(true)}
                  onBlur={() => setIsCardFlipped(false)}
                />
              </div>
            </>
          )}
        </aside>
      </form>
    </div>
  );
}

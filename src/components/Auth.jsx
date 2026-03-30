import { useMemo, useState } from "react";
import "../css/Auth.css";
import { API_BASE_URL } from "../config/runtime";
import { getApiErrorMessage, parseApiResponse } from "../utils/auth";

const SUPPORTED_EMAIL_DOMAINS = ["gmail.com", "yandex.ru", "list.ru", "mail.ru"];
const initialRegisterForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvc: "",
};
const initialLoginForm = {
  identifier: "",
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

const formatPhoneInput = (value) => value.replace(/[^\d+\-()\s]/g, "").slice(0, 22);

function normalizeRussianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.length === 11 && digits[0] === "8") {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits[0] === "7") {
    return `+${digits}`;
  }

  return "";
}

function isSupportedEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const separatorIndex = normalized.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return false;
  }

  return SUPPORTED_EMAIL_DOMAINS.includes(normalized.slice(separatorIndex + 1));
}

function mapAuthUser(data) {
  return {
    id: data?.id,
    firstName: data?.first_name || "",
    lastName: data?.last_name || "",
    email: data?.email || "",
    phoneNumber: data?.phone_number || "",
    isPhoneVerified: Boolean(data?.is_phone_verified),
    avatarUrl: data?.avatar_url || data?.avatarUrl || "",
    avatar: data?.avatar_url || data?.avatarUrl || "",
  };
}

function mapAuthSession(data) {
  return {
    accessToken: data?.token || "",
    refreshToken: data?.refreshToken || "",
    accessTokenExpiresAt: data?.accessTokenExpiresAt || "",
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
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingPhoneCode, setIsRequestingPhoneCode] = useState(false);
  const [isVerifyingPhoneCode, setIsVerifyingPhoneCode] = useState(false);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState("");
  const [phoneVerificationToken, setPhoneVerificationToken] = useState("");
  const [phoneVerificationStatus, setPhoneVerificationStatus] = useState({
    verified: false,
    deliveryMode: "",
    debugCode: "",
    resendAvailableAt: "",
  });

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

  const normalizedRegisterPhone = useMemo(() => normalizeRussianPhone(registerForm.phone), [registerForm.phone]);
  const canRequestPhoneCode = Boolean(normalizedRegisterPhone) && !isSubmitting && !isRequestingPhoneCode;
  const canVerifyPhoneCode =
    Boolean(phoneVerificationToken) &&
    phoneVerificationCode.trim().length === 6 &&
    !phoneVerificationStatus.verified &&
    !isVerifyingPhoneCode;

  const resetPhoneVerification = () => {
    setPhoneVerificationCode("");
    setPhoneVerificationToken("");
    setPhoneVerificationStatus({
      verified: false,
      deliveryMode: "",
      debugCode: "",
      resendAvailableAt: "",
    });
  };

  const handleRegisterFieldChange = (field) => (event) => {
    let nextValue = event.target.value;

    if (field === "cardNumber") {
      nextValue = formatCardNumber(nextValue);
    } else if (field === "cardExpiry") {
      nextValue = formatCardExpiry(nextValue);
    } else if (field === "cardCvc") {
      nextValue = nextValue.replace(/\D/g, "").slice(0, 3);
    } else if (field === "phone") {
      nextValue = formatPhoneInput(nextValue);
    }

    setRegisterForm((previous) => ({ ...previous, [field]: nextValue }));

    if (field === "phone") {
      resetPhoneVerification();
    }
  };

  const handleLoginFieldChange = (field) => (event) => {
    setLoginForm((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");

    const payload = {
      identifier: loginForm.identifier.trim(),
      password: loginForm.password,
    };

    if (!payload.identifier || !payload.password) {
      setMessage("Введите email или номер телефона и пароль.");
      return;
    }

    if (payload.identifier.includes("@") && !isSupportedEmail(payload.identifier)) {
      setMessage("Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.");
      return;
    }

    if (!payload.identifier.includes("@") && !normalizeRussianPhone(payload.identifier)) {
      setMessage("Введите российский номер телефона в формате +7XXXXXXXXXX.");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest("/auth/login", payload, "Не удалось войти в аккаунт.");
      onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
    } catch (error) {
      setMessage(error.message || "Не удалось войти в аккаунт.");
      setIsSubmitting(false);
    }
  };

  const handleRequestPhoneCode = async () => {
    setMessage("");

    if (!normalizedRegisterPhone) {
      setMessage("Введите российский номер телефона в формате +7XXXXXXXXXX.");
      return;
    }

    setIsRequestingPhoneCode(true);
    try {
      const data = await submitAuthRequest(
        "/auth/request-phone-verification",
        { phone: normalizedRegisterPhone },
        "Не удалось отправить код подтверждения."
      );

      setPhoneVerificationToken(data?.verificationToken || "");
      setPhoneVerificationStatus({
        verified: false,
        deliveryMode: data?.deliveryMode || "mock",
        debugCode: data?.debugCode || "",
        resendAvailableAt: data?.resendAvailableAt || "",
      });
      setMessage(
        data?.debugCode
          ? `Код подтверждения отправлен. Тестовый код: ${data.debugCode}`
          : "Код подтверждения отправлен на номер телефона."
      );
    } catch (error) {
      setMessage(error.message || "Не удалось отправить код подтверждения.");
    } finally {
      setIsRequestingPhoneCode(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    setMessage("");

    if (!normalizedRegisterPhone || !phoneVerificationToken) {
      setMessage("Сначала запросите код подтверждения.");
      return;
    }

    setIsVerifyingPhoneCode(true);
    try {
      await submitAuthRequest(
        "/auth/verify-phone-code",
        {
          phone: normalizedRegisterPhone,
          verificationToken: phoneVerificationToken,
          code: phoneVerificationCode.trim(),
        },
        "Не удалось подтвердить номер телефона."
      );

      setPhoneVerificationStatus((previous) => ({
        ...previous,
        verified: true,
      }));
      setMessage("Номер телефона подтвержден.");
    } catch (error) {
      setMessage(error.message || "Не удалось подтвердить номер телефона.");
    } finally {
      setIsVerifyingPhoneCode(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage("");

    const payload = {
      first_name: registerForm.firstName.trim(),
      last_name: registerForm.lastName.trim(),
      email: registerForm.email.trim().toLowerCase(),
      password: registerForm.password,
      phone: normalizedRegisterPhone,
      phone_verification_token: phoneVerificationToken,
    };

    if (!payload.first_name || !payload.last_name || !payload.email || !payload.phone) {
      setMessage("Заполните обязательные поля.");
      return;
    }

    if (!isSupportedEmail(payload.email)) {
      setMessage("Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.");
      return;
    }

    if (payload.password.length < 6) {
      setMessage("Пароль должен быть не короче 6 символов.");
      return;
    }

    if (!phoneVerificationStatus.verified || !phoneVerificationToken) {
      setMessage("Сначала подтвердите номер телефона кодом.");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest("/auth/register", payload, "Не удалось создать аккаунт.");
      onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
    } catch (error) {
      setMessage(error.message || "Не удалось создать аккаунт.");
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setIsSubmitting(false);
    setIsRequestingPhoneCode(false);
    setIsVerifyingPhoneCode(false);
  };

  return (
    <div className="auth-page">
      <video className="auth-video-bg" autoPlay muted loop playsInline>
        <source src="/video/GoldenDustGlow2.mp4" type="video/mp4" />
      </video>

      <div className="auth-brand">
        <div className="auth-brand__badge">
          <img className="auth-brand__logo" src="/image/image.png" alt="MAX" />
        </div>
        <div className="auth-brand__copy">
          <span className="auth-brand__name">MAX</span>
          <h1 className="auth-brand__title">- за нами светлое будущее</h1>
        </div>
      </div>

      <form
        className={`auth-card auth-card--wide ${mode === "login" ? "auth-card--login" : ""}`}
        onSubmit={mode === "login" ? handleLogin : handleRegister}
      >
        <div className="auth-card__main">
          <div className="auth-card__heading">
            <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
            <p className="auth-subtitle"></p>
          </div>

          {mode === "login" ? (
            <div className="auth-section">
              <div className="auth-section__title">Данные для входа</div>
              <input
                className="auth-input"
                placeholder="Email или телефон"
                type="text"
                value={loginForm.identifier}
                onChange={handleLoginFieldChange("identifier")}
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
                  placeholder="Номер телефона"
                  type="tel"
                  value={registerForm.phone}
                  onChange={handleRegisterFieldChange("phone")}
                  required
                />

                <div className="auth-phone-verify">
                  <button
                    className="auth-submit auth-submit--secondary"
                    type="button"
                    onClick={handleRequestPhoneCode}
                    disabled={!canRequestPhoneCode}
                  >
                    {isRequestingPhoneCode ? "Отправляем код..." : "Получить код"}
                  </button>

                  <div className="auth-grid auth-grid--double auth-grid--verify">
                    <input
                      className="auth-input"
                      placeholder="Код из SMS"
                      value={phoneVerificationCode}
                      onChange={(event) => setPhoneVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <button
                      className="auth-submit auth-submit--secondary"
                      type="button"
                      onClick={handleVerifyPhoneCode}
                      disabled={!canVerifyPhoneCode}
                    >
                      {isVerifyingPhoneCode ? "Проверяем..." : phoneVerificationStatus.verified ? "Номер подтвержден" : "Подтвердить"}
                    </button>
                  </div>

                  {phoneVerificationStatus.resendAvailableAt ? (
                    <div className="auth-hint">
                      Повторная отправка будет доступна позже. Режим доставки: {phoneVerificationStatus.deliveryMode || "mock"}.
                    </div>
                  ) : null}
                </div>

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

          <button
            type="button"
            className="auth-switch-link"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
            disabled={isSubmitting}
          >
            {mode === "login" ? "Нет аккаунта ?" : "Уже есть аккаунт ?"}
          </button>

          {message && <p className="auth-message">{message}</p>}
        </div>

        <aside className="auth-card__side">
          <div className="auth-side__title">Платежная карта</div>
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
                <span>Показываем только визуальный макет</span>
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
        </aside>
      </form>
    </div>
  );
}

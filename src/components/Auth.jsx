import { useMemo, useState } from "react";
import "../css/Auth.css";
import { API_BASE_URL } from "../config/runtime";
import { getApiErrorMessage, parseApiResponse } from "../utils/auth";

const SUPPORTED_EMAIL_DOMAINS = ["gmail.com", "yandex.ru", "list.ru", "mail.ru"];

const initialRegisterForm = {
  firstName: "",
  lastName: "",
  contact: "",
  password: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvc: "",
};

const initialLoginForm = {
  identifier: "",
  password: "",
};

const initialPhoneVerificationStatus = {
  verified: false,
  deliveryMode: "",
  debugCode: "",
  resendAvailableAt: "",
};

const initialEmailVerificationModal = {
  open: false,
  email: "",
  verificationToken: "",
  deliveryMode: "",
  debugCode: "",
  resendAvailableAt: "",
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

function normalizeContactInput(value) {
  const candidate = String(value || "");

  if (candidate.includes("@") || /[a-zA-Zа-яА-Я]/.test(candidate)) {
    return candidate.trimStart().slice(0, 120);
  }

  return formatPhoneInput(candidate);
}

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

function detectContactKind(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  if (candidate.includes("@")) {
    return "email";
  }

  const digits = candidate.replace(/\D/g, "");
  if (digits.length > 0) {
    return "phone";
  }

  return "";
}

function mapAuthUser(data) {
  return {
    id: data?.id,
    firstName: data?.first_name || "",
    lastName: data?.last_name || "",
    email: data?.email || "",
    isEmailVerified: Boolean(data?.is_email_verified),
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
  const [phoneVerificationStatus, setPhoneVerificationStatus] = useState(initialPhoneVerificationStatus);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerificationModal, setEmailVerificationModal] = useState(initialEmailVerificationModal);
  const [isResendingEmailCode, setIsResendingEmailCode] = useState(false);
  const [isVerifyingEmailCode, setIsVerifyingEmailCode] = useState(false);

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

  const registerContactKind = useMemo(() => detectContactKind(registerForm.contact), [registerForm.contact]);
  const normalizedRegisterPhone = useMemo(
    () => (registerContactKind === "phone" ? normalizeRussianPhone(registerForm.contact) : ""),
    [registerContactKind, registerForm.contact]
  );
  const normalizedRegisterEmail = useMemo(
    () => (registerContactKind === "email" ? registerForm.contact.trim().toLowerCase() : ""),
    [registerContactKind, registerForm.contact]
  );

  const canRequestPhoneCode =
    registerContactKind === "phone" && Boolean(normalizedRegisterPhone) && !isSubmitting && !isRequestingPhoneCode;
  const canVerifyPhoneCode =
    registerContactKind === "phone" &&
    Boolean(phoneVerificationToken) &&
    phoneVerificationCode.trim().length === 6 &&
    !phoneVerificationStatus.verified &&
    !isVerifyingPhoneCode;

  const resetPhoneVerification = () => {
    setPhoneVerificationCode("");
    setPhoneVerificationToken("");
    setPhoneVerificationStatus(initialPhoneVerificationStatus);
  };

  const resetEmailVerificationModal = () => {
    setEmailVerificationCode("");
    setEmailVerificationModal(initialEmailVerificationModal);
  };

  const handleRegisterFieldChange = (field) => (event) => {
    let nextValue = event.target.value;

    if (field === "cardNumber") {
      nextValue = formatCardNumber(nextValue);
    } else if (field === "cardExpiry") {
      nextValue = formatCardExpiry(nextValue);
    } else if (field === "cardCvc") {
      nextValue = nextValue.replace(/\D/g, "").slice(0, 3);
    } else if (field === "contact") {
      nextValue = normalizeContactInput(nextValue);
    }

    setRegisterForm((previous) => ({ ...previous, [field]: nextValue }));

    if (field === "contact") {
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
          ? `Код подтверждения получен. Тестовый код: ${data.debugCode}`
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

      setPhoneVerificationStatus((previous) => ({ ...previous, verified: true }));
      setMessage("Номер телефона подтверждён.");
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
      password: registerForm.password,
      ...(registerContactKind === "email" ? { email: normalizedRegisterEmail } : {}),
      ...(registerContactKind === "phone"
        ? {
            phone: normalizedRegisterPhone,
            phone_verification_token: phoneVerificationToken,
          }
        : {}),
    };

    if (!payload.first_name || !payload.last_name || !registerForm.contact.trim()) {
      setMessage("Заполните обязательные поля.");
      return;
    }

    if (registerContactKind === "email") {
      if (!isSupportedEmail(payload.email)) {
        setMessage("Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.");
        return;
      }
    } else if (registerContactKind === "phone") {
      if (!normalizedRegisterPhone) {
        setMessage("Введите российский номер телефона в формате +7XXXXXXXXXX.");
        return;
      }

      if (!phoneVerificationStatus.verified || !phoneVerificationToken) {
        setMessage("Сначала подтвердите номер телефона кодом.");
        return;
      }
    } else {
      setMessage("Введите email или номер телефона.");
      return;
    }

    if (payload.password.length < 6) {
      setMessage("Пароль должен быть не короче 6 символов.");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest("/auth/register", payload, "Не удалось создать аккаунт.");

      if (data?.token) {
        onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
        return;
      }

      const verification = data?.verification || {};
      const deliveryMode = verification?.deliveryMode || "mock";
      const debugCode = verification?.debugCode || "";

      setEmailVerificationCode("");
      setEmailVerificationModal({
        open: true,
        email: verification?.email || payload.email,
        verificationToken: verification?.verificationToken || "",
        deliveryMode,
        debugCode,
        resendAvailableAt: verification?.resendAvailableAt || "",
      });

      setMessage(
        deliveryMode === "mock"
          ? `Аккаунт создан. В этой сборке письмо не отправляется: используйте тестовый код ${debugCode || "из окна подтверждения"}.`
          : "Аккаунт создан. Подтвердите почту кодом из письма."
      );
      setIsSubmitting(false);
    } catch (error) {
      setMessage(error.message || "Не удалось создать аккаунт.");
      setIsSubmitting(false);
    }
  };

  const handleResendEmailCode = async () => {
    if (!emailVerificationModal.email) {
      setMessage("Сначала зарегистрируйтесь заново.");
      return;
    }

    setIsResendingEmailCode(true);
    setMessage("");

    try {
      const data = await submitAuthRequest(
        "/auth/resend-email-verification",
        { email: emailVerificationModal.email },
        "Не удалось повторно отправить код на почту."
      );

      const deliveryMode = data?.deliveryMode || emailVerificationModal.deliveryMode || "mock";
      const debugCode = data?.debugCode || "";

      setEmailVerificationModal((previous) => ({
        ...previous,
        open: true,
        verificationToken: data?.verificationToken || previous.verificationToken,
        deliveryMode,
        debugCode,
        resendAvailableAt: data?.resendAvailableAt || "",
      }));

      setMessage(
        deliveryMode === "mock"
          ? `Письмо в этой сборке не отправляется. Новый тестовый код: ${debugCode || "смотрите окно подтверждения"}.`
          : "Код подтверждения повторно отправлен на почту."
      );
    } catch (error) {
      setMessage(error.message || "Не удалось повторно отправить код на почту.");
    } finally {
      setIsResendingEmailCode(false);
    }
  };

  const handleVerifyEmailCode = async (event) => {
    event.preventDefault();

    if (!emailVerificationModal.email || !emailVerificationModal.verificationToken) {
      setMessage("Сессия подтверждения почты не найдена. Зарегистрируйтесь снова.");
      return;
    }

    if (emailVerificationCode.trim().length !== 6) {
      setMessage("Введите шестизначный код из письма.");
      return;
    }

    setIsVerifyingEmailCode(true);
    setMessage("");

    try {
      const data = await submitAuthRequest(
        "/auth/verify-email-code",
        {
          email: emailVerificationModal.email,
          verificationToken: emailVerificationModal.verificationToken,
          code: emailVerificationCode.trim(),
        },
        "Не удалось подтвердить почту."
      );
      resetEmailVerificationModal();
      onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
    } catch (error) {
      setMessage(error.message || "Не удалось подтвердить почту.");
    } finally {
      setIsVerifyingEmailCode(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setIsSubmitting(false);
    setIsRequestingPhoneCode(false);
    setIsVerifyingPhoneCode(false);
    setIsResendingEmailCode(false);
    setIsVerifyingEmailCode(false);
    resetEmailVerificationModal();
  };

  return (
    <div className="auth-page">
      <video
        className="auth-video-bg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden="true"
      >
        <source src="/video/GoldenDustGlow2.mp4" type="video/mp4" />
      </video>

      <div className="auth-brand">
        <div className="auth-brand__badge">
          <img className="auth-brand__logo" src="/image/image.png" alt="MAX" />
        </div>
        <div className="auth-brand__copy">
          <span className="auth-brand__name">MAX</span>
          <h1 className="auth-brand__title">- имум возможностей для жизни</h1>
        </div>
      </div>

      <form
        className={`auth-card auth-card--wide ${mode === "login" ? "auth-card--login" : ""}`}
        onSubmit={mode === "login" ? handleLogin : handleRegister}
      >
        <div className="auth-card__main">
          <div className="auth-card__heading">
            <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
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
            <div className="auth-section">
              <div className="auth-section__title">Основные данные</div>
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
                placeholder="Email или телефон"
                type="text"
                value={registerForm.contact}
                onChange={handleRegisterFieldChange("contact")}
                required
              />
              {registerContactKind === "phone" ? (
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
                      {isVerifyingPhoneCode ? "Проверяем..." : phoneVerificationStatus.verified ? "Номер подтверждён" : "Подтвердить"}
                    </button>
                  </div>

                  {phoneVerificationStatus.deliveryMode === "mock" && phoneVerificationStatus.debugCode ? (
                    <div className="auth-hint">Тестовый код: {phoneVerificationStatus.debugCode}</div>
                  ) : null}
                </div>
              ) : null}

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
          )}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "login"
                ? "Входим..."
                : "Создаём аккаунт..."
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

          {message ? <p className="auth-message">{message}</p> : null}
        </div>

        <aside className="auth-card__side">
          <div className="auth-side__title">Платёжная карта</div>
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

      {emailVerificationModal.open ? (
        <div className="auth-verify-modal__backdrop">
          <form className="auth-verify-modal" onSubmit={handleVerifyEmailCode}>
            <div className="auth-verify-modal__header">
              <h3>Подтвердите почту</h3>
              <button type="button" className="auth-verify-modal__close" onClick={resetEmailVerificationModal}>
                ×
              </button>
            </div>
            <p className="auth-verify-modal__text">
              {emailVerificationModal.deliveryMode === "mock" ? (
                <>
                  Для <strong>{emailVerificationModal.email}</strong> письмо в этой сборке не отправляется. Введите тестовый код из окна ниже.
                </>
              ) : (
                <>
                  Мы отправили код на <strong>{emailVerificationModal.email}</strong>. Введите его, чтобы завершить регистрацию.
                </>
              )}
            </p>
            <input
              className="auth-input"
              placeholder="Код из письма"
              value={emailVerificationCode}
              onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
            {emailVerificationModal.debugCode ? (
              <div className="auth-hint">Тестовый код: {emailVerificationModal.debugCode}</div>
            ) : null}
            <div className="auth-verify-modal__actions">
              <button className="auth-submit auth-submit--secondary" type="button" onClick={handleResendEmailCode} disabled={isResendingEmailCode}>
                {isResendingEmailCode ? "Отправляем..." : "Отправить код снова"}
              </button>
              <button className="auth-submit" type="submit" disabled={isVerifyingEmailCode}>
                {isVerifyingEmailCode ? "Проверяем..." : "Подтвердить"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

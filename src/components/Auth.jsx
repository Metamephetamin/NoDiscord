import { useMemo, useState } from "react";
import "../css/Auth.css";
import { API_BASE_URL } from "../config/runtime";

function getAuthErrorMessage(data) {
  if (!data || typeof data !== "object") {
    return "Ошибка регистрации";
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (data.errors && typeof data.errors === "object") {
    const firstErrorGroup = Object.values(data.errors).find(
      (value) => Array.isArray(value) && value.length > 0
    );

    if (firstErrorGroup) {
      return firstErrorGroup.join(" ");
    }
  }

  if (typeof data.title === "string" && data.title.trim()) {
    return data.title;
  }

  return "Ошибка регистрации";
}

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

const initialForm = {
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

export default function Auth({ onAuthSuccess }) {
  const [form, setForm] = useState(initialForm);
  const [passportScanFile, setPassportScanFile] = useState(null);
  const [facePhotoFile, setFacePhotoFile] = useState(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  const cardHolderName = useMemo(() => {
    const composed = `${form.firstName} ${form.lastName}`.trim();
    return composed || "Ваше имя";
  }, [form.firstName, form.lastName]);

  const displayedCardNumber = useMemo(() => {
    const formatted = formatCardNumber(form.cardNumber);
    if (formatted) {
      return formatted;
    }

    return "0000 0000 0000 0000";
  }, [form.cardNumber]);

  const displayedCardExpiry = useMemo(() => {
    const formatted = formatCardExpiry(form.cardExpiry);
    return formatted || "MM/YY";
  }, [form.cardExpiry]);

  const displayedCardCvc = useMemo(() => {
    const digits = form.cardCvc.replace(/\D/g, "").slice(0, 3);
    return digits || "000";
  }, [form.cardCvc]);

  const handleFieldChange = (field) => (event) => {
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

    setForm((previous) => ({ ...previous, [field]: nextValue }));
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage("");

    const payload = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
      passport_series: form.passportSeries.trim(),
      passport_number: form.passportNumber.trim(),
      snils: form.snils.trim(),
      inn: form.inn.trim(),
      residence: form.residence.trim(),
      birth_date: form.birthDate || "",
      phone: form.phone.trim(),
      foreign_passport_series: form.foreignPassportSeries.trim(),
      foreign_passport_number: form.foreignPassportNumber.trim(),
      card_number: form.cardNumber.replace(/\s/g, ""),
      card_expiry: form.cardExpiry.trim(),
      passport_scan_name: passportScanFile?.name || "",
      face_photo_name: facePhotoFile?.name || "",
    };

    if (!payload.first_name || !payload.last_name || !payload.email) {
      setMessage("Заполни обязательные поля.");
      return;
    }

    if (payload.password.length < 6) {
      setMessage("Пароль должен быть не короче 6 символов.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let data = null;

      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = { message: rawText };
        }
      }

      if (!response.ok) {
        setMessage(getAuthErrorMessage(data));
        setIsSubmitting(false);
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1400));

      onAuthSuccess(
        {
          id: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
        },
        data.token
      );
    } catch (error) {
      setMessage(error.message || "Ошибка регистрации");
      setIsSubmitting(false);
    }
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
          <h1 className="auth-brand__title">- за нами будущее</h1>
        </div>
      </div>

      <form className="auth-card auth-card--wide" onSubmit={handleRegister}>
        <div className="auth-card__main">
          <div className="auth-card__heading">
            <h2>Регистрация</h2>
            <p className="auth-subtitle">
              Создай профиль, а дополнительные данные можно заполнить сразу или оставить на потом.
            </p>
          </div>

          <div className="auth-section">
            <div className="auth-section__title">Обязательные данные</div>
            <div className="auth-grid auth-grid--double">
              <input
                className="auth-input"
                placeholder="Имя"
                value={form.firstName}
                onChange={handleFieldChange("firstName")}
                required
              />
              <input
                className="auth-input"
                placeholder="Фамилия"
                value={form.lastName}
                onChange={handleFieldChange("lastName")}
                required
              />
            </div>
            <input
              className="auth-input"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={handleFieldChange("email")}
              required
            />
            <input
              className="auth-input"
              placeholder="Пароль"
              type="password"
              value={form.password}
              onChange={handleFieldChange("password")}
              minLength={6}
              required
            />
          </div>

          <div className="auth-section">
            <div className="auth-section__title">Дополнительные данные</div>
            <div className="auth-grid auth-grid--triple">
              <input className="auth-input" placeholder="Серия паспорта" value={form.passportSeries} onChange={handleFieldChange("passportSeries")} />
              <input className="auth-input" placeholder="Номер паспорта" value={form.passportNumber} onChange={handleFieldChange("passportNumber")} />
              <input className="auth-input" placeholder="СНИЛС" value={form.snils} onChange={handleFieldChange("snils")} />
              <input className="auth-input" placeholder="ИНН" value={form.inn} onChange={handleFieldChange("inn")} />
              <input className="auth-input" type="date" placeholder="Дата рождения" value={form.birthDate} onChange={handleFieldChange("birthDate")} />
              <input className="auth-input" placeholder="Номер телефона" value={form.phone} onChange={handleFieldChange("phone")} />
            </div>
            <input className="auth-input" placeholder="Место жительства" value={form.residence} onChange={handleFieldChange("residence")} />
            <div className="auth-grid auth-grid--double">
              <input className="auth-input" placeholder="Серия загранпаспорта (если есть)" value={form.foreignPassportSeries} onChange={handleFieldChange("foreignPassportSeries")} />
              <input className="auth-input" placeholder="Номер загранпаспорта (если есть)" value={form.foreignPassportNumber} onChange={handleFieldChange("foreignPassportNumber")} />
            </div>
            <div className="auth-grid auth-grid--double">
              <label className="auth-file">
                <span className="auth-file__label">Скан паспорта</span>
                <input type="file" accept="image/*,.pdf" onChange={(event) => setPassportScanFile(event.target.files?.[0] || null)} />
                <span className="auth-file__value">{passportScanFile?.name || "Выбрать файл"}</span>
              </label>
              <label className="auth-file">
                <span className="auth-file__label">Снимок лица</span>
                <input type="file" accept="image/*" onChange={(event) => setFacePhotoFile(event.target.files?.[0] || null)} />
                <span className="auth-file__value">{facePhotoFile?.name || "Выбрать файл"}</span>
              </label>
            </div>
          </div>

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Подготавливаем профиль..." : "Зарегистрироваться"}
          </button>

          {message && <p className="auth-message">{message}</p>}
        </div>

        <aside className="auth-card__side">
          <div className="auth-side__title">Платёжная карта</div>
          <p className="auth-side__subtitle">
            Эти поля необязательны. Карта оживает во время ввода, а при переходе к CVC переворачивается.
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
              value={form.cardNumber}
              onChange={handleFieldChange("cardNumber")}
              onFocus={() => setIsCardFlipped(false)}
            />
            <input
              className="auth-input"
              placeholder="Срок действия"
              value={form.cardExpiry}
              onChange={handleFieldChange("cardExpiry")}
              onFocus={() => setIsCardFlipped(false)}
            />
            <input
              className="auth-input auth-input--compact"
              placeholder="CVC"
              value={form.cardCvc}
              onChange={handleFieldChange("cardCvc")}
              onFocus={() => setIsCardFlipped(true)}
              onBlur={() => setIsCardFlipped(false)}
            />
          </div>
        </aside>
      </form>

      {isSubmitting && (
        <div className="auth-loading">
          <div className="auth-loading__spinner" />
          <div className="auth-loading__title">Создаём аккаунт</div>
          <div className="auth-loading__subtitle">Подожди ещё немного, мы завершаем подготовку профиля.</div>
        </div>
      )}
    </div>
  );
}

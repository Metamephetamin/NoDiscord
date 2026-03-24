import { useState } from "react";
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

export default function Auth({ onAuthSuccess }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
      };

      if (!payload.first_name || !payload.last_name || !payload.email) {
        setMessage("Заполни все поля.");
        return;
      }

      if (payload.password.length < 6) {
        setMessage("Пароль должен быть не короче 6 символов.");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text();
      let data = null;

      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = { message: rawText };
        }
      }

      if (!res.ok) {
        setMessage(getAuthErrorMessage(data));
        return;
      }

      onAuthSuccess(
        {
          id: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
        },
        data.token
      );
    } catch (err) {
      setMessage(err.message || "Ошибка регистрации");
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

      <form className="auth-card" onSubmit={handleRegister}>
        <h2>Регистрация</h2>
        <p className="auth-subtitle">
          Создай профиль и заходи в чат без лишней настройки.
        </p>

        <input
          className="auth-input"
          placeholder="Имя"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <input
          className="auth-input"
          placeholder="Фамилия"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
        <input
          className="auth-input"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="auth-input"
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        <button className="auth-submit" type="submit">
          Зарегистрироваться
        </button>

        {message && <p className="auth-message">{message}</p>}
      </form>
    </div>
  );
}

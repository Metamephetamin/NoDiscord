import { useState } from "react";
import "../css/Auth.css";
import { API_BASE_URL } from "../config/runtime";

export default function Auth({ onAuthSuccess }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || "Ошибка регистрации");
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

      <form className="auth-card" onSubmit={handleRegister}>
        <h2>Регистрация</h2>
        <p className="auth-subtitle">Создай профиль и заходи в чат без лишней настройки.</p>

        <input className="auth-input" placeholder="Имя" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <input className="auth-input" placeholder="Фамилия" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        <input className="auth-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="auth-input" placeholder="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        <button className="auth-submit" type="submit">
          Зарегистрироваться
        </button>

        {message && <p className="auth-message">{message}</p>}
      </form>
    </div>
  );
}

import { useState } from "react";
import MenuMain from "./MenuMain";

const API_URL = "https://localhost:7031/api";

export default function Auth({ onAuthSuccess }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || "Ошибка регистрации");
        return;
      }
      // После успешной регистрации вызываем callback
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

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || "Ошибка входа");
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
      setMessage(err.message || "Ошибка входа");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "0 auto" }}>
      <h2>Регистрация / Вход</h2>

      <form onSubmit={handleRegister}>
        <input placeholder="Имя" value={firstName} onChange={e => setFirstName(e.target.value)} required />
        <br />
        <input placeholder="Фамилия" value={lastName} onChange={e => setLastName(e.target.value)} required />
        <br />
        <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <br />
        <input placeholder="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <br />
        <button type="submit">Регистрация</button>
      </form>

      <br />

      <form onSubmit={handleLogin}>
        <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <br />
        <input placeholder="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <br />
        <button type="submit">Войти</button>
      </form>

      {message && <p style={{ color: "red" }}>{message}</p>}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MenuMain from "./MenuMain";

const API_URL = "https://localhost:7031/api";

export default function Auth({ onAuthSuccess }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // ----------------- Автологин -----------------
useEffect(() => {
  const token = localStorage.getItem("token");
  console.log("Токен при автологине:", token);

  if (!token) {
    setLoading(false);
    return;
  }

  const url = `${API_URL}/auth/me`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  console.log("URL запроса:", url);
  console.log("Заголовки:", headers);

  fetch(url, { method: "GET", headers })
    .then(async (res) => {
      console.log("Ответ /auth/me:", res.status);
      if (!res.ok) {
        const text = await res.text();
        console.error("Тело ошибки:", text);
        throw new Error("Unauthorized");
      }
      return res.json();
    })
    .then((data) => {
      console.log("Данные пользователя:", data);
      setUser(data);
      onAuthSuccess(data);
      navigate("/MenuMain");
    })
    .catch((err) => {
      console.error("Ошибка автологина:", err.message);
      // localStorage.removeItem("token");
    })
    .finally(() => setLoading(false));
}, [navigate, onAuthSuccess]);

  if (loading) return <div>Загрузка...</div>;
  if (user) return <MenuMain user={user} />;

  // ----------------- Регистрация -----------------
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

      localStorage.setItem("token", data.token);
      setUser({
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
      });
      onAuthSuccess(data);
      navigate("/MenuMain");
    } catch (err) {
      setMessage(err.message || "Ошибка регистрации");
    }
  };

  // ----------------- Вход -----------------
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

      localStorage.setItem("token", data.token);
      setUser({
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
      });
      onAuthSuccess(data);
      navigate("/MenuMain");
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

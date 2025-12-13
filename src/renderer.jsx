import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Auth from "./components/Auth";
import MenuMain from "./components/MenuMain";
import './index.css';

export default function Renderer() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }

    setLoading(false);
  }, []);

  const handleAuthSuccess = (u, t) => {
    setUser(u);
    setToken(t);
    localStorage.setItem("user", JSON.stringify(u));
    localStorage.setItem("token", t);
  };

  if (loading) return <div>Загрузка...</div>;

  return token && user ? (
    <MenuMain user={user} />
  ) : (
    <Auth onAuthSuccess={handleAuthSuccess} />
  );
}

// Точка входа
const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Renderer />);

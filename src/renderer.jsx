import { useEffect, useState } from "react";
import Auth from "./components/Auth";
import MenuMain from "./components/MenuMain";
import { API_BASE_URL } from "./config/runtime";
import "./index.css";
import {
  AUTH_UNAUTHORIZED_EVENT,
  buildAuthHeaders,
  clearStoredSession,
  getStoredToken,
  getStoredUser,
  parseApiResponse,
  storeSession,
} from "./utils/auth";

export default function Renderer() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    const resetSession = () => {
      clearStoredSession();

      if (!disposed) {
        setUser(null);
        setToken(null);
        setLoading(false);
      }
    };

    const restoreSession = async () => {
      const savedToken = getStoredToken();
      const savedUser = getStoredUser();

      if (!savedToken || !savedUser) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          method: "GET",
          headers: buildAuthHeaders(),
        });
        const data = await parseApiResponse(response);

        if (!response.ok || !data?.id) {
          resetSession();
          return;
        }

        const nextUser = {
          ...savedUser,
          id: data.id,
          firstName: data.first_name || savedUser.firstName || "",
          lastName: data.last_name || savedUser.lastName || "",
          email: data.email || savedUser.email || "",
        };

        if (!disposed) {
          setUser(nextUser);
          setToken(savedToken);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to restore session from localStorage", error);
        resetSession();
      }
    };

    const handleUnauthorized = () => {
      resetSession();
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    restoreSession();

    return () => {
      disposed = true;
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (token && user) {
      storeSession(user, token);
    } else {
      clearStoredSession();
    }
  }, [token, user]);

  const handleAuthSuccess = (nextUser, nextToken) => {
    setUser(nextUser);
    setToken(nextToken);
    storeSession(nextUser, nextToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    clearStoredSession();
  };

  if (loading) {
    return (
      <div className="app-loader">
        <div className="app-loader__orb" />
        <div className="app-loader__title">Загрузка</div>
        <div className="app-loader__subtitle">Поднимаем сессию и готовим интерфейс.</div>
      </div>
    );
  }

  return token && user ? (
    <MenuMain user={user} setUser={setUser} onLogout={handleLogout} />
  ) : (
    <Auth onAuthSuccess={handleAuthSuccess} />
  );
}

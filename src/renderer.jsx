import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Auth from "./components/Auth";
import MenuMain from "./components/MenuMain";
import ServerInvitePage from "./components/ServerInvitePage";
import { API_BASE_URL } from "./config/runtime";
import "./index.css";
import {
  AUTH_UNAUTHORIZED_EVENT,
  clearStoredSession,
  getStoredAccessTokenExpiresAt,
  getStoredRefreshToken,
  getStoredToken,
  hydrateStoredSession,
  authFetch,
  parseApiResponse,
  storeSession,
} from "./utils/auth";

export default function Renderer() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [pendingImportedServer, setPendingImportedServer] = useState(null);

  const isInviteRoute = /^\/invite\/[^/]+$/i.test(location.pathname);

  useEffect(() => {
    let disposed = false;

    const resetSession = () => {
      void clearStoredSession();

      if (!disposed) {
        setUser(null);
        setToken(null);
        setSessionHydrated(true);
        setLoading(false);
      }
    };

    const restoreSession = async () => {
      const savedSession = await hydrateStoredSession();
      const savedToken = savedSession.accessToken;
      const savedUser = savedSession.user;

      if (!savedToken || !savedUser) {
        if (!disposed) {
          setSessionHydrated(true);
          setLoading(false);
        }
        return;
      }

      try {
        const response = await authFetch(`${API_BASE_URL}/auth/me`, {
          method: "GET",
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
          isEmailVerified: Boolean(data.is_email_verified ?? savedUser.isEmailVerified ?? true),
          phoneNumber: data.phone_number || savedUser.phoneNumber || "",
          isPhoneVerified: Boolean(
            data.is_phone_verified ?? savedUser.isPhoneVerified ?? savedUser.phone_verified ?? false
          ),
          avatarUrl: data.avatar_url || savedUser.avatarUrl || savedUser.avatar || "",
          avatar: data.avatar_url || savedUser.avatar || savedUser.avatarUrl || "",
        };

        if (!disposed) {
          setUser(nextUser);
          setToken(getStoredToken() || savedToken);
          setSessionHydrated(true);
          setLoading(false);
        }

        await storeSession(nextUser, {
          accessToken: getStoredToken() || savedToken,
          refreshToken: getStoredRefreshToken(),
          accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
        });
      } catch (error) {
        console.error("Failed to restore secure session", error);
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
    if (!sessionHydrated) {
      return;
    }

    if (token && user) {
      void storeSession(user, {
        accessToken: token,
        refreshToken: getStoredRefreshToken(),
        accessTokenExpiresAt: getStoredAccessTokenExpiresAt(),
      });
    } else {
      void clearStoredSession();
    }
  }, [sessionHydrated, token, user]);

  useEffect(() => {
    const appLinksApi = window?.electronAppLinks;
    if (!appLinksApi?.onNavigate) {
      return undefined;
    }

    return appLinksApi.onNavigate((nextRoute) => {
      const normalizedRoute = String(nextRoute || "").trim();
      if (!normalizedRoute) {
        return;
      }

      navigate(normalizedRoute, { replace: false });
    });
  }, [navigate]);

  const handleAuthSuccess = (nextUser, nextSession) => {
    const accessToken =
      nextSession && typeof nextSession === "object" ? nextSession.accessToken || nextSession.token || "" : nextSession;

    setUser(nextUser);
    setToken(accessToken);
    setSessionHydrated(true);
    void storeSession(nextUser, nextSession);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setSessionHydrated(true);
    void clearStoredSession();
  };

  const handleInviteAccepted = (snapshot) => {
    if (!snapshot) {
      return;
    }

    setPendingImportedServer(snapshot);
    navigate("/", { replace: true });
  };

  if (loading) {
    return (
      <div className="app-loader">
        <div className="app-loader__stage" aria-hidden="true">
          <div className="app-loader__halo" />
          <div className="app-loader__ring app-loader__ring--outer" />
          <div className="app-loader__ring app-loader__ring--inner" />
          <div className="app-loader__core" />
          <span className="app-loader__spark app-loader__spark--one" />
          <span className="app-loader__spark app-loader__spark--two" />
          <span className="app-loader__spark app-loader__spark--three" />
        </div>
        <div className="app-loader__subtitle">Поднимаем сессию и готовим интерфейс.</div>
      </div>
    );
  }

  if (isInviteRoute) {
    return (
      <ServerInvitePage
        user={user}
        onAuthSuccess={handleAuthSuccess}
        onInviteAccepted={handleInviteAccepted}
      />
    );
  }

  return token && user ? (
    <MenuMain
      user={user}
      setUser={setUser}
      onLogout={handleLogout}
      pendingImportedServer={pendingImportedServer}
      onPendingImportedServerHandled={() => setPendingImportedServer(null)}
    />
  ) : (
    <Auth onAuthSuccess={handleAuthSuccess} />
  );
}

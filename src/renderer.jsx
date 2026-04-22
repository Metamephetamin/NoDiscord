import { Profiler, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Auth from "./components/Auth";
import AppUpdateBanner from "./components/AppUpdateBanner";
import { API_BASE_URL } from "./config/runtime";
import { clearPendingInviteAcceptCode, readPendingInviteAcceptCode } from "./utils/inviteFlow";
import "./index.css";
import { getDisplayCaptureSupportInfo } from "./utils/browserMediaSupport";
import { parseMediaFrame } from "./utils/mediaFrames";
import {
  finishPerfTraceOnNextFrame,
  initRendererPerfMonitoring,
  measureElectronIpcRoundTrip,
  PERF_ENABLED,
  recordReactCommit,
  startPerfTrace,
} from "./utils/perf";
import { ensureBrowserPushSubscription, unregisterBrowserPushSubscription } from "./utils/pushNotifications";
import {
  AUTH_UNAUTHORIZED_EVENT,
  clearStoredSession,
  getStoredAccessTokenExpiresAt,
  getStoredRefreshToken,
  getStoredToken,
  hydrateStoredSession,
  authFetch,
  isUnauthorizedError,
  parseApiResponse,
  storeSession,
} from "./utils/auth";

const MEDIA_PERMISSION_BOOTSTRAP_STORAGE_KEY = "nd_media_permissions_bootstrap_v2";
const rendererBootstrapTraceId = startPerfTrace("app-shell", "renderer-bootstrap");
const MenuMain = lazy(() => import("./components/MenuMain"));
const ServerInvitePage = lazy(() => import("./components/ServerInvitePage"));

function readMediaPermissionBootstrapState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage?.getItem(MEDIA_PERMISSION_BOOTSTRAP_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeMediaPermissionBootstrapState(value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage?.setItem(MEDIA_PERMISSION_BOOTSTRAP_STORAGE_KEY, JSON.stringify(value ?? {}));
  } catch {
    // ignore storage errors
  }
}

function hasSettledMediaPermissionBootstrapState(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (value.settled === true || value.completed === true) {
    return true;
  }

  const statuses = [value.microphone, value.camera, value.displayCapture]
    .map((status) => String(status || "").trim().toLowerCase())
    .filter(Boolean);

  if (!statuses.length) {
    return false;
  }

  return statuses.every((status) =>
    status === "granted"
    || status === "denied"
    || status === "not-required"
    || status === "unsupported"
  );
}

async function getBrowserPermissionState(name) {
  if (typeof window === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({ name });
    return String(status?.state || "").trim().toLowerCase() || "unknown";
  } catch {
    return "unknown";
  }
}

async function getAvailableMediaDeviceKinds() {
  if (typeof window === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { hasMicrophone: null, hasCamera: null };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!Array.isArray(devices) || devices.length === 0) {
      return { hasMicrophone: null, hasCamera: null };
    }

    const hasAudioInput = devices.some((device) => device?.kind === "audioinput");
    const hasVideoInput = devices.some((device) => device?.kind === "videoinput");
    return {
      hasMicrophone: hasAudioInput,
      hasCamera: hasVideoInput,
    };
  } catch {
    return { hasMicrophone: null, hasCamera: null };
  }
}

async function requestMediaPermissionsAtAppLevel() {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      completed: false,
      microphone: "unsupported",
      camera: "unsupported",
      displayCapture: "unsupported",
    };
  }

  const permissionApi = window.electronPermissions;
  const availableDevices = await getAvailableMediaDeviceKinds();
  const requiresMicrophone = availableDevices.hasMicrophone !== false;
  const requiresCamera = availableDevices.hasCamera !== false;

  const permissionState = {
    microphone: requiresMicrophone ? "pending" : "not-required",
    camera: requiresCamera ? "pending" : "not-required",
    displayCapture: getDisplayCaptureSupportInfo().status,
  };

  const updatePermissionStateFromStatus = (mediaType, status) => {
    const normalizedStatus = String(status || "").trim().toLowerCase();
    if (normalizedStatus === "granted") {
      permissionState[mediaType] = "granted";
      return true;
    }

    if (normalizedStatus === "denied" || normalizedStatus === "restricted") {
      permissionState[mediaType] = "denied";
      return false;
    }

    return permissionState[mediaType] === "granted";
  };

  const markGranted = (mediaType) => {
    permissionState[mediaType] = "granted";
  };

  const markDenied = (mediaType) => {
    if (permissionState[mediaType] !== "granted") {
      permissionState[mediaType] = "denied";
    }
  };

  const stopTracks = (stream) => {
    stream?.getTracks?.().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore cleanup failures
      }
    });
  };

  const syncKnownPermissionState = async () => {
    const checks = [
      {
        mediaType: "microphone",
        permissionName: "microphone",
        required: requiresMicrophone,
      },
      {
        mediaType: "camera",
        permissionName: "camera",
        required: requiresCamera,
      },
    ];

    for (const check of checks) {
      if (!check.required) {
        continue;
      }

      try {
        const nativeStatus = await permissionApi?.getMediaStatus?.(check.mediaType);
        if (updatePermissionStateFromStatus(check.mediaType, nativeStatus)) {
          continue;
        }
      } catch {
        // ignore native status lookup failures
      }

      const browserStatus = await getBrowserPermissionState(check.permissionName);
      if (browserStatus === "granted") {
        markGranted(check.mediaType);
      } else if (browserStatus === "denied") {
        markDenied(check.mediaType);
      }
    }
  };

  const requestSystemPromptIfNeeded = async (mediaType) => {
    if (!permissionApi?.requestMediaAccess) {
      return;
    }

    try {
      const status = await permissionApi.getMediaStatus?.(mediaType);
      if (updatePermissionStateFromStatus(mediaType, status)) {
        return;
      }

      const result = await permissionApi.requestMediaAccess(mediaType);
      if (result?.granted) {
        markGranted(mediaType);
        return;
      }

      updatePermissionStateFromStatus(mediaType, result?.status);
    } catch {
      // ignore and fallback to renderer prompt path
    }
  };

  await syncKnownPermissionState();
  await requestSystemPromptIfNeeded("microphone");
  await requestSystemPromptIfNeeded("camera");
  await syncKnownPermissionState();

  try {
    if (requiresMicrophone || requiresCamera) {
      const combinedStream = await navigator.mediaDevices.getUserMedia({
        audio: requiresMicrophone,
        video: requiresCamera,
      });
      stopTracks(combinedStream);

      if (requiresMicrophone) {
        markGranted("microphone");
      }
      if (requiresCamera) {
        markGranted("camera");
      }

      return {
        completed: true,
        microphone: permissionState.microphone,
        camera: permissionState.camera,
        displayCapture: permissionState.displayCapture,
      };
    }
  } catch {
    // fall back to separate permission prompts
  }

  for (const request of [
    { mediaType: "microphone", constraints: { audio: true, video: false }, required: requiresMicrophone },
    { mediaType: "camera", constraints: { audio: false, video: true }, required: requiresCamera },
  ]) {
    if (!request.required || permissionState[request.mediaType] === "granted") {
      continue;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(request.constraints);
      stopTracks(stream);
      markGranted(request.mediaType);
    } catch (error) {
      const errorName = String(error?.name || "").trim();
      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        markDenied(request.mediaType);
      } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        permissionState[request.mediaType] = "not-required";
      }
    }
  }

  await syncKnownPermissionState();

  const completed = [permissionState.microphone, permissionState.camera].every((status) =>
    status === "granted" || status === "not-required"
  );
  const settled = [permissionState.microphone, permissionState.camera, permissionState.displayCapture].every((status) =>
    status === "granted"
    || status === "denied"
    || status === "not-required"
    || status === "unsupported"
  );

  return {
    completed,
    settled,
    microphone: permissionState.microphone,
    camera: permissionState.camera,
    displayCapture: permissionState.displayCapture,
  };
}

export default function Renderer() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [pendingImportedServer, setPendingImportedServer] = useState(null);
  const [appUpdateState, setAppUpdateState] = useState(null);
  const mediaPermissionBootstrapStartedRef = useRef(false);
  const rendererBootstrapFinishedRef = useRef(false);

  const isInviteRoute = /^\/invite\/[^/]+$/i.test(location.pathname);
  const handleRootProfilerRender = useCallback((id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    recordReactCommit("app-shell", id, phase, actualDuration, baseDuration, startTime, commitTime, {
      path: location.pathname,
      isInviteRoute,
      loading,
    });
  }, [isInviteRoute, loading, location.pathname]);

  useEffect(() => {
    initRendererPerfMonitoring();
    void measureElectronIpcRoundTrip("startup-ipc-roundtrip", {
      phase: "renderer-mount",
    });
  }, []);

  useEffect(() => {
    const traceId = startPerfTrace("app-shell", "route-hydration", {
      path: location.pathname,
      search: location.search,
    });
    finishPerfTraceOnNextFrame(traceId, {
      path: location.pathname,
      inviteRoute: isInviteRoute,
    });
  }, [isInviteRoute, location.pathname, location.search]);

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

      const restoreCachedSession = () => {
        if (!disposed) {
          setUser(savedUser);
          setToken(getStoredToken() || savedToken);
          setSessionHydrated(true);
          setLoading(false);
        }
      };

      restoreCachedSession();

      try {
        const response = await authFetch(`${API_BASE_URL}/auth/me`, {
          method: "GET",
        });
        const data = await parseApiResponse(response);

        if (response.status === 401) {
          resetSession();
          return;
        }

        if (!response.ok || !data?.id) {
          console.warn("Failed to refresh session snapshot, keeping cached credentials.", {
            status: response.status,
          });
          return;
        }

        const nextUser = {
          ...savedUser,
          id: data.id,
          firstName: data.first_name || savedUser.firstName || "",
          lastName: data.last_name || savedUser.lastName || "",
          nickname: data.nickname || savedUser.nickname || "",
          email: data.email || savedUser.email || "",
          isEmailVerified: Boolean(data.is_email_verified ?? savedUser.isEmailVerified ?? true),
          phoneNumber: data.phone_number || savedUser.phoneNumber || "",
          isPhoneVerified: Boolean(
            data.is_phone_verified ?? savedUser.isPhoneVerified ?? savedUser.phone_verified ?? false
          ),
          avatarUrl: data.avatar_url || savedUser.avatarUrl || savedUser.avatar || "",
          avatar: data.avatar_url || savedUser.avatar || savedUser.avatarUrl || "",
          avatarFrame: parseMediaFrame(data.avatar_frame, data.avatarFrame, savedUser.avatarFrame, savedUser.avatar_frame),
          avatar_frame: parseMediaFrame(data.avatar_frame, data.avatarFrame, savedUser.avatarFrame, savedUser.avatar_frame),
          profileBackgroundUrl:
            data.profile_background_url
            || savedUser.profileBackgroundUrl
            || savedUser.profile_background_url
            || savedUser.profileBackground
            || "",
          profileBackground:
            data.profile_background_url
            || savedUser.profileBackground
            || savedUser.profileBackgroundUrl
            || savedUser.profile_background_url
            || "",
          profileBackgroundFrame: parseMediaFrame(
            data.profile_background_frame,
            data.profileBackgroundFrame,
            savedUser.profileBackgroundFrame,
            savedUser.profile_background_frame
          ),
          profile_background_frame: parseMediaFrame(
            data.profile_background_frame,
            data.profileBackgroundFrame,
            savedUser.profileBackgroundFrame,
            savedUser.profile_background_frame
          ),
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
        if (isUnauthorizedError(error)) {
          resetSession();
          return;
        }

        console.error("Failed to restore secure session", error);
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
    if (!sessionHydrated || !token || !user) {
      mediaPermissionBootstrapStartedRef.current = false;
      return;
    }

    if (mediaPermissionBootstrapStartedRef.current) {
      return;
    }

    const storedBootstrapState = readMediaPermissionBootstrapState();
    if (hasSettledMediaPermissionBootstrapState(storedBootstrapState)) {
      mediaPermissionBootstrapStartedRef.current = true;
      return;
    }

    mediaPermissionBootstrapStartedRef.current = true;
    let disposed = false;

    void requestMediaPermissionsAtAppLevel()
      .then((result) => {
        if (disposed || !result?.settled) {
          return;
        }

        writeMediaPermissionBootstrapState({
          settled: true,
          completed: Boolean(result.completed),
          completedAt: new Date().toISOString(),
          microphone: result.microphone || "",
          camera: result.camera || "",
        });
      })
      .catch(() => {
        mediaPermissionBootstrapStartedRef.current = false;
      });

    return () => {
      disposed = true;
    };
  }, [sessionHydrated, token, user]);

  useEffect(() => {
    if (!sessionHydrated) {
      return undefined;
    }

    let disposed = false;

    if (token && user) {
      ensureBrowserPushSubscription().catch((error) => {
        if (!disposed) {
          console.warn("Browser push registration failed", error);
        }
      });
    } else {
      unregisterBrowserPushSubscription().catch(() => {});
    }

    return () => {
      disposed = true;
    };
  }, [sessionHydrated, token, user]);

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

  useEffect(() => {
    if (loading || rendererBootstrapFinishedRef.current || !rendererBootstrapTraceId) {
      return;
    }

    rendererBootstrapFinishedRef.current = true;
    finishPerfTraceOnNextFrame(rendererBootstrapTraceId, {
      sessionHydrated,
      authenticated: Boolean(token && user),
      inviteRoute: isInviteRoute,
    }, 2);
  }, [isInviteRoute, loading, sessionHydrated, token, user]);

  useEffect(() => {
    const updaterApi = window?.electronAppUpdate;
    if (!updaterApi?.getState) {
      return undefined;
    }

    let disposed = false;

    updaterApi.getState()
      .then((nextState) => {
        if (!disposed) {
          setAppUpdateState(nextState);
        }
      })
      .catch(() => {});

    const unsubscribe = updaterApi.onStateChange?.((nextState) => {
      if (!disposed) {
        setAppUpdateState(nextState);
      }
    });

    return () => {
      disposed = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const handleInstallDownloadedUpdate = () => {
    void window?.electronAppUpdate?.install?.();
  };

  const handleRetryAppUpdateCheck = () => {
    void window?.electronAppUpdate?.check?.();
  };

  const handleAuthSuccess = (nextUser, nextSession) => {
    const accessToken =
      nextSession && typeof nextSession === "object" ? nextSession.accessToken || nextSession.token || "" : nextSession;

    setUser(nextUser);
    setToken(accessToken);
    setSessionHydrated(true);
    void storeSession(nextUser, nextSession);

    const pendingInviteCode = readPendingInviteAcceptCode();
    if (pendingInviteCode) {
      navigate(`/invite/${encodeURIComponent(pendingInviteCode)}`, { replace: true });
      return;
    }
  };

  const handleLogout = () => {
    clearPendingInviteAcceptCode();
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

  const shellFallback = (
    <div className="app-loader">
      <div className="app-loader__content">
        <div className="app-loader__stage" aria-hidden="true">
          <div className="app-loader__halo" />
          <div className="app-loader__ring app-loader__ring--track" />
          <div className="app-loader__ring app-loader__ring--orbit" />
          <div className="app-loader__core" />
        </div>
        <div className="app-loader__subtitle">Поднимаем сессию и готовим интерфейс.</div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="app-loader">
        <div className="app-loader__content">
          <div className="app-loader__stage" aria-hidden="true">
            <div className="app-loader__halo" />
            <div className="app-loader__ring app-loader__ring--track" />
            <div className="app-loader__ring app-loader__ring--orbit" />
            <div className="app-loader__core" />
          </div>
          <div className="app-loader__subtitle">Поднимаем сессию и готовим интерфейс.</div>
        </div>
      </div>
    );
  }

  if (isInviteRoute) {
    return (
      <>
        <AppUpdateBanner
          state={appUpdateState}
          onInstall={handleInstallDownloadedUpdate}
          onRetry={handleRetryAppUpdateCheck}
        />
        <Suspense fallback={shellFallback}>
          {PERF_ENABLED ? (
            <Profiler id="ServerInvitePage" onRender={handleRootProfilerRender}>
              <ServerInvitePage
                user={user}
                inviteCode={location.pathname.replace(/^\/invite\//i, "")}
                onInviteAccepted={handleInviteAccepted}
              />
            </Profiler>
          ) : (
            <ServerInvitePage
              user={user}
              inviteCode={location.pathname.replace(/^\/invite\//i, "")}
              onInviteAccepted={handleInviteAccepted}
            />
          )}
        </Suspense>
      </>
    );
  }

  return (
    <>
      <AppUpdateBanner
        state={appUpdateState}
        onInstall={handleInstallDownloadedUpdate}
        onRetry={handleRetryAppUpdateCheck}
      />
      {token && user ? (
        <Suspense fallback={shellFallback}>
          {PERF_ENABLED ? (
            <Profiler id="MenuMain" onRender={handleRootProfilerRender}>
              <MenuMain
                user={user}
                setUser={setUser}
                onLogout={handleLogout}
                pendingImportedServer={pendingImportedServer}
                onPendingImportedServerHandled={() => setPendingImportedServer(null)}
              />
            </Profiler>
          ) : (
            <MenuMain
              user={user}
              setUser={setUser}
              onLogout={handleLogout}
              pendingImportedServer={pendingImportedServer}
              onPendingImportedServerHandled={() => setPendingImportedServer(null)}
            />
          )}
        </Suspense>
      ) : (
        PERF_ENABLED ? (
          <Profiler id="Auth" onRender={handleRootProfilerRender}>
            <Auth onAuthSuccess={handleAuthSuccess} />
          </Profiler>
        ) : (
          <Auth onAuthSuccess={handleAuthSuccess} />
        )
      )}
    </>
  );
}

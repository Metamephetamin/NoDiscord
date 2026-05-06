import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import "../css/Auth.css";
import { API_BASE_URL, API_URL } from "../config/runtime";
import { getApiErrorMessage, getNetworkErrorMessage, parseApiResponse } from "../utils/auth";
import { resolveStaticAssetUrl } from "../utils/media";
import { APP_LOGO_CHANGE_EVENT, getCurrentAppLogoOption } from "../utils/appLogo";
import { parseMediaFrame } from "../utils/mediaFrames";
import { parseQrLoginPayload } from "../features/menu-main/menuMainControllerUtils";
import {
  areNamesUsingSameScript,
  detectNameScript,
  isNicknameUsingSingleScript,
  normalizeScriptAwareNicknameInput,
  normalizeSingleWordNameInput,
} from "../utils/nameScripts";

const SUPPORTED_EMAIL_DOMAINS = ["gmail.com", "yandex.ru", "list.ru", "mail.ru"];
const EMAIL_RESEND_COOLDOWN_SECONDS = 60;
const QR_LOGIN_POLL_INTERVAL_MS = 1800;
const MAX_AUTH_NAME_LENGTH = 32;
const MAX_AUTH_NICKNAME_LENGTH = 50;
const MAX_AUTH_IDENTIFIER_LENGTH = 50;
const MAX_AUTH_PASSWORD_LENGTH = 128;
const AUTH_BACKGROUND_VIDEO_URL = resolveStaticAssetUrl("/video/GoldenDustGlow2.mp4");
const SLOW_CONNECTION_TYPES = new Set(["slow-2g", "2g", "3g"]);
const MOBILE_AUTH_VISUAL_MODE_QUERY = "(max-width: 640px), (pointer: coarse)";
const initialRegisterForm = {
  firstName: "",
  lastName: "",
  nickname: "",
  contact: "",
  password: "",
};

const initialLoginForm = {
  identifier: "",
  password: "",
  totpCode: "",
};

const initialLoginErrors = {
  identifier: "",
  password: "",
  totpCode: "",
};

const initialEmailVerificationModal = {
  open: false,
  purpose: "registration",
  email: "",
  verificationToken: "",
  deliveryMode: "",
  debugCode: "",
  resendAvailableAt: "",
};

const initialPasswordResetState = {
  open: false,
  step: "email",
  email: "",
  verificationToken: "",
  deliveryMode: "",
  debugCode: "",
  resendAvailableAt: "",
};

const AUTH_BRAND_NAME = "Lanaya";
const sloganWords = ["общения", "голоса", "своих", "роста"];
const SLOGAN_SPECIAL_PAUSE_WORD = "своих";
const SLOGAN_SPECIAL_PAUSE_LENGTH = 3;
const SLOGAN_SPECIAL_PAUSE_MS = 2400;

const TYPING_FORWARD_DELAY_MS = 280;
const TYPING_BACKWARD_DELAY_MS = 180;
const TYPING_HOLD_FULL_MS = 1100;
const TYPING_HOLD_EMPTY_MS = 360;

function getRemainingSeconds(availableAt) {
  if (!availableAt) {
    return 0;
  }

  const targetTime = new Date(availableAt).getTime();
  if (!Number.isFinite(targetTime)) {
    return 0;
  }

  return Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
}

function formatCooldown(seconds) {
  if (seconds <= 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function getAuthMessageTone(value) {
  const normalizedValue = String(value || "").toLowerCase();
  if (!normalizedValue) {
    return "info";
  }

  if (
    normalizedValue.includes("отправлен")
    || normalizedValue.includes("отправили")
    || normalizedValue.includes("создан")
    || normalizedValue.includes("тестовый")
  ) {
    return "success";
  }

  if (normalizedValue.includes("через")) {
    return "info";
  }

  return "error";
}

function shouldExposeAuthDebugCode(deliveryMode, debugCode) {
  return import.meta.env.DEV
    && String(deliveryMode || "").toLowerCase() === "mock"
    && Boolean(debugCode);
}

function resolveResendAvailableAt(attemptNumber, serverAvailableAt = "") {
  const localCooldownMs = Date.now() + Math.max(1, Math.round(Number(attemptNumber) || 1)) * EMAIL_RESEND_COOLDOWN_SECONDS * 1000;
  const serverCooldownMs = new Date(serverAvailableAt || "").getTime();
  const nextAvailableAt = Math.max(localCooldownMs, Number.isFinite(serverCooldownMs) ? serverCooldownMs : 0);
  return new Date(nextAvailableAt).toISOString();
}

function normalizeIdentifierInput(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .slice(0, MAX_AUTH_IDENTIFIER_LENGTH);
}

function isSupportedEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const separatorIndex = normalized.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return false;
  }

  return SUPPORTED_EMAIL_DOMAINS.includes(normalized.slice(separatorIndex + 1));
}

function shouldUseLiteAuthVisualMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const isMobileAuthVisualMode = window.matchMedia(MOBILE_AUTH_VISUAL_MODE_QUERY).matches;
  if (!isMobileAuthVisualMode) {
    return false;
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(connection?.saveData);
  const slowConnection = SLOW_CONNECTION_TYPES.has(connection?.effectiveType || "");
  return prefersReducedMotion || saveData || slowConnection;
}

function shouldPreferQrCameraLogin() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(MOBILE_AUTH_VISUAL_MODE_QUERY).matches;
}

function mapAuthUser(data) {
  return {
    id: data?.id,
    firstName: data?.first_name || "",
    lastName: data?.last_name || "",
    nickname: data?.nickname || "",
    email: data?.email || "",
    isEmailVerified: Boolean(data?.is_email_verified),
    phoneNumber: data?.phone_number || "",
    isPhoneVerified: Boolean(data?.is_phone_verified),
    isTotpEnabled: Boolean(data?.is_totp_enabled),
    avatarUrl: data?.avatar_url || data?.avatarUrl || "",
    avatar: data?.avatar_url || data?.avatarUrl || "",
    avatarFrame: parseMediaFrame(data?.avatar_frame, data?.avatarFrame),
    avatar_frame: parseMediaFrame(data?.avatar_frame, data?.avatarFrame),
    profileBackgroundUrl: data?.profile_background_url || data?.profileBackgroundUrl || "",
    profileBackground: data?.profile_background_url || data?.profileBackgroundUrl || "",
    profileBackgroundFrame: parseMediaFrame(data?.profile_background_frame, data?.profileBackgroundFrame),
    profile_background_frame: parseMediaFrame(data?.profile_background_frame, data?.profileBackgroundFrame),
    profileCustomization: data?.profile_customization || data?.profileCustomization || null,
    profile_customization: data?.profile_customization || data?.profileCustomization || null,
  };
}

function normalizeNicknameInput(value) {
  return normalizeScriptAwareNicknameInput(value, MAX_AUTH_NICKNAME_LENGTH);
}

function mapAuthSession(data) {
  return {
    accessToken: data?.token || "",
    refreshToken: data?.refreshToken || "",
    accessTokenExpiresAt: data?.accessTokenExpiresAt || "",
  };
}

function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isLocalhostUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function buildQrLoginLink(session) {
  const runtime = typeof window !== "undefined" && window.electronRuntime && typeof window.electronRuntime === "object"
    ? window.electronRuntime
    : {};
  const configuredPublicAppUrl = stripTrailingSlash(runtime.publicAppUrl || import.meta.env.VITE_PUBLIC_APP_URL);
  const browserOrigin =
    typeof window !== "undefined" && /^https?:$/i.test(String(window.location?.protocol || ""))
      ? stripTrailingSlash(window.location.origin)
      : "";
  const apiUrl = stripTrailingSlash(API_URL);
  const baseUrl = configuredPublicAppUrl || (!isLocalhostUrl(browserOrigin) ? browserOrigin : "") || apiUrl;
  const qrUrl = new URL("/qr-login", `${baseUrl}/`);
  qrUrl.searchParams.set("sid", session.sessionId);
  qrUrl.searchParams.set("token", session.scannerToken);
  return qrUrl.toString();
}

async function submitAuthRequest(endpoint, payload, fallbackMessage) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const wrappedError = new Error(getNetworkErrorMessage(error, fallbackMessage));
    wrappedError.cause = error;
    throw wrappedError;
  }

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const error = new Error(getApiErrorMessage(response, data, fallbackMessage));
    error.response = response;
    error.data = data;
    throw error;
  }

  return data;
}

export default function Auth({ onAuthSuccess }) {
  const [mode, setMode] = useState("login");
  const [loginMethod, setLoginMethod] = useState("code");
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [loginErrors, setLoginErrors] = useState(initialLoginErrors);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerificationTotpCode, setEmailVerificationTotpCode] = useState("");
  const [emailVerificationModal, setEmailVerificationModal] = useState(initialEmailVerificationModal);
  const [emailResendSecondsLeft, setEmailResendSecondsLeft] = useState(0);
  const [emailResendAttemptCount, setEmailResendAttemptCount] = useState(0);
  const [isRequestingLoginCode, setIsRequestingLoginCode] = useState(false);
  const [isResendingEmailCode, setIsResendingEmailCode] = useState(false);
  const [isVerifyingEmailCode, setIsVerifyingEmailCode] = useState(false);
  const [passwordResetState, setPasswordResetState] = useState(initialPasswordResetState);
  const [passwordResetCode, setPasswordResetCode] = useState("");
  const [passwordResetPassword, setPasswordResetPassword] = useState("");
  const [passwordResetPasswordConfirm, setPasswordResetPasswordConfirm] = useState("");
  const [passwordResetSecondsLeft, setPasswordResetSecondsLeft] = useState(0);
  const [passwordResetAttemptCount, setPasswordResetAttemptCount] = useState(0);
  const [isRequestingPasswordResetCode, setIsRequestingPasswordResetCode] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [qrLoginSession, setQrLoginSession] = useState(null);
  const [qrLoginSvg, setQrLoginSvg] = useState("");
  const [qrLoginStatus, setQrLoginStatus] = useState("loading");
  const [qrLoginError, setQrLoginError] = useState("");
  const [qrLoginRefreshIndex, setQrLoginRefreshIndex] = useState(0);
  const [isQrLoginOpen, setIsQrLoginOpen] = useState(false);
  const [isQrCameraPreferred, setIsQrCameraPreferred] = useState(() => shouldPreferQrCameraLogin());
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [qrScannerStatus, setQrScannerStatus] = useState("");
  const [qrScannerError, setQrScannerError] = useState("");
  const [activeSloganWordIndex, setActiveSloganWordIndex] = useState(0);
  const [typedSloganLength, setTypedSloganLength] = useState(0);
  const [isDeletingSlogan, setIsDeletingSlogan] = useState(false);
  const [isLiteVisualMode, setIsLiteVisualMode] = useState(() => shouldUseLiteAuthVisualMode());
  const [brandLogoSrc, setBrandLogoSrc] = useState(() => getCurrentAppLogoOption().src);
  const authVideoRef = useRef(null);
  const qrScannerVideoRef = useRef(null);
  const qrScannerStreamRef = useRef(null);
  const qrScannerFrameRef = useRef(0);
  const qrScannerBusyRef = useRef(false);
  const emailAutoSubmitKeyRef = useRef("");
  const loginErrorMessage = loginErrors.password || loginErrors.identifier || "";
  const authMessageTone = useMemo(() => getAuthMessageTone(message), [message]);

  const normalizedRegisterEmail = useMemo(
    () => registerForm.contact.trim().toLowerCase(),
    [registerForm.contact]
  );

  const canResendEmailCode =
    Boolean(emailVerificationModal.email) &&
    emailResendSecondsLeft === 0 &&
    !isRequestingLoginCode &&
    !isResendingEmailCode;
  const registerNameScript = useMemo(
    () => detectNameScript(registerForm.firstName) || detectNameScript(registerForm.lastName),
    [registerForm.firstName, registerForm.lastName]
  );
  const activeSloganWord = useMemo(
    () => sloganWords[activeSloganWordIndex % sloganWords.length] || "",
    [activeSloganWordIndex]
  );
  const isLoginEmailVerification = emailVerificationModal.purpose === "login";
  const isRegistrationEmailVerification = emailVerificationModal.purpose === "registration";
  const shouldShowRegistrationCodeStep = mode === "register" && isRegistrationEmailVerification && emailVerificationModal.open;
  const shouldShowPasswordResetStep = mode === "login" && loginMethod === "password" && passwordResetState.open;
  const canResendPasswordResetCode =
    Boolean(passwordResetState.email) &&
    passwordResetState.step !== "email" &&
    passwordResetSecondsLeft === 0 &&
    !isRequestingPasswordResetCode &&
    !isResettingPassword;

  const resetEmailVerificationModal = () => {
    setEmailVerificationCode("");
    setEmailVerificationTotpCode("");
    setEmailResendSecondsLeft(0);
    setEmailResendAttemptCount(0);
    setEmailVerificationModal(initialEmailVerificationModal);
  };

  const returnToRegistrationForm = () => {
    resetEmailVerificationModal();
    setMessage("");
    setIsVerifyingEmailCode(false);
    setIsResendingEmailCode(false);
  };

  const resetPasswordResetFlow = () => {
    setPasswordResetState(initialPasswordResetState);
    setPasswordResetCode("");
    setPasswordResetPassword("");
    setPasswordResetPasswordConfirm("");
    setPasswordResetSecondsLeft(0);
    setPasswordResetAttemptCount(0);
    setIsRequestingPasswordResetCode(false);
    setIsResettingPassword(false);
  };

  useEffect(() => {
    const currentWordLength = activeSloganWord.length;
    let timeoutMs = isDeletingSlogan ? TYPING_BACKWARD_DELAY_MS : TYPING_FORWARD_DELAY_MS;
    const shouldUseSpecialPause =
      !isDeletingSlogan
      && activeSloganWord === SLOGAN_SPECIAL_PAUSE_WORD
      && typedSloganLength === SLOGAN_SPECIAL_PAUSE_LENGTH;

    if (shouldUseSpecialPause) {
      timeoutMs = SLOGAN_SPECIAL_PAUSE_MS;
    } else if (!isDeletingSlogan && typedSloganLength >= currentWordLength) {
      timeoutMs = TYPING_HOLD_FULL_MS;
    } else if (isDeletingSlogan && typedSloganLength <= 0) {
      timeoutMs = TYPING_HOLD_EMPTY_MS;
    }

    const timeoutId = window.setTimeout(() => {
      if (!isDeletingSlogan && typedSloganLength < currentWordLength) {
        setTypedSloganLength((previous) => Math.min(previous + 1, currentWordLength));
        return;
      }

      if (!isDeletingSlogan && typedSloganLength >= currentWordLength) {
        setIsDeletingSlogan(true);
        return;
      }

      if (isDeletingSlogan && typedSloganLength > 0) {
        setTypedSloganLength((previous) => Math.max(previous - 1, 0));
        return;
      }

      setIsDeletingSlogan(false);
      setActiveSloganWordIndex((previous) => (previous + 1) % sloganWords.length);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [activeSloganWord, isDeletingSlogan, typedSloganLength]);

  useEffect(() => {
    const updateVisualMode = () => {
      setIsLiteVisualMode(shouldUseLiteAuthVisualMode());
    };

    const mediaQueries = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia(MOBILE_AUTH_VISUAL_MODE_QUERY),
    ];
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const addMediaListener = (mediaQuery) => {
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", updateVisualMode);
        return () => mediaQuery.removeEventListener("change", updateVisualMode);
      }

      mediaQuery.addListener(updateVisualMode);
      return () => mediaQuery.removeListener(updateVisualMode);
    };

    updateVisualMode();
    const removeMediaListeners = mediaQueries.map(addMediaListener);
    window.addEventListener("resize", updateVisualMode, { passive: true });
    connection?.addEventListener?.("change", updateVisualMode);

    return () => {
      removeMediaListeners.forEach((removeListener) => removeListener());
      window.removeEventListener("resize", updateVisualMode);
      connection?.removeEventListener?.("change", updateVisualMode);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_AUTH_VISUAL_MODE_QUERY);
    const updateQrMode = () => setIsQrCameraPreferred(shouldPreferQrCameraLogin());

    updateQrMode();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateQrMode);
      return () => mediaQuery.removeEventListener("change", updateQrMode);
    }

    mediaQuery.addListener(updateQrMode);
    return () => mediaQuery.removeListener(updateQrMode);
  }, []);

  useEffect(() => {
    const handleLogoChange = (event) => {
      setBrandLogoSrc(event?.detail?.src || getCurrentAppLogoOption().src);
    };

    window.addEventListener(APP_LOGO_CHANGE_EVENT, handleLogoChange);
    return () => {
      window.removeEventListener(APP_LOGO_CHANGE_EVENT, handleLogoChange);
    };
  }, []);

  useEffect(() => {
    const videoNode = authVideoRef.current;
    if (!videoNode) {
      return undefined;
    }

    let reloadTimeoutId = 0;

    const playVideo = () => {
      videoNode.muted = true;
      videoNode.loop = true;
      videoNode.playsInline = true;

      const playPromise = videoNode.play();
      if (typeof playPromise?.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    const syncVideoPlayback = () => {
      if (document.hidden) {
        videoNode.pause();
        return;
      }

      if (videoNode.readyState === 0 || videoNode.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
        videoNode.load();
      }

      playVideo();
    };

    const reloadVideo = () => {
      if (document.hidden) {
        return;
      }

      window.clearTimeout(reloadTimeoutId);
      reloadTimeoutId = window.setTimeout(() => {
        videoNode.load();
        playVideo();
      }, 120);
    };

    syncVideoPlayback();
    document.addEventListener("visibilitychange", syncVideoPlayback);
    window.addEventListener("pageshow", syncVideoPlayback);
    videoNode.addEventListener("loadeddata", playVideo);
    videoNode.addEventListener("canplay", playVideo);
    videoNode.addEventListener("stalled", reloadVideo);
    videoNode.addEventListener("emptied", reloadVideo);
    videoNode.addEventListener("error", reloadVideo);

    return () => {
      window.clearTimeout(reloadTimeoutId);
      document.removeEventListener("visibilitychange", syncVideoPlayback);
      window.removeEventListener("pageshow", syncVideoPlayback);
      videoNode.removeEventListener("loadeddata", playVideo);
      videoNode.removeEventListener("canplay", playVideo);
      videoNode.removeEventListener("stalled", reloadVideo);
      videoNode.removeEventListener("emptied", reloadVideo);
      videoNode.removeEventListener("error", reloadVideo);
    };
  }, []);

  useEffect(() => {
    if (!emailVerificationModal.open) {
      setEmailResendSecondsLeft(0);
      return undefined;
    }

    const updateCountdown = () => {
      setEmailResendSecondsLeft(getRemainingSeconds(emailVerificationModal.resendAvailableAt));
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [emailVerificationModal.open, emailVerificationModal.resendAvailableAt]);

  useEffect(() => {
    if (!passwordResetState.open || passwordResetState.step === "email") {
      setPasswordResetSecondsLeft(0);
      return undefined;
    }

    const updateCountdown = () => {
      setPasswordResetSecondsLeft(getRemainingSeconds(passwordResetState.resendAvailableAt));
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [passwordResetState.open, passwordResetState.resendAvailableAt, passwordResetState.step]);

  useEffect(() => {
    if (mode !== "login" || isQrCameraPreferred) {
      setQrLoginSession(null);
      setQrLoginSvg("");
      setQrLoginStatus("idle");
      setQrLoginError("");
      return undefined;
    }

    let disposed = false;

    const createQrLoginSession = async () => {
      setQrLoginStatus("loading");
      setQrLoginError("");

      try {
        const session = await submitAuthRequest("/auth/qr-login/session", {}, "Не удалось создать QR-код.");
        if (disposed) {
          return;
        }

        const qrPayload = buildQrLoginLink(session);
        const svg = await QRCode.toString(qrPayload, {
          type: "svg",
          width: 188,
          margin: 1,
          color: {
            dark: "#121826",
            light: "#ffffff",
          },
        });

        if (disposed) {
          return;
        }

        setQrLoginSession(session);
        setQrLoginSvg(svg);
        setQrLoginStatus("pending");
      } catch (error) {
        if (!disposed) {
          setQrLoginSession(null);
          setQrLoginSvg("");
          setQrLoginStatus("error");
          setQrLoginError(error.message || "Не удалось создать QR-код.");
        }
      }
    };

    createQrLoginSession();

    return () => {
      disposed = true;
    };
  }, [isQrCameraPreferred, mode, qrLoginRefreshIndex]);

  useEffect(() => {
    if (mode !== "login" || !qrLoginSession?.sessionId || !qrLoginSession?.browserToken || qrLoginStatus !== "pending") {
      return undefined;
    }

    let disposed = false;
    let isPolling = false;

    const pollQrLoginSession = async () => {
      if (isPolling) {
        return;
      }

      isPolling = true;
      try {
        const params = new URLSearchParams({ browserToken: qrLoginSession.browserToken });
        const response = await fetch(`${API_BASE_URL}/auth/qr-login/session/${encodeURIComponent(qrLoginSession.sessionId)}?${params}`);
        const data = await parseApiResponse(response);

        if (disposed) {
          return;
        }

        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, data, "Не удалось проверить QR-вход."));
        }

        const status = String(data?.status || "").trim().toLowerCase();
        if (status === "approved" && data?.token) {
          setQrLoginStatus("approved");
          onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
          return;
        }

        if (status === "expired") {
          setQrLoginStatus("loading");
          refreshQrLoginSession();
          return;
        }

        if (status === "consumed" || status === "canceled") {
          setQrLoginStatus(status);
        }
      } catch (error) {
        if (!disposed) {
          setQrLoginStatus("error");
          setQrLoginError(error.message || "Не удалось проверить QR-вход.");
        }
      } finally {
        isPolling = false;
      }
    };

    pollQrLoginSession();
    const intervalId = window.setInterval(pollQrLoginSession, QR_LOGIN_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [mode, onAuthSuccess, qrLoginSession, qrLoginStatus]);

  useEffect(() => () => {
    stopQrScanner();
  }, []);

  const handleRegisterFieldChange = (field) => (event) => {
    let nextValue = event.target.value;

    if (field === "firstName" || field === "lastName") {
      const otherField = field === "firstName" ? "lastName" : "firstName";

      setRegisterForm((previous) => {
        const lockedScript =
          detectNameScript(previous[otherField]) ||
          detectNameScript(previous[field]) ||
          detectNameScript(nextValue);

        return {
          ...previous,
          [field]: normalizeSingleWordNameInput(nextValue, MAX_AUTH_NAME_LENGTH, lockedScript),
        };
      });

      setMessage("");
      return;
    } else if (field === "contact") {
      nextValue = normalizeIdentifierInput(nextValue);
    } else if (field === "nickname") {
      nextValue = normalizeNicknameInput(nextValue);
    } else if (field === "password") {
      nextValue = nextValue.slice(0, MAX_AUTH_PASSWORD_LENGTH);
    }

    setRegisterForm((previous) => ({ ...previous, [field]: nextValue }));

  };

  const handleLoginFieldChange = (field) => (event) => {
    const nextValue =
      field === "identifier"
        ? normalizeIdentifierInput(event.target.value)
        : field === "password"
          ? event.target.value.slice(0, MAX_AUTH_PASSWORD_LENGTH)
          : field === "totpCode"
            ? event.target.value.replace(/\D/g, "").slice(0, 6)
          : event.target.value;

    setLoginForm((previous) => ({ ...previous, [field]: nextValue }));
    if (field === "identifier" && passwordResetState.open && passwordResetState.step === "email") {
      setPasswordResetState((previous) => ({ ...previous, email: nextValue.trim().toLowerCase() }));
    }
    setLoginErrors((previous) => ({ ...previous, [field]: "" }));
    if (field === "identifier" && emailVerificationModal.purpose === "login") {
      resetEmailVerificationModal();
    }
    setMessage("");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoginErrors(initialLoginErrors);

    const payload = {
      identifier: loginForm.identifier.trim(),
      password: loginForm.password,
      totpCode: loginForm.totpCode.trim(),
    };

    if (!payload.identifier || !payload.password) {
      setLoginErrors({
        identifier: payload.identifier ? "" : "Введите email.",
        password: payload.password ? "" : "Введите пароль.",
      });
      return;
    }

    if (!isSupportedEmail(payload.identifier)) {
      setLoginErrors({
        identifier: "Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.",
        password: "",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await submitAuthRequest("/auth/login", payload, "Не удалось войти в аккаунт.");
      onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
    } catch (error) {
      const pendingEmailVerification = error?.data?.pendingEmailVerification === true;
      const verification = error?.data?.verification && typeof error.data.verification === "object"
        ? error.data.verification
        : null;

      if (pendingEmailVerification && verification) {
        const canExposeDebugCode = shouldExposeAuthDebugCode(verification.deliveryMode, verification.debugCode);
        setEmailVerificationCode("");
        setEmailVerificationTotpCode("");
        setEmailResendAttemptCount(1);
        setEmailVerificationModal({
          open: true,
          purpose: "login",
          email: verification.email || payload.identifier,
          verificationToken: verification.verificationToken || "",
          deliveryMode: verification.deliveryMode || "",
          debugCode: canExposeDebugCode ? verification.debugCode || "" : "",
          resendAvailableAt: resolveResendAvailableAt(1, verification.resendAvailableAt),
          requiresTotp: false,
        });
        setMessage(
          canExposeDebugCode
            ? `Подтвердите email. Тестовый код: ${verification.debugCode}`
            : (error.message || "Сначала подтвердите email.")
        );
        setIsSubmitting(false);
        return;
      }

      const backendFieldErrors = error?.data?.fieldErrors && typeof error.data.fieldErrors === "object"
        ? error.data.fieldErrors
        : null;

      if (backendFieldErrors) {
        setLoginErrors({
          identifier: typeof backendFieldErrors.identifier === "string" ? backendFieldErrors.identifier : "",
          password: typeof backendFieldErrors.password === "string" ? backendFieldErrors.password : "",
        });
      } else {
        setMessage(error.message || "Не удалось войти в аккаунт.");
      }

      setIsSubmitting(false);
    }
  };

  const handleRequestLoginCode = async (event) => {
    event?.preventDefault?.();
    setMessage("");
    setLoginErrors(initialLoginErrors);

    const identifier = loginForm.identifier.trim();
    if (!identifier) {
      setLoginErrors({
        identifier: "Введите email.",
        password: "",
      });
      return;
    }

    if (!isSupportedEmail(identifier)) {
      setLoginErrors({
        identifier: "Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.",
        password: "",
      });
      return;
    }

    setIsRequestingLoginCode(true);

    try {
      const data = await submitAuthRequest(
        "/auth/request-login-code",
        { identifier },
        "Не удалось отправить код входа."
      );

      setEmailVerificationCode("");
      setEmailVerificationTotpCode("");
      setEmailResendAttemptCount(1);
      const canExposeDebugCode = shouldExposeAuthDebugCode(data?.deliveryMode, data?.debugCode);
      setEmailVerificationModal({
        open: true,
        purpose: "login",
        email: data?.email || identifier,
        verificationToken: data?.verificationToken || "",
        deliveryMode: data?.deliveryMode || "",
        debugCode: canExposeDebugCode ? data?.debugCode || "" : "",
        resendAvailableAt: resolveResendAvailableAt(1, data?.resendAvailableAt),
        requiresTotp: false,
      });

      setMessage("");
    } catch (error) {
      const backendFieldErrors = error?.data?.fieldErrors && typeof error.data.fieldErrors === "object"
        ? error.data.fieldErrors
        : null;

      if (backendFieldErrors) {
        setLoginErrors({
          identifier: typeof backendFieldErrors.identifier === "string" ? backendFieldErrors.identifier : "",
          password: typeof backendFieldErrors.password === "string" ? backendFieldErrors.password : "",
          totpCode: typeof backendFieldErrors.totpCode === "string" ? backendFieldErrors.totpCode : "",
        });
      } else {
        setMessage(error.message || "Не удалось отправить код входа.");
      }
    } finally {
      setIsRequestingLoginCode(false);
    }
  };

  const requestPasswordResetCode = async (email, { resend = false } = {}) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      setLoginErrors({
        identifier: "Введите email.",
        password: "",
      });
      return;
    }

    if (!isSupportedEmail(normalizedEmail)) {
      setLoginErrors({
        identifier: "Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.",
        password: "",
      });
      return;
    }

    setIsRequestingPasswordResetCode(true);
    setMessage("");
    setLoginErrors(initialLoginErrors);

    try {
      const data = await submitAuthRequest(
        "/auth/request-password-reset-code",
        { email: normalizedEmail },
        "Не удалось отправить код восстановления."
      );
      const nextAttemptCount = resend ? Math.max(1, passwordResetAttemptCount + 1) : 1;
      const nextResendAvailableAt = resolveResendAvailableAt(nextAttemptCount, data?.resendAvailableAt);
      const canExposeDebugCode = shouldExposeAuthDebugCode(data?.deliveryMode, data?.debugCode);

      setPasswordResetAttemptCount(nextAttemptCount);
      setPasswordResetCode("");
      setPasswordResetPassword("");
      setPasswordResetPasswordConfirm("");
      setPasswordResetState({
        open: true,
        step: "code",
        email: data?.email || normalizedEmail,
        verificationToken: data?.verificationToken || "",
        deliveryMode: data?.deliveryMode || "",
        debugCode: canExposeDebugCode ? data?.debugCode || "" : "",
        resendAvailableAt: nextResendAvailableAt,
      });
      setMessage(canExposeDebugCode ? `Тестовый код восстановления: ${data.debugCode}` : "");
    } catch (error) {
      const backendFieldErrors = error?.data?.fieldErrors && typeof error.data.fieldErrors === "object"
        ? error.data.fieldErrors
        : null;

      if (backendFieldErrors) {
        setLoginErrors({
          identifier: typeof backendFieldErrors.email === "string" ? backendFieldErrors.email : "",
          password: typeof backendFieldErrors.password === "string" ? backendFieldErrors.password : "",
          totpCode: "",
        });
      } else {
        setMessage(error.message || "Не удалось отправить код восстановления.");
      }
    } finally {
      setIsRequestingPasswordResetCode(false);
    }
  };

  const startPasswordResetFlow = () => {
    resetEmailVerificationModal();
    setIsQrLoginOpen(false);
    closeQrScanner();
    setMessage("");
    setLoginErrors(initialLoginErrors);
    setPasswordResetState({
      ...initialPasswordResetState,
      open: true,
      email: loginForm.identifier.trim().toLowerCase(),
    });
    setPasswordResetCode("");
    setPasswordResetPassword("");
    setPasswordResetPasswordConfirm("");
  };

  const handleRequestPasswordResetCode = async (event) => {
    event?.preventDefault?.();
    await requestPasswordResetCode(passwordResetState.email || loginForm.identifier);
  };

  const handleResendPasswordResetCode = async () => {
    if (!canResendPasswordResetCode) {
      return;
    }

    await requestPasswordResetCode(passwordResetState.email, { resend: true });
  };

  const handleResetPassword = async (event) => {
    event?.preventDefault?.();
    setMessage("");
    setLoginErrors(initialLoginErrors);

    if (!passwordResetState.email || !passwordResetState.verificationToken) {
      setMessage("Сессия восстановления не найдена. Запросите код заново.");
      return;
    }

    if (passwordResetCode.trim().length !== 6) {
      setMessage("Введите шестизначный код из письма.");
      return;
    }

    if (passwordResetPassword.length < 6) {
      setLoginErrors((previous) => ({ ...previous, password: "Пароль должен быть не короче 6 символов." }));
      return;
    }

    if (passwordResetPassword !== passwordResetPasswordConfirm) {
      setLoginErrors((previous) => ({ ...previous, password: "Пароли не совпадают." }));
      return;
    }

    setIsResettingPassword(true);

    try {
      await submitAuthRequest(
        "/auth/reset-password",
        {
          email: passwordResetState.email,
          verificationToken: passwordResetState.verificationToken,
          code: passwordResetCode.trim(),
          password: passwordResetPassword,
        },
        "Не удалось изменить пароль."
      );
      const resetEmail = passwordResetState.email;
      resetPasswordResetFlow();
      setLoginMethod("password");
      setLoginForm((previous) => ({
        ...previous,
        identifier: resetEmail,
        password: "",
        totpCode: "",
      }));
      setMessage("Пароль изменён. Войдите с новым паролем.");
    } catch (error) {
      const backendFieldErrors = error?.data?.fieldErrors && typeof error.data.fieldErrors === "object"
        ? error.data.fieldErrors
        : null;

      if (backendFieldErrors) {
        setLoginErrors({
          identifier: typeof backendFieldErrors.email === "string" ? backendFieldErrors.email : "",
          password: typeof backendFieldErrors.password === "string" ? backendFieldErrors.password : "",
          totpCode: "",
        });
      }
      setMessage(error.message || "Не удалось изменить пароль.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage("");

    const payload = {
      first_name: registerForm.firstName.trim(),
      last_name: registerForm.lastName.trim(),
      nickname: registerForm.nickname.trim(),
      password: registerForm.password,
      email: normalizedRegisterEmail,
    };

    if (!payload.first_name || !payload.nickname || !registerForm.contact.trim()) {
      setMessage("Заполните обязательные поля.");
      return;
    }

    if (!registerNameScript || (payload.last_name && !areNamesUsingSameScript(payload.first_name, payload.last_name))) {
      setMessage("Имя и фамилия должны быть полностью на одном языке: либо на русском, либо на английском.");
      return;
    }

    if (!isNicknameUsingSingleScript(payload.nickname)) {
      setMessage("Никнейм должен быть полностью на одном языке: либо на русском, либо на английском.");
      return;
    }

    if (!isSupportedEmail(payload.email)) {
      setMessage("Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.");
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
      const canExposeDebugCode = shouldExposeAuthDebugCode(verification?.deliveryMode, verification?.debugCode);

      setEmailVerificationCode("");
      setEmailResendAttemptCount(1);
      setEmailVerificationModal({
        open: true,
        purpose: "registration",
        email: verification?.email || payload.email,
        verificationToken: verification?.verificationToken || "",
        deliveryMode: verification?.deliveryMode || "",
        debugCode: canExposeDebugCode ? verification?.debugCode || "" : "",
        resendAvailableAt: resolveResendAvailableAt(1, verification?.resendAvailableAt),
      });

      setMessage(
        canExposeDebugCode
          ? `Аккаунт создан. Тестовый email-код: ${verification.debugCode}`
          : "Аккаунт создан. Мы отправили код подтверждения на почту."
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

    if (emailResendSecondsLeft > 0) {
      return;
    }

    setIsResendingEmailCode(true);
    setMessage("");

    try {
      const data = isLoginEmailVerification
        ? await submitAuthRequest(
            "/auth/request-login-code",
            { identifier: emailVerificationModal.email },
            "Не удалось повторно отправить код входа."
          )
        : await submitAuthRequest(
            "/auth/resend-email-verification",
            { email: emailVerificationModal.email },
            "Не удалось повторно отправить код на почту."
          );

      const nextAttemptCount = Math.max(1, emailResendAttemptCount + 1);
      const nextResendAvailableAt = resolveResendAvailableAt(nextAttemptCount, data?.resendAvailableAt);
      setEmailResendAttemptCount(nextAttemptCount);
      const nextDeliveryMode = data?.deliveryMode || emailVerificationModal.deliveryMode || "";
      const canExposeDebugCode = shouldExposeAuthDebugCode(nextDeliveryMode, data?.debugCode);

      setEmailVerificationModal((previous) => ({
        ...previous,
        open: true,
        purpose: previous.purpose,
        verificationToken: data?.verificationToken || previous.verificationToken,
        deliveryMode: data?.deliveryMode || previous.deliveryMode || "",
        debugCode: canExposeDebugCode ? data?.debugCode || "" : "",
        resendAvailableAt: nextResendAvailableAt,
      }));

      setMessage(canExposeDebugCode ? `Новый тестовый email-код: ${data.debugCode}` : "");
    } catch (error) {
      setMessage(error.message || "Не удалось повторно отправить код на почту.");
    } finally {
      setIsResendingEmailCode(false);
    }
  };

  const handleVerifyEmailCode = async (event) => {
    event?.preventDefault?.();

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
          totpCode: emailVerificationTotpCode.trim(),
        },
        "Не удалось подтвердить почту."
      );
      resetEmailVerificationModal();
      onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
    } catch (error) {
      if (error?.data?.requiresTotp) {
        setEmailVerificationModal((previous) => ({ ...previous, requiresTotp: true }));
      }
      setMessage(error.message || "Не удалось подтвердить почту.");
    } finally {
      setIsVerifyingEmailCode(false);
    }
  };

  useEffect(() => {
    if (!emailVerificationModal.open || isVerifyingEmailCode) {
      return;
    }

    const normalizedCode = emailVerificationCode.trim();
    const normalizedTotpCode = emailVerificationTotpCode.trim();
    if (normalizedCode.length !== 6 || (emailVerificationModal.requiresTotp && normalizedTotpCode.length !== 6)) {
      emailAutoSubmitKeyRef.current = "";
      return;
    }

    const submitKey = [
      emailVerificationModal.verificationToken,
      normalizedCode,
      emailVerificationModal.requiresTotp ? normalizedTotpCode : "",
    ].join(":");
    if (emailAutoSubmitKeyRef.current === submitKey) {
      return;
    }

    emailAutoSubmitKeyRef.current = submitKey;
    void handleVerifyEmailCode();
  }, [
    emailVerificationCode,
    emailVerificationModal.open,
    emailVerificationModal.requiresTotp,
    emailVerificationModal.verificationToken,
    emailVerificationTotpCode,
    handleVerifyEmailCode,
    isVerifyingEmailCode,
  ]);

  function stopQrScanner() {
    if (qrScannerFrameRef.current) {
      window.cancelAnimationFrame(qrScannerFrameRef.current);
      qrScannerFrameRef.current = 0;
    }

    qrScannerBusyRef.current = false;
    qrScannerStreamRef.current?.getTracks?.().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore camera shutdown failures
      }
    });
    qrScannerStreamRef.current = null;

    if (qrScannerVideoRef.current) {
      qrScannerVideoRef.current.srcObject = null;
    }
  }

  function closeQrScanner() {
    setIsQrScannerOpen(false);
    setQrScannerStatus("");
    setQrScannerError("");
    stopQrScanner();
  }

  async function handleQrScannerPayload(payload) {
    setQrScannerStatus("Подключаем аккаунт...");
    const data = await submitAuthRequest(
      "/auth/qr-login/consume",
      payload,
      "Не удалось войти по QR-коду."
    );
    closeQrScanner();
    onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
  }

  function startQrScannerLoop() {
    const BarcodeDetectorClass = typeof window !== "undefined" ? window.BarcodeDetector : undefined;
    if (typeof BarcodeDetectorClass !== "function") {
      setQrScannerStatus("");
      setQrScannerError("Этот браузер пока не умеет считывать QR-коды через камеру.");
      return;
    }

    const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
    const tick = async () => {
      const video = qrScannerVideoRef.current;
      if (!video || video.readyState < 2) {
        qrScannerFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (qrScannerBusyRef.current) {
        qrScannerFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      qrScannerBusyRef.current = true;
      try {
        const results = await detector.detect(video);
        const rawValue = String(results?.[0]?.rawValue || "").trim();
        if (rawValue) {
          const payload = parseQrLoginPayload(rawValue);
          if (payload) {
            setQrScannerStatus("QR-код считан.");
            await handleQrScannerPayload(payload);
            return;
          }

          setQrScannerError("Это не QR-код входа Lanaya.");
        }
      } catch (error) {
        console.error("Ошибка распознавания QR-кода:", error);
        setQrScannerError("Не удалось распознать QR-код. Попробуйте ещё раз.");
      } finally {
        qrScannerBusyRef.current = false;
      }

      qrScannerFrameRef.current = window.requestAnimationFrame(tick);
    };

    qrScannerFrameRef.current = window.requestAnimationFrame(tick);
  }

  async function openQrScanner() {
    setIsQrLoginOpen(false);
    setIsQrScannerOpen(true);
    setQrScannerError("");
    setQrScannerStatus("Открываем камеру...");
    stopQrScanner();

    if (typeof window.BarcodeDetector !== "function") {
      setQrScannerStatus("");
      setQrScannerError("Этот браузер пока не умеет считывать QR-коды через камеру.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setQrScannerStatus("");
      setQrScannerError("На этом устройстве нет доступа к камере.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      qrScannerStreamRef.current = stream;
      if (qrScannerVideoRef.current) {
        qrScannerVideoRef.current.srcObject = stream;
        qrScannerVideoRef.current.muted = true;
        await qrScannerVideoRef.current.play().catch(() => {});
      }

      setQrScannerStatus("Наведите камеру на QR-код входа.");
      startQrScannerLoop();
    } catch (error) {
      console.error("Ошибка запуска QR-сканера:", error);
      setQrScannerStatus("");
      setQrScannerError("Не удалось открыть камеру для QR-кода.");
    }
  }

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setLoginMethod("code");
    setIsQrLoginOpen(false);
    closeQrScanner();
    setMessage("");
    setLoginErrors(initialLoginErrors);
    setIsSubmitting(false);
    setIsRequestingLoginCode(false);
    setIsResendingEmailCode(false);
    setIsVerifyingEmailCode(false);
    resetEmailVerificationModal();
    resetPasswordResetFlow();
  };

  const switchLoginMethod = () => {
    setLoginMethod((previous) => (previous === "code" ? "password" : "code"));
    setIsQrLoginOpen(false);
    closeQrScanner();
    setMessage("");
    setLoginErrors(initialLoginErrors);
    setIsSubmitting(false);
    setIsRequestingLoginCode(false);
    resetPasswordResetFlow();
  };

  const refreshQrLoginSession = () => {
    setQrLoginRefreshIndex((previous) => previous + 1);
  };

  const handleQrLoginEntryClick = () => {
    if (isQrCameraPreferred) {
      openQrScanner();
      return;
    }

    setIsQrLoginOpen((previous) => !previous);
  };

  const handleAuthSubmit = (event) => {
    if (mode !== "login") {
      if (shouldShowRegistrationCodeStep) {
        handleVerifyEmailCode(event);
        return;
      }

      handleRegister(event);
      return;
    }

    if (loginMethod === "code") {
      if (isLoginEmailVerification && emailVerificationModal.open) {
        handleVerifyEmailCode(event);
        return;
      }

      handleRequestLoginCode(event);
      return;
    }

    if (shouldShowPasswordResetStep) {
      if (passwordResetState.step === "email") {
        handleRequestPasswordResetCode(event);
        return;
      }

      handleResetPassword(event);
      return;
    }

    handleLogin(event);
  };

  return (
    <div className={["auth-page", mode === "login" ? "auth-page--login" : "auth-page--register", isLiteVisualMode ? "auth-page--lite" : ""].filter(Boolean).join(" ")}>
      <video
        ref={authVideoRef}
        className="auth-video-bg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden="true"
      >
        <source src={AUTH_BACKGROUND_VIDEO_URL} type="video/mp4" />
      </video>

      <div className="auth-brand">
        <div className="auth-brand__badge">
          <img className="auth-brand__logo" src={brandLogoSrc} alt={AUTH_BRAND_NAME} />
        </div>
        <div className="auth-brand__copy">
          <span className="auth-brand__name">
            <span className="auth-brand__name-base">{AUTH_BRAND_NAME}</span>
          </span>
          <h1 className="auth-brand__title">
            <span className="auth-brand__title-static">пространство для</span>
            <span className="auth-brand__title-rotator" aria-live="polite">
              <span className={`auth-brand__title-typewriter ${isDeletingSlogan ? "auth-brand__title-typewriter--deleting" : ""}`}>
                <span className="auth-brand__title-typewriter-sizer" aria-hidden="true">
                  {sloganWords.reduce((longest, word) => (word.length > longest.length ? word : longest), sloganWords[0] || "")}
                </span>
                <span className="auth-brand__title-typewriter-live">
                  <span className="auth-brand__title-typewriter-word">
                    {activeSloganWord.slice(0, typedSloganLength)}
                  </span>
                  <span className="auth-brand__title-typewriter-caret" aria-hidden="true" />
                </span>
              </span>
            </span>
          </h1>
        </div>
      </div>

      <form
        className={`auth-card auth-card--wide ${mode === "login" ? "auth-card--login" : "auth-card--register"}`}
        onSubmit={handleAuthSubmit}
      >
        <div className="auth-card__main">
          <div className="auth-card__heading">
            {mode === "login" ? (
              <h2 className="auth-card__title auth-card__title--login">Вход</h2>
            ) : shouldShowRegistrationCodeStep ? (
              <h2 className="auth-card__title">Подтвердите почту</h2>
            ) : (
              <h2 className="auth-card__title">Регистрация</h2>
            )}
          </div>

          {mode === "login" ? (
            <div className="auth-section">
              <div className="auth-section__title">Введите email</div>
              <label className="auth-field">
                <input
                  className={`auth-input ${loginErrors.identifier ? "auth-input--error" : ""}`}
                  placeholder="Email"
                  type="text"
                  value={loginForm.identifier}
                  onChange={handleLoginFieldChange("identifier")}
                  maxLength={MAX_AUTH_IDENTIFIER_LENGTH}
                  required
                />
                {loginMethod === "code" ? (
                  <span className="auth-field__error">{loginErrors.identifier}</span>
                ) : null}
              </label>
              {shouldShowPasswordResetStep ? (
                <div className="auth-inline-code auth-section--password-reset">
                  {passwordResetState.step === "email" ? (
                    <p className="auth-inline-code__text">
                      Мы отправим код восстановления на указанную почту.
                    </p>
                  ) : (
                    <>
                      <p className="auth-inline-code__text">
                        Код отправлен на <strong>{passwordResetState.email}</strong>. Введите код и новый пароль.
                      </p>
                      {passwordResetState.deliveryMode === "mock" && passwordResetState.debugCode ? (
                        <div className="auth-hint">Тестовый код: <span className="auth-hint__code">{passwordResetState.debugCode}</span></div>
                      ) : null}
                      <input
                        className="auth-input"
                        placeholder="Код из письма"
                        value={passwordResetCode}
                        onChange={(event) => setPasswordResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        maxLength={6}
                        inputMode="numeric"
                        autoFocus
                      />
                      <input
                        className={`auth-input ${loginErrorMessage ? "auth-input--error" : ""}`}
                        placeholder="Новый пароль"
                        type="password"
                        value={passwordResetPassword}
                        onChange={(event) => {
                          setPasswordResetPassword(event.target.value.slice(0, MAX_AUTH_PASSWORD_LENGTH));
                          setLoginErrors((previous) => ({ ...previous, password: "" }));
                        }}
                        maxLength={MAX_AUTH_PASSWORD_LENGTH}
                        minLength={6}
                      />
                      <input
                        className={`auth-input ${loginErrorMessage ? "auth-input--error" : ""}`}
                        placeholder="Повторите пароль"
                        type="password"
                        value={passwordResetPasswordConfirm}
                        onChange={(event) => {
                          setPasswordResetPasswordConfirm(event.target.value.slice(0, MAX_AUTH_PASSWORD_LENGTH));
                          setLoginErrors((previous) => ({ ...previous, password: "" }));
                        }}
                        maxLength={MAX_AUTH_PASSWORD_LENGTH}
                        minLength={6}
                      />
                      <span className="auth-field__error auth-field__error-slot">{loginErrorMessage}</span>
                      <button
                        type="button"
                        className="auth-switch-link auth-inline-code__resend"
                        onClick={handleResendPasswordResetCode}
                        disabled={!canResendPasswordResetCode}
                      >
                        <span>Отправить код снова</span>
                        <span className="auth-inline-code__timer">
                          {isRequestingPasswordResetCode ? "Отправляем..." : passwordResetSecondsLeft > 0 ? formatCooldown(passwordResetSecondsLeft) : "доступно"}
                        </span>
                      </button>
                    </>
                  )}
                  <button type="button" className="auth-switch-link" onClick={resetPasswordResetFlow}>
                    Назад ко входу
                  </button>
                </div>
              ) : loginMethod === "code" && isLoginEmailVerification && emailVerificationModal.open ? (
                <div className="auth-inline-code">
                  <p className="auth-inline-code__text">
                    Код отправлен на <strong>{emailVerificationModal.email}</strong>.
                  </p>
                  {emailVerificationModal.deliveryMode === "mock" && emailVerificationModal.debugCode ? (
                    <div className="auth-hint">Тестовый код: <span className="auth-hint__code">{emailVerificationModal.debugCode}</span></div>
                  ) : null}
                  <input
                    className="auth-input"
                    placeholder="Код из письма"
                    value={emailVerificationCode}
                    onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                  />
                  {emailVerificationModal.requiresTotp ? (
                    <input
                      className="auth-input"
                      placeholder="Код Google Authenticator"
                      inputMode="numeric"
                      value={emailVerificationTotpCode}
                      onChange={(event) => setEmailVerificationTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="auth-switch-link auth-inline-code__resend"
                    onClick={handleResendEmailCode}
                    disabled={!canResendEmailCode}
                  >
                    <span>Отправить код снова</span>
                    <span className="auth-inline-code__timer">
                      {isResendingEmailCode ? "Отправляем..." : emailResendSecondsLeft > 0 ? formatCooldown(emailResendSecondsLeft) : "доступно"}
                    </span>
                  </button>
                </div>
              ) : null}
              {loginMethod === "password" && !shouldShowPasswordResetStep ? (
                <>
                  <label className="auth-field auth-field--with-error-slot">
                    <input
                      className={`auth-input ${loginErrorMessage ? "auth-input--error" : ""}`}
                      placeholder="Пароль"
                      type="password"
                      value={loginForm.password}
                      onChange={handleLoginFieldChange("password")}
                      maxLength={MAX_AUTH_PASSWORD_LENGTH}
                      required
                    />
                    <span className="auth-field__error auth-field__error-slot">{loginErrorMessage}</span>
                  </label>
                  {loginErrors.totpCode || loginForm.totpCode ? (
                    <label className="auth-field auth-field--with-error-slot">
                      <input
                        className={`auth-input ${loginErrors.totpCode ? "auth-input--error" : ""}`}
                        placeholder="Код Google Authenticator"
                        inputMode="numeric"
                        value={loginForm.totpCode}
                        onChange={handleLoginFieldChange("totpCode")}
                        maxLength={6}
                      />
                      <span className="auth-field__error auth-field__error-slot">{loginErrors.totpCode}</span>
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : shouldShowRegistrationCodeStep ? (
            <div className="auth-section auth-section--registration-code">
              <p className="auth-inline-code__text">
                Код отправлен на <strong>{emailVerificationModal.email}</strong>. Введите его, чтобы завершить регистрацию.
              </p>
              {emailVerificationModal.deliveryMode === "mock" && emailVerificationModal.debugCode ? (
                <div className="auth-hint">Тестовый код: <span className="auth-hint__code">{emailVerificationModal.debugCode}</span></div>
              ) : null}
              <input
                className="auth-input"
                placeholder="Код из письма"
                value={emailVerificationCode}
                onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                autoFocus
              />
              {emailVerificationModal.requiresTotp ? (
                <input
                  className="auth-input"
                  placeholder="Код Google Authenticator"
                  inputMode="numeric"
                  value={emailVerificationTotpCode}
                  onChange={(event) => setEmailVerificationTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                />
              ) : null}
              <div className="auth-registration-code__actions">
                <button type="button" className="auth-switch-link" onClick={returnToRegistrationForm}>
                  Назад
                </button>
                <button
                  type="button"
                  className="auth-switch-link auth-inline-code__resend"
                  onClick={handleResendEmailCode}
                  disabled={!canResendEmailCode}
                >
                  <span>Отправить код снова</span>
                  <span className="auth-inline-code__timer">
                    {isResendingEmailCode ? "Отправляем..." : emailResendSecondsLeft > 0 ? formatCooldown(emailResendSecondsLeft) : "доступно"}
                  </span>
                </button>
              </div>
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
                  maxLength={MAX_AUTH_NAME_LENGTH}
                  required
                />
                <input
                  className="auth-input"
                  placeholder="Фамилия"
                  value={registerForm.lastName}
                  onChange={handleRegisterFieldChange("lastName")}
                  maxLength={MAX_AUTH_NAME_LENGTH}
                />
              </div>

              <input
                className="auth-input"
                placeholder="Никнейм"
                type="text"
                value={registerForm.nickname}
                onChange={handleRegisterFieldChange("nickname")}
                maxLength={MAX_AUTH_NICKNAME_LENGTH}
                required
              />

              <input
                className="auth-input"
                placeholder="Email"
                type="text"
                value={registerForm.contact}
                onChange={handleRegisterFieldChange("contact")}
                maxLength={MAX_AUTH_IDENTIFIER_LENGTH}
                required
              />

              <input
                className="auth-input"
                placeholder="Пароль"
                type="password"
                value={registerForm.password}
                onChange={handleRegisterFieldChange("password")}
                maxLength={MAX_AUTH_PASSWORD_LENGTH}
                minLength={6}
                required
              />
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={isSubmitting || isRequestingLoginCode || isVerifyingEmailCode || isRequestingPasswordResetCode || isResettingPassword}
          >
            {mode === "login"
              ? loginMethod === "code"
                ? isRequestingLoginCode
                  ? "Отправляем код..."
                  : isLoginEmailVerification && emailVerificationModal.open
                    ? isVerifyingEmailCode
                      ? "Проверяем..."
                      : "Подтвердить"
                    : "Войти"
                : shouldShowPasswordResetStep
                  ? passwordResetState.step === "email"
                    ? isRequestingPasswordResetCode
                      ? "Отправляем код..."
                      : "Получить код"
                    : isResettingPassword
                      ? "Сохраняем..."
                      : "Сменить пароль"
                  : isSubmitting
                    ? "Входим..."
                    : "Войти"
              : shouldShowRegistrationCodeStep
                ? isVerifyingEmailCode
                  ? "Проверяем..."
                  : "Подтвердить"
              : isSubmitting
                ? "Создаём аккаунт..."
                : "Зарегистрироваться"}
          </button>

          {mode === "login" ? (
            <>
              <div className="auth-login-divider">
                <span>или</span>
              </div>
              <button
                type="button"
                className="auth-qr-entry"
                onClick={handleQrLoginEntryClick}
                aria-expanded={isQrCameraPreferred ? isQrScannerOpen : isQrLoginOpen}
              >
                <span className="auth-qr-entry__icon" aria-hidden="true" />
                <span>{isQrCameraPreferred ? "Сканировать QR-код" : "Войти по QR-коду"}</span>
                <span className="auth-qr-entry__arrow" aria-hidden="true" />
              </button>
            </>
          ) : null}

          <div className="auth-card__links">
            {mode === "login" ? (
              <button
                type="button"
                className="auth-switch-link"
                onClick={switchLoginMethod}
                disabled={isSubmitting || isRequestingLoginCode || isRequestingPasswordResetCode || isResettingPassword}
              >
                {loginMethod === "code" ? "Войти по паролю" : "Войти по коду из письма"}
              </button>
            ) : null}

            <button
              type="button"
              className="auth-switch-link"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              disabled={isSubmitting || isRequestingLoginCode || isRequestingPasswordResetCode || isResettingPassword}
            >
              {mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт? Войти"}
            </button>
          </div>

          {mode === "login" && loginMethod === "password" && !shouldShowPasswordResetStep ? (
            <div className="auth-card__forgot">
              <button
                type="button"
                className="auth-switch-link"
                onClick={startPasswordResetFlow}
                disabled={isSubmitting || isRequestingPasswordResetCode || isResettingPassword}
              >
                Забыли пароль?
              </button>
            </div>
          ) : null}

          {mode === "register" ? <div className="auth-beta-note">Beta 0.1</div> : null}

          {message ? <p className={`auth-message auth-message--${authMessageTone}`}>{message}</p> : null}
        </div>

        {mode === "login" && isQrLoginOpen ? (
          <aside className="auth-card__side auth-card__side--qr" aria-label="Вход по QR-коду">
            <button
              type="button"
              className="auth-qr-login__close"
              onClick={() => setIsQrLoginOpen(false)}
              aria-label="Закрыть QR-код"
            >
              ×
            </button>
            <div className="auth-qr-login" aria-live="polite">
              <div className="auth-qr-login__title">
                <span>Отсканируйте QR-код</span>
                <span>в приложении</span>
              </div>
              <div className={`auth-qr-login__code ${qrLoginStatus === "expired" ? "auth-qr-login__code--muted" : ""}`}>
                {qrLoginSvg ? (
                  <>
                    <div className="auth-qr-login__svg" dangerouslySetInnerHTML={{ __html: qrLoginSvg }} />
                    <span className="auth-qr-login__logo" aria-hidden="true">
                      <img src={brandLogoSrc} alt="" />
                    </span>
                  </>
                ) : (
                  <div className="auth-qr-login__loader" />
                )}
              </div>
              <div className="auth-qr-login__status">
                {qrLoginStatus === "loading"
                  ? "Готовим QR-код..."
                  : qrLoginStatus === "approved"
                    ? "Вход подтверждён."
                    : qrLoginStatus === "expired"
                      ? "QR-код устарел."
                  : qrLoginStatus === "error"
                        ? qrLoginError || "QR-вход недоступен."
                        : ""}
              </div>
              <button type="button" className="auth-switch-link auth-qr-login__refresh" onClick={refreshQrLoginSession}>
                <span className="auth-qr-login__refresh-icon" aria-hidden="true" />
                <span>Обновить QR-код</span>
              </button>
            </div>
          </aside>
        ) : null}

      </form>

      {isQrScannerOpen ? (
        <div className="auth-qr-scanner" role="dialog" aria-modal="true" aria-label="Сканирование QR-кода">
          <div className="auth-qr-scanner__panel">
            <div className="auth-qr-scanner__header">
              <div>
                <strong>Сканировать QR-код</strong>
                <span>Откройте QR входа в аккаунте на ПК.</span>
              </div>
              <button type="button" className="auth-qr-scanner__close" onClick={closeQrScanner} aria-label="Закрыть камеру">
                ×
              </button>
            </div>
            <div className="auth-qr-scanner__preview">
              <video ref={qrScannerVideoRef} className="auth-qr-scanner__video" autoPlay muted playsInline />
              <span className="auth-qr-scanner__frame" aria-hidden="true" />
            </div>
            {qrScannerStatus ? <div className="auth-qr-scanner__status">{qrScannerStatus}</div> : null}
            {qrScannerError ? <div className="auth-qr-scanner__error">{qrScannerError}</div> : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}


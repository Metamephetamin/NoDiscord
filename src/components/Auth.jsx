import { useEffect, useMemo, useRef, useState } from "react";
import "../css/Auth.css";
import { API_BASE_URL } from "../config/runtime";
import { getApiErrorMessage, getNetworkErrorMessage, parseApiResponse } from "../utils/auth";
import { resolveStaticAssetUrl } from "../utils/media";
import { parseMediaFrame } from "../utils/mediaFrames";
import {
  areNamesUsingSameScript,
  detectNameScript,
  normalizeSingleWordNameInput,
} from "../utils/nameScripts";

const SUPPORTED_EMAIL_DOMAINS = ["gmail.com", "yandex.ru", "list.ru", "mail.ru"];
const EMAIL_RESEND_COOLDOWN_SECONDS = 60;
const MAX_AUTH_NAME_LENGTH = 32;
const MAX_AUTH_NICKNAME_LENGTH = 50;
const MAX_AUTH_IDENTIFIER_LENGTH = 50;
const MAX_AUTH_PASSWORD_LENGTH = 128;
const AUTH_BACKGROUND_VIDEO_URL = resolveStaticAssetUrl("/video/GoldenDustGlow2.mp4");
const AUTH_BRAND_LOGO_URL = resolveStaticAssetUrl("/image/image.png");
const SLOW_CONNECTION_TYPES = new Set(["slow-2g", "2g", "3g"]);

const initialRegisterForm = {
  firstName: "",
  lastName: "",
  nickname: "",
  contact: "",
  password: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvc: "",
};

const initialLoginForm = {
  identifier: "",
  password: "",
};

const initialLoginErrors = {
  identifier: "",
  password: "",
};

const initialPhoneVerificationStatus = {
  verified: false,
  deliveryMode: "",
  debugCode: "",
  resendAvailableAt: "",
};

const initialEmailVerificationModal = {
  open: false,
  email: "",
  verificationToken: "",
  deliveryMode: "",
  debugCode: "",
  resendAvailableAt: "",
};

const sloganWords = ["жизни", "связи", "своих", "роста"];
const SLOGAN_SPECIAL_PAUSE_WORD = "своих";
const SLOGAN_SPECIAL_PAUSE_LENGTH = 3;
const SLOGAN_SPECIAL_PAUSE_MS = 2400;

const TYPING_FORWARD_DELAY_MS = 280;
const TYPING_BACKWARD_DELAY_MS = 180;
const TYPING_HOLD_FULL_MS = 1100;
const TYPING_HOLD_EMPTY_MS = 360;

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

const formatPhoneInput = (value) => value.replace(/[^\d+\-()\s]/g, "").slice(0, 22);

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

function normalizeContactInput(value) {
  const candidate = String(value || "");

  if (candidate.includes("@") || /[a-zA-Z\u0400-\u04FF]/.test(candidate)) {
    return candidate.trimStart().slice(0, MAX_AUTH_IDENTIFIER_LENGTH);
  }

  return formatPhoneInput(candidate);
}

function normalizeIdentifierInput(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .slice(0, MAX_AUTH_IDENTIFIER_LENGTH);
}

function normalizeRussianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.length === 11 && digits[0] === "8") {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits[0] === "7") {
    return `+${digits}`;
  }

  return "";
}

function isSupportedEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const separatorIndex = normalized.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return false;
  }

  return SUPPORTED_EMAIL_DOMAINS.includes(normalized.slice(separatorIndex + 1));
}

function detectContactKind(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  if (candidate.includes("@")) {
    return "email";
  }

  const digits = candidate.replace(/\D/g, "");
  if (digits.length > 0) {
    return "phone";
  }

  return "";
}

function shouldUseLiteAuthVisualMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const usesCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const compactViewport = window.matchMedia("(max-width: 900px)").matches;
  const saveData = Boolean(connection?.saveData);
  const slowConnection = SLOW_CONNECTION_TYPES.has(connection?.effectiveType || "");
  const lowCpu = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4;
  const lowMemory = Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4;

  return prefersReducedMotion || usesCoarsePointer || compactViewport || saveData || slowConnection || lowCpu || lowMemory;
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
    avatarUrl: data?.avatar_url || data?.avatarUrl || "",
    avatar: data?.avatar_url || data?.avatarUrl || "",
    avatarFrame: parseMediaFrame(data?.avatar_frame, data?.avatarFrame),
    avatar_frame: parseMediaFrame(data?.avatar_frame, data?.avatarFrame),
    profileBackgroundUrl: data?.profile_background_url || data?.profileBackgroundUrl || "",
    profileBackground: data?.profile_background_url || data?.profileBackgroundUrl || "",
    profileBackgroundFrame: parseMediaFrame(data?.profile_background_frame, data?.profileBackgroundFrame),
    profile_background_frame: parseMediaFrame(data?.profile_background_frame, data?.profileBackgroundFrame),
  };
}

function normalizeNicknameInput(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{M}\p{N} ]+/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_AUTH_NICKNAME_LENGTH)
    .trimStart();
}

function mapAuthSession(data) {
  return {
    accessToken: data?.token || "",
    refreshToken: data?.refreshToken || "",
    accessTokenExpiresAt: data?.accessTokenExpiresAt || "",
  };
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
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [loginErrors, setLoginErrors] = useState(initialLoginErrors);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingPhoneCode, setIsRequestingPhoneCode] = useState(false);
  const [isVerifyingPhoneCode, setIsVerifyingPhoneCode] = useState(false);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState("");
  const [phoneVerificationToken, setPhoneVerificationToken] = useState("");
  const [phoneVerificationStatus, setPhoneVerificationStatus] = useState(initialPhoneVerificationStatus);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerificationModal, setEmailVerificationModal] = useState(initialEmailVerificationModal);
  const [emailResendSecondsLeft, setEmailResendSecondsLeft] = useState(0);
  const [isResendingEmailCode, setIsResendingEmailCode] = useState(false);
  const [isVerifyingEmailCode, setIsVerifyingEmailCode] = useState(false);
  const [activeSloganWordIndex, setActiveSloganWordIndex] = useState(0);
  const [typedSloganLength, setTypedSloganLength] = useState(0);
  const [isDeletingSlogan, setIsDeletingSlogan] = useState(false);
  const [isLiteVisualMode, setIsLiteVisualMode] = useState(() => shouldUseLiteAuthVisualMode());
  const authVideoRef = useRef(null);

  const cardHolderName = useMemo(() => {
    const composed = `${registerForm.firstName} ${registerForm.lastName}`.trim();
    return composed || "Ваше имя";
  }, [registerForm.firstName, registerForm.lastName]);

  const displayedCardNumber = useMemo(() => {
    const formatted = formatCardNumber(registerForm.cardNumber);
    return formatted || "0000 0000 0000 0000";
  }, [registerForm.cardNumber]);

  const displayedCardExpiry = useMemo(
    () => formatCardExpiry(registerForm.cardExpiry) || "MM/YY",
    [registerForm.cardExpiry]
  );

  const displayedCardCvc = useMemo(() => {
    const digits = registerForm.cardCvc.replace(/\D/g, "").slice(0, 3);
    return digits || "000";
  }, [registerForm.cardCvc]);

  const registerContactKind = useMemo(() => detectContactKind(registerForm.contact), [registerForm.contact]);
  const normalizedRegisterPhone = useMemo(
    () => (registerContactKind === "phone" ? normalizeRussianPhone(registerForm.contact) : ""),
    [registerContactKind, registerForm.contact]
  );
  const normalizedRegisterEmail = useMemo(
    () => (registerContactKind === "email" ? registerForm.contact.trim().toLowerCase() : ""),
    [registerContactKind, registerForm.contact]
  );

  const canRequestPhoneCode =
    registerContactKind === "phone" && Boolean(normalizedRegisterPhone) && !isSubmitting && !isRequestingPhoneCode;
  const canVerifyPhoneCode =
    registerContactKind === "phone" &&
    Boolean(phoneVerificationToken) &&
    phoneVerificationCode.trim().length === 6 &&
    !phoneVerificationStatus.verified &&
    !isVerifyingPhoneCode;
  const canResendEmailCode =
    Boolean(emailVerificationModal.email) &&
    emailResendSecondsLeft === 0 &&
    !isResendingEmailCode;
  const registerNameScript = useMemo(
    () => detectNameScript(registerForm.firstName) || detectNameScript(registerForm.lastName),
    [registerForm.firstName, registerForm.lastName]
  );
  const activeSloganWord = useMemo(
    () => sloganWords[activeSloganWordIndex % sloganWords.length] || "",
    [activeSloganWordIndex]
  );

  const resetPhoneVerification = () => {
    setPhoneVerificationCode("");
    setPhoneVerificationToken("");
    setPhoneVerificationStatus(initialPhoneVerificationStatus);
  };

  const resetEmailVerificationModal = () => {
    setEmailVerificationCode("");
    setEmailResendSecondsLeft(0);
    setEmailVerificationModal(initialEmailVerificationModal);
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
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(max-width: 900px)"),
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
    const videoNode = authVideoRef.current;
    if (!videoNode) {
      return undefined;
    }

    const syncVideoPlayback = () => {
      if (document.hidden) {
        videoNode.pause();
        return;
      }

      const playPromise = videoNode.play();
      if (typeof playPromise?.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    syncVideoPlayback();
    document.addEventListener("visibilitychange", syncVideoPlayback);
    return () => document.removeEventListener("visibilitychange", syncVideoPlayback);
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

  const handleRegisterFieldChange = (field) => (event) => {
    let nextValue = event.target.value;

    if (field === "cardNumber") {
      nextValue = formatCardNumber(nextValue);
    } else if (field === "cardExpiry") {
      nextValue = formatCardExpiry(nextValue);
    } else if (field === "cardCvc") {
      nextValue = nextValue.replace(/\D/g, "").slice(0, 3);
    } else if (field === "firstName" || field === "lastName") {
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
      nextValue = normalizeContactInput(nextValue);
    } else if (field === "nickname") {
      nextValue = normalizeNicknameInput(nextValue);
    } else if (field === "password") {
      nextValue = nextValue.slice(0, MAX_AUTH_PASSWORD_LENGTH);
    }

    setRegisterForm((previous) => ({ ...previous, [field]: nextValue }));

    if (field === "contact") {
      resetPhoneVerification();
    }
  };

  const handleLoginFieldChange = (field) => (event) => {
    const nextValue =
      field === "identifier"
        ? normalizeIdentifierInput(event.target.value)
        : field === "password"
          ? event.target.value.slice(0, MAX_AUTH_PASSWORD_LENGTH)
          : event.target.value;

    setLoginForm((previous) => ({ ...previous, [field]: nextValue }));
    setLoginErrors((previous) => ({ ...previous, [field]: "" }));
    setMessage("");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoginErrors(initialLoginErrors);

    const payload = {
      identifier: loginForm.identifier.trim(),
      password: loginForm.password,
    };

    if (!payload.identifier || !payload.password) {
      setLoginErrors({
        identifier: payload.identifier ? "" : "Введите email или номер телефона.",
        password: payload.password ? "" : "Введите пароль.",
      });
      return;
    }

    if (payload.identifier.includes("@") && !isSupportedEmail(payload.identifier)) {
      setLoginErrors({
        identifier: "Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.",
        password: "",
      });
      return;
    }

    if (!payload.identifier.includes("@") && !normalizeRussianPhone(payload.identifier)) {
      setLoginErrors({
        identifier: "Введите номер телефона в формате +79891112233.",
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
        setEmailVerificationCode("");
        setEmailVerificationModal({
          open: true,
          email: verification.email || payload.identifier,
          verificationToken: verification.verificationToken || "",
          deliveryMode: verification.deliveryMode || "mock",
          debugCode: verification.debugCode || "",
          resendAvailableAt: verification.resendAvailableAt || "",
        });
        setMessage(
          verification.debugCode
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

  const handleRequestPhoneCode = async () => {
    setMessage("");

    if (!normalizedRegisterPhone) {
      setMessage("Введите российский номер телефона в формате +7XXXXXXXXXX.");
      return;
    }

    setIsRequestingPhoneCode(true);

    try {
      const data = await submitAuthRequest(
        "/auth/request-phone-verification",
        { phone: normalizedRegisterPhone },
        "Не удалось отправить код подтверждения."
      );

      setPhoneVerificationToken(data?.verificationToken || "");
      setPhoneVerificationStatus({
        verified: false,
        deliveryMode: data?.deliveryMode || "mock",
        debugCode: data?.debugCode || "",
        resendAvailableAt: data?.resendAvailableAt || "",
      });

      setMessage(
        data?.debugCode
          ? `Код подтверждения получен. Тестовый код: ${data.debugCode}`
          : "Код подтверждения отправлен на номер телефона."
      );
    } catch (error) {
      setMessage(error.message || "Не удалось отправить код подтверждения.");
    } finally {
      setIsRequestingPhoneCode(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    setMessage("");

    if (!normalizedRegisterPhone || !phoneVerificationToken) {
      setMessage("Сначала запросите код подтверждения.");
      return;
    }

    setIsVerifyingPhoneCode(true);

    try {
      await submitAuthRequest(
        "/auth/verify-phone-code",
        {
          phone: normalizedRegisterPhone,
          verificationToken: phoneVerificationToken,
          code: phoneVerificationCode.trim(),
        },
        "Не удалось подтвердить номер телефона."
      );

      setPhoneVerificationStatus((previous) => ({ ...previous, verified: true }));
      setMessage("Номер телефона подтверждён.");
    } catch (error) {
      setMessage(error.message || "Не удалось подтвердить номер телефона.");
    } finally {
      setIsVerifyingPhoneCode(false);
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
      ...(registerContactKind === "email" ? { email: normalizedRegisterEmail } : {}),
      ...(registerContactKind === "phone"
        ? {
            phone: normalizedRegisterPhone,
            phone_verification_token: phoneVerificationToken,
          }
        : {}),
    };

    if (!payload.first_name || !payload.nickname || !registerForm.contact.trim()) {
      setMessage("Заполните обязательные поля.");
      return;
    }

    if (!registerNameScript || (payload.last_name && !areNamesUsingSameScript(payload.first_name, payload.last_name))) {
      setMessage("Имя и фамилия должны быть полностью на одном языке: либо на русском, либо на английском.");
      return;
    }

    if (registerContactKind === "email") {
      if (!isSupportedEmail(payload.email)) {
        setMessage("Разрешены только gmail.com, yandex.ru, list.ru и mail.ru.");
        return;
      }
    } else if (registerContactKind === "phone") {
      if (!normalizedRegisterPhone) {
        setMessage("Введите российский номер телефона в формате +7XXXXXXXXXX.");
        return;
      }

      if (!phoneVerificationStatus.verified || !phoneVerificationToken) {
        setMessage("Сначала подтвердите номер телефона кодом.");
        return;
      }
    } else {
      setMessage("Введите email или номер телефона.");
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

      setEmailVerificationCode("");
      setEmailVerificationModal({
        open: true,
        email: verification?.email || payload.email,
        verificationToken: verification?.verificationToken || "",
        deliveryMode: verification?.deliveryMode || "mock",
        debugCode: verification?.debugCode || "",
        resendAvailableAt: verification?.resendAvailableAt || "",
      });

      setMessage(
        verification?.debugCode
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
      setMessage(`Повторно отправить код можно через ${formatCooldown(emailResendSecondsLeft)}.`);
      return;
    }

    setIsResendingEmailCode(true);
    setMessage("");

    try {
      const data = await submitAuthRequest(
        "/auth/resend-email-verification",
        { email: emailVerificationModal.email },
        "Не удалось повторно отправить код на почту."
      );

      const nextResendAvailableAt = data?.resendAvailableAt || "";

      setEmailVerificationModal((previous) => ({
        ...previous,
        open: true,
        verificationToken: data?.verificationToken || previous.verificationToken,
        deliveryMode: data?.deliveryMode || previous.deliveryMode || "mock",
        debugCode: data?.debugCode || "",
        resendAvailableAt: nextResendAvailableAt,
      }));

      setMessage(data?.debugCode ? `Новый тестовый email-код: ${data.debugCode}` : "Код подтверждения повторно отправлен на почту.");
    } catch (error) {
      setMessage(error.message || "Не удалось повторно отправить код на почту.");
    } finally {
      setIsResendingEmailCode(false);
    }
  };

  const handleVerifyEmailCode = async (event) => {
    event.preventDefault();

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
        },
        "Не удалось подтвердить почту."
      );
      resetEmailVerificationModal();
      onAuthSuccess(mapAuthUser(data), mapAuthSession(data));
    } catch (error) {
      setMessage(error.message || "Не удалось подтвердить почту.");
    } finally {
      setIsVerifyingEmailCode(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setLoginErrors(initialLoginErrors);
    setIsSubmitting(false);
    setIsRequestingPhoneCode(false);
    setIsVerifyingPhoneCode(false);
    setIsResendingEmailCode(false);
    setIsVerifyingEmailCode(false);
    resetEmailVerificationModal();
  };

  return (
    <div className="auth-page">
      <video
        ref={authVideoRef}
        className="auth-video-bg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden="true"
      >
        <source src={AUTH_BACKGROUND_VIDEO_URL} type="video/mp4" />
      </video>

      <div className="auth-brand">
        <div className="auth-brand__badge">
          <img className="auth-brand__logo" src={AUTH_BRAND_LOGO_URL} alt="MAX" />
        </div>
        <div className="auth-brand__copy">
          <span className="auth-brand__name">
            <span className="auth-brand__name-base">MAX</span>
            {!isLiteVisualMode ? (
              <span className="auth-brand__name-overlay auth-brand__name-overlay--glitch" data-text="MAX" aria-hidden="true">
                MAX
              </span>
            ) : null}
          </span>
          <h1 className="auth-brand__title">
            <span className="auth-brand__title-static">максимум возможностей для</span>
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
        className={`auth-card auth-card--wide ${mode === "login" ? "auth-card--login" : ""}`}
        onSubmit={mode === "login" ? handleLogin : handleRegister}
      >
        <div className="auth-card__main">
          <div className="auth-card__heading">
            <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
          </div>

          {mode === "login" ? (
            <div className="auth-section">
              <div className="auth-section__title">Данные для входа</div>
              <label className="auth-field">
                <input
                  className={`auth-input ${loginErrors.identifier ? "auth-input--error" : ""}`}
                  placeholder="Email или телефон"
                  type="text"
                  value={loginForm.identifier}
                  onChange={handleLoginFieldChange("identifier")}
                  maxLength={MAX_AUTH_IDENTIFIER_LENGTH}
                  required
                />
                {loginErrors.identifier ? <span className="auth-field__error">{loginErrors.identifier}</span> : null}
              </label>
              <label className="auth-field">
                <input
                  className={`auth-input ${loginErrors.password ? "auth-input--error" : ""}`}
                  placeholder="Пароль"
                  type="password"
                  value={loginForm.password}
                  onChange={handleLoginFieldChange("password")}
                  maxLength={MAX_AUTH_PASSWORD_LENGTH}
                  required
                />
                {loginErrors.password ? <span className="auth-field__error">{loginErrors.password}</span> : null}
              </label>
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
                placeholder="Email или телефон"
                type="text"
                value={registerForm.contact}
                onChange={handleRegisterFieldChange("contact")}
                maxLength={MAX_AUTH_IDENTIFIER_LENGTH}
                required
              />
              {registerContactKind === "phone" ? (
                <div className="auth-phone-verify">
                  <button
                    className="auth-submit auth-submit--secondary"
                    type="button"
                    onClick={handleRequestPhoneCode}
                    disabled={!canRequestPhoneCode}
                  >
                    {isRequestingPhoneCode ? "Отправляем код..." : "Получить код"}
                  </button>

                  <div className="auth-grid auth-grid--double auth-grid--verify">
                    <input
                      className="auth-input"
                      placeholder="Код из SMS"
                      value={phoneVerificationCode}
                      onChange={(event) => setPhoneVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <button
                      className="auth-submit auth-submit--secondary"
                      type="button"
                      onClick={handleVerifyPhoneCode}
                      disabled={!canVerifyPhoneCode}
                    >
                      {isVerifyingPhoneCode ? "Проверяем..." : phoneVerificationStatus.verified ? "Номер подтверждён" : "Подтвердить"}
                    </button>
                  </div>

                  {phoneVerificationStatus.deliveryMode === "mock" && phoneVerificationStatus.debugCode ? (
                    <div className="auth-hint">Тестовый код: {phoneVerificationStatus.debugCode}</div>
                  ) : null}
                </div>
              ) : null}

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

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "login"
                ? "Входим..."
                : "Создаём аккаунт..."
              : mode === "login"
                ? "Войти"
                : "Зарегистрироваться"}
          </button>

          <button
            type="button"
            className="auth-switch-link"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
            disabled={isSubmitting}
          >
            {mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}
          </button>

          {mode === "register" ? <div className="auth-beta-note">Beta 0.1</div> : null}

          {message ? <p className="auth-message">{message}</p> : null}
        </div>

        <aside className="auth-card__side">
          <div className="auth-side__title">Платёжная карта</div>
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
                <span>Показываем только визуальный макет</span>
                <span className="bank-card__cvc">{displayedCardCvc}</span>
              </div>
            </div>
          </div>

          <div className="auth-grid auth-grid--double auth-grid--card">
            <input
              className="auth-input"
              placeholder="Номер карты"
              value={registerForm.cardNumber}
              onChange={handleRegisterFieldChange("cardNumber")}
              onFocus={() => setIsCardFlipped(false)}
            />
            <input
              className="auth-input"
              placeholder="Срок действия"
              value={registerForm.cardExpiry}
              onChange={handleRegisterFieldChange("cardExpiry")}
              onFocus={() => setIsCardFlipped(false)}
            />
            <input
              className="auth-input auth-input--compact"
              placeholder="CVC"
              value={registerForm.cardCvc}
              onChange={handleRegisterFieldChange("cardCvc")}
              onFocus={() => setIsCardFlipped(true)}
              onBlur={() => setIsCardFlipped(false)}
            />
          </div>
        </aside>
      </form>

      {emailVerificationModal.open ? (
        <div className="auth-verify-modal__backdrop">
          <form className="auth-verify-modal" onSubmit={handleVerifyEmailCode}>
            <div className="auth-verify-modal__header">
              <h3>Подтвердите почту</h3>
              <button type="button" className="auth-verify-modal__close" onClick={resetEmailVerificationModal}>
                ×
              </button>
            </div>
            <p className="auth-verify-modal__text">
              Мы отправили код на <strong>{emailVerificationModal.email}</strong>. Введите его, чтобы завершить регистрацию. Если письма нет, проверьте папку со спамом.
            </p>
            {emailVerificationModal.deliveryMode === "mock" && emailVerificationModal.debugCode ? (
              <div className="auth-hint">Тестовый код: {emailVerificationModal.debugCode}</div>
            ) : null}
            <input
              className="auth-input"
              placeholder="Код из письма"
              value={emailVerificationCode}
              onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
            {emailResendSecondsLeft > 0 ? (
              <div className="auth-hint">Повторная отправка будет доступна через {formatCooldown(emailResendSecondsLeft)}.</div>
            ) : null}
            <div className="auth-verify-modal__actions">
              <button className="auth-submit auth-submit--secondary" type="button" onClick={handleResendEmailCode} disabled={!canResendEmailCode}>
                {isResendingEmailCode ? "Отправляем..." : emailResendSecondsLeft > 0 ? `Повторить через ${formatCooldown(emailResendSecondsLeft)}` : "Отправить код снова"}
              </button>
              <button className="auth-submit" type="submit" disabled={isVerifyingEmailCode}>
                {isVerifyingEmailCode ? "Проверяем..." : "Подтвердить"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}


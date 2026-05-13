const DEFAULT_DIAGNOSTIC_ENDPOINT_URL = "/api/diagnostics/client-events";
const MAX_QUEUE_LENGTH = 20;
const MAX_FIELD_LENGTH = 160;
const MAX_ROUTE_LENGTH = 240;
const MAX_SENT_PER_SESSION = 80;

const ALLOWED_FIELDS = new Set([
  "type",
  "surface",
  "route",
  "appVersion",
  "errorName",
  "phase",
  "status",
  "timestamp",
]);

const SENSITIVE_FIELD_PATTERN = /(authorization|body|content|cookie|message|password|secret|stack|text|token)/i;
const SENSITIVE_ROUTE_VALUE_PATTERN = /([?&][^=]*(?:token|authorization|cookie|password|secret)[^=]*=)[^&#\s]+/gi;

let diagnosticQueue = [];
let isFlushInFlight = false;
let sentThisSession = 0;

function resolveDiagnosticsEndpointUrl() {
  const runtimeApiUrl = typeof window !== "undefined" ? window.electronRuntime?.apiUrl : "";
  const configuredApiUrl = String(runtimeApiUrl || import.meta.env?.VITE_API_URL || "").trim().replace(/\/+$/, "");
  return configuredApiUrl
    ? `${configuredApiUrl}/diagnostics/client-events`
    : DEFAULT_DIAGNOSTIC_ENDPOINT_URL;
}

function normalizeDiagnosticText(value, maxLength = MAX_FIELD_LENGTH) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function containsSensitiveFieldName(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveFieldName(item));
  }

  return Object.entries(value).some(([key, nestedValue]) => (
    SENSITIVE_FIELD_PATTERN.test(key) || containsSensitiveFieldName(nestedValue)
  ));
}

function readCurrentRoute() {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location?.pathname || ""}${window.location?.search || ""}${window.location?.hash || ""}`;
}

function readAppVersion() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.electronRuntime?.appVersion || "";
}

export function sanitizeClientDiagnosticEvent(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || containsSensitiveFieldName(input)) {
    return null;
  }

  const event = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_FIELDS.has(key)) {
      continue;
    }

    const maxLength = key === "route" ? MAX_ROUTE_LENGTH : MAX_FIELD_LENGTH;
    event[key] = normalizeDiagnosticText(value, maxLength);
  }

  event.type ||= "client diagnostic";
  event.surface ||= "renderer";
  event.route ||= normalizeDiagnosticText(readCurrentRoute(), MAX_ROUTE_LENGTH);
  event.appVersion ||= normalizeDiagnosticText(readAppVersion());
  event.timestamp ||= new Date().toISOString();

  event.route = event.route.replace(SENSITIVE_ROUTE_VALUE_PATTERN, "$1[redacted]");
  return event.type && event.surface ? event : null;
}

async function flushClientDiagnostics() {
  if (isFlushInFlight || diagnosticQueue.length === 0 || sentThisSession >= MAX_SENT_PER_SESSION) {
    return;
  }

  isFlushInFlight = true;
  const event = diagnosticQueue.shift();
  try {
    sentThisSession += 1;
    await fetch(resolveDiagnosticsEndpointUrl(), {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Diagnostics must never break the app.
  } finally {
    isFlushInFlight = false;
    if (diagnosticQueue.length > 0) {
      queueMicrotask(() => {
        flushClientDiagnostics();
      });
    }
  }
}

export function reportClientDiagnostic(input = {}) {
  const event = sanitizeClientDiagnosticEvent(input);
  if (!event || sentThisSession >= MAX_SENT_PER_SESSION) {
    return false;
  }

  diagnosticQueue.push(event);
  if (diagnosticQueue.length > MAX_QUEUE_LENGTH) {
    diagnosticQueue = diagnosticQueue.slice(-MAX_QUEUE_LENGTH);
  }

  flushClientDiagnostics();
  return true;
}

function classifyRendererError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("failed to fetch dynamically imported module")
    || text.includes("loading chunk")
    || text.includes("chunkloaderror")
    || text.includes("module script")
    ? "failed chunk load"
    : "renderer uncaught exception";
}

export function installGlobalClientDiagnostics() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleWindowError = (event) => {
    const error = event?.error;
    const message = error?.message || event?.message || "";
    reportClientDiagnostic({
      type: classifyRendererError(message),
      errorName: error?.name || "Error",
      surface: "window-error",
    });
  };

  const handleUnhandledRejection = (event) => {
    const reason = event?.reason;
    const message = reason?.message || reason || "";
    reportClientDiagnostic({
      type: classifyRendererError(message),
      errorName: reason?.name || "UnhandledRejection",
      surface: "unhandledrejection",
    });
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}

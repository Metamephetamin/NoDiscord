const MAX_PERF_EVENTS = 500;

export const PERF_AREAS = [
  "app-shell",
  "menu-main",
  "text-chat",
  "media",
  "voice",
  "auth",
  "network",
  "electron-main",
];

const PERF_AREA_SET = new Set(PERF_AREAS);

const rendererPerfState = {
  initialized: false,
  observer: null,
  events: [],
  activeTraces: new Map(),
  sequence: 0,
};

function readPerfAuditFlag() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const rawValue = window.localStorage.getItem("nodiscord.debug.perf");
    return rawValue === "1" || rawValue === "true";
  } catch {
    return false;
  }
}

export const PERF_ENABLED = String(import.meta.env?.VITE_PERF_AUDIT || "").trim() === "1" || readPerfAuditFlag();

/**
 * @typedef {Object} PerfEvent
 * @property {string} traceId
 * @property {string} area
 * @property {string} action
 * @property {string} startedAt
 * @property {number} durationMs
 * @property {number} longTaskCount
 * @property {string} route
 * @property {Record<string, unknown>} extra
 */

function getNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function buildTraceId(area, action) {
  rendererPerfState.sequence += 1;
  return `${area}:${action}:${Date.now()}:${rendererPerfState.sequence}`;
}

function getCurrentRoute() {
  if (typeof window === "undefined" || !window.location) {
    return "/";
  }

  return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
}

function normalizeArea(area) {
  const normalizedArea = String(area || "").trim().toLowerCase();
  return PERF_AREA_SET.has(normalizedArea) ? normalizedArea : "app-shell";
}

function normalizeExtra(extra) {
  return extra && typeof extra === "object" && !Array.isArray(extra) ? extra : {};
}

function appendPerfEvent(event) {
  rendererPerfState.events.push(event);
  if (rendererPerfState.events.length > MAX_PERF_EVENTS) {
    rendererPerfState.events.splice(0, rendererPerfState.events.length - MAX_PERF_EVENTS);
  }

  if (typeof window !== "undefined") {
    window.__TEND_PERF__ = window.__TEND_PERF__ || {};
    window.__TEND_PERF__.events = rendererPerfState.events;
  }

  if (PERF_ENABLED) {
    console.debug("[perf]", event);
    const recordPromise = window?.electronPerf?.record?.(event);
    if (recordPromise && typeof recordPromise.catch === "function") {
      void recordPromise.catch(() => {});
    }
  }
}

function markTrace(name) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") {
    return;
  }

  try {
    performance.mark(name);
  } catch {
    // ignore duplicate/unsupported marks
  }
}

function measureTrace(traceId) {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") {
    return null;
  }

  try {
    const measureName = `${traceId}:measure`;
    performance.measure(measureName, `${traceId}:start`, `${traceId}:end`);
    const entries = typeof performance.getEntriesByName === "function" ? performance.getEntriesByName(measureName) : [];
    const entry = Array.isArray(entries) ? entries[entries.length - 1] : null;
    if (typeof performance.clearMarks === "function") {
      performance.clearMarks(`${traceId}:start`);
      performance.clearMarks(`${traceId}:end`);
    }
    if (typeof performance.clearMeasures === "function") {
      performance.clearMeasures(measureName);
    }
    return entry;
  } catch {
    return null;
  }
}

export function startPerfTrace(area, action, extra = {}) {
  if (!PERF_ENABLED) {
    return "";
  }

  const normalizedArea = normalizeArea(area);
  const normalizedAction = String(action || "unknown").trim() || "unknown";
  const traceId = buildTraceId(normalizedArea, normalizedAction);
  const startedAtMs = getNow();
  const trace = {
    traceId,
    area: normalizedArea,
    action: normalizedAction,
    startedAtMs,
    startedAt: new Date().toISOString(),
    route: getCurrentRoute(),
    extra: normalizeExtra(extra),
    longTaskCount: 0,
  };

  rendererPerfState.activeTraces.set(traceId, trace);
  markTrace(`${traceId}:start`);
  return traceId;
}

export function finishPerfTrace(traceId, extra = {}) {
  if (!traceId || !PERF_ENABLED) {
    return null;
  }

  const trace = rendererPerfState.activeTraces.get(traceId);
  if (!trace) {
    return null;
  }

  rendererPerfState.activeTraces.delete(traceId);
  markTrace(`${traceId}:end`);
  const measuredEntry = measureTrace(traceId);
  const durationMs = Number(measuredEntry?.duration) || Math.max(0, getNow() - trace.startedAtMs);
  const event = {
    traceId,
    area: trace.area,
    action: trace.action,
    startedAt: trace.startedAt,
    durationMs: Number(durationMs.toFixed(2)),
    longTaskCount: Number(trace.longTaskCount || 0),
    route: trace.route,
    extra: {
      ...trace.extra,
      ...normalizeExtra(extra),
    },
  };

  appendPerfEvent(event);
  return event;
}

export function cancelPerfTrace(traceId) {
  if (!traceId) {
    return;
  }

  rendererPerfState.activeTraces.delete(traceId);
  if (typeof performance?.clearMarks === "function") {
    performance.clearMarks(`${traceId}:start`);
    performance.clearMarks(`${traceId}:end`);
  }
  if (typeof performance?.clearMeasures === "function") {
    performance.clearMeasures(`${traceId}:measure`);
  }
}

export function finishPerfTraceOnNextFrame(traceId, extra = {}, frameCount = 2) {
  if (!traceId || !PERF_ENABLED) {
    return;
  }

  let remainingFrames = Math.max(1, Number(frameCount) || 1);
  const scheduleFrame =
    typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);

  const step = () => {
    remainingFrames -= 1;
    if (remainingFrames <= 0) {
      finishPerfTrace(traceId, extra);
      return;
    }

    scheduleFrame(step);
  };

  scheduleFrame(step);
}

export function recordLongTask(area, action, durationMs, extra = {}) {
  if (!PERF_ENABLED) {
    return null;
  }

  rendererPerfState.activeTraces.forEach((trace) => {
    trace.longTaskCount += 1;
  });

  const event = {
    traceId: buildTraceId(normalizeArea(area), `${action}:longtask`),
    area: normalizeArea(area),
    action: `${String(action || "unknown").trim() || "unknown"}:longtask`,
    startedAt: new Date().toISOString(),
    durationMs: Number((Number(durationMs) || 0).toFixed(2)),
    longTaskCount: 1,
    route: getCurrentRoute(),
    extra: normalizeExtra(extra),
  };

  appendPerfEvent(event);
  return event;
}

export function recordPerfEvent(area, action, extra = {}, durationMs = 0) {
  if (!PERF_ENABLED) {
    return null;
  }

  const event = {
    traceId: buildTraceId(normalizeArea(area), action),
    area: normalizeArea(area),
    action: String(action || "unknown").trim() || "unknown",
    startedAt: new Date().toISOString(),
    durationMs: Number((Number(durationMs) || 0).toFixed(2)),
    longTaskCount: 0,
    route: getCurrentRoute(),
    extra: normalizeExtra(extra),
  };

  appendPerfEvent(event);
  return event;
}

export function recordReactCommit(area, componentId, phase, actualDuration, baseDuration, startTime, commitTime, extra = {}) {
  if (!PERF_ENABLED) {
    return null;
  }

  const event = {
    traceId: buildTraceId(normalizeArea(area), `${componentId}:react-commit`),
    area: normalizeArea(area),
    action: `${String(componentId || "component").trim() || "component"}:react-commit`,
    startedAt: new Date().toISOString(),
    durationMs: Number((Number(actualDuration) || 0).toFixed(2)),
    longTaskCount: 0,
    route: getCurrentRoute(),
    extra: {
      phase: String(phase || "unknown"),
      baseDurationMs: Number((Number(baseDuration) || 0).toFixed(2)),
      startTimeMs: Number((Number(startTime) || 0).toFixed(2)),
      commitTimeMs: Number((Number(commitTime) || 0).toFixed(2)),
      ...normalizeExtra(extra),
    },
  };

  appendPerfEvent(event);
  return event;
}

export function getPerfEvents() {
  return [...rendererPerfState.events];
}

export function clearPerfEvents() {
  rendererPerfState.events = [];
  if (typeof window !== "undefined" && window.__TEND_PERF__) {
    window.__TEND_PERF__.events = rendererPerfState.events;
  }
}

export async function measureElectronIpcRoundTrip(action = "ipc-roundtrip", extra = {}) {
  if (!PERF_ENABLED || !window?.electronPerf?.ping) {
    return null;
  }

  const traceId = startPerfTrace("electron-main", action, extra);
  if (!traceId) {
    return null;
  }

  try {
    const response = await window.electronPerf.ping({
      action,
      route: getCurrentRoute(),
      requestedAt: new Date().toISOString(),
    });
    return finishPerfTrace(traceId, {
      ...normalizeExtra(extra),
      mainReceivedAt: response?.receivedAt || "",
    });
  } catch (error) {
    return finishPerfTrace(traceId, {
      ...normalizeExtra(extra),
      failed: true,
      error: String(error?.message || error || "ipc-roundtrip-failed"),
    });
  }
}

export function initRendererPerfMonitoring() {
  if (!PERF_ENABLED || rendererPerfState.initialized || typeof window === "undefined") {
    return;
  }

  rendererPerfState.initialized = true;
  window.__TEND_PERF__ = {
    getEvents: () => getPerfEvents(),
    clear: () => clearPerfEvents(),
    startPerfTrace,
    finishPerfTrace,
    finishPerfTraceOnNextFrame,
    recordLongTask,
    measureElectronIpcRoundTrip,
    events: rendererPerfState.events,
  };

  if (typeof PerformanceObserver !== "function") {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if ((Number(entry?.duration) || 0) < 50) {
          return;
        }

        recordLongTask("app-shell", "renderer-main-thread", entry.duration, {
          entryType: entry.entryType || "longtask",
          name: entry.name || "longtask",
        });
      });
    });

    observer.observe({ entryTypes: ["longtask"] });
    rendererPerfState.observer = observer;
  } catch {
    rendererPerfState.observer = null;
  }
}

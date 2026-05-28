import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startChatConnection } from "../SignalR/ChatConnect";
import { API_BASE_URL } from "../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../utils/auth";

const LOCATION_UPDATE_MIN_INTERVAL_MS = 1800;
const DEFAULT_LOCATION_SHARING_PREFERENCE = Object.freeze({
  enabled: true,
  visibility: "friends",
  retentionHours: 24,
});

export const LOCATION_SHARING_PREFERENCE_EVENT = "lanaya:location-sharing-preference";
export const SELF_LOCATION_UPDATED_EVENT = "lanaya:self-location-updated";
export const LOCATION_SHARING_STORAGE_KEY = "lanaya.locationSharingPreference";
export const SELF_LOCATION_STORAGE_KEY = "lanaya.selfLocation";

const normalizePreference = (value) => ({
  enabled: Boolean(value?.enabled ?? DEFAULT_LOCATION_SHARING_PREFERENCE.enabled),
  visibility: String(value?.visibility || DEFAULT_LOCATION_SHARING_PREFERENCE.visibility),
  retentionHours: Number.isFinite(Number(value?.retentionHours))
    ? Number(value.retentionHours)
    : DEFAULT_LOCATION_SHARING_PREFERENCE.retentionHours,
});

const safeReadJson = (key) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const safeWriteJson = (key, value) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional for this feature.
  }
};

const dispatchBrowserEvent = (name, detail) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(name, { detail }));
};

export const readStoredLocationSharingPreference = () => {
  const storedPreference = safeReadJson(LOCATION_SHARING_STORAGE_KEY);
  return storedPreference ? normalizePreference(storedPreference) : DEFAULT_LOCATION_SHARING_PREFERENCE;
};

export const readStoredSelfLocation = () => safeReadJson(SELF_LOCATION_STORAGE_KEY);

export default function useLocationSharingPreference({ user, apiBaseUrl = API_BASE_URL } = {}) {
  const userId = String(user?.id || user?.userId || "").trim();
  const [preference, setPreference] = useState(() => readStoredLocationSharingPreference());
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const lastSentAtRef = useRef(0);

  const applyPreference = useCallback((nextPreference) => {
    const normalized = normalizePreference(nextPreference);
    setPreference(normalized);
    safeWriteJson(LOCATION_SHARING_STORAGE_KEY, normalized);
    dispatchBrowserEvent(LOCATION_SHARING_PREFERENCE_EVENT, normalized);
    return normalized;
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      return applyPreference(DEFAULT_LOCATION_SHARING_PREFERENCE);
    }

    setIsLoading(true);
    try {
      const response = await authFetch(`${apiBaseUrl}/api/user/location-sharing`);
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось получить настройки геолокации."));
      }

      setStatus("");
      return applyPreference(data);
    } catch (error) {
      setStatus(error?.message || "Не удалось получить настройки геолокации.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, applyPreference, userId]);

  const updatePreference = useCallback(async (enabled) => {
    if (!userId) {
      return null;
    }

    setIsSaving(true);
    try {
      const response = await authFetch(`${apiBaseUrl}/api/user/location-sharing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: Boolean(enabled),
          visibility: enabled ? "friends" : "none",
        }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось сохранить настройки геолокации."));
      }

      setStatus(enabled ? "Геопозиция включена." : "Геопозиция выключена.");
      return applyPreference(data);
    } catch (error) {
      setStatus(error?.message || "Не удалось сохранить настройки геолокации.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [apiBaseUrl, applyPreference, userId]);

  const clearLocation = useCallback(async () => {
    if (!userId) {
      return null;
    }

    setIsSaving(true);
    try {
      const response = await authFetch(`${apiBaseUrl}/api/user/location-sharing/clear`, {
        method: "POST",
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Не удалось стереть последнюю геопозицию."));
      }

      if (typeof window !== "undefined") {
        window.localStorage?.removeItem(SELF_LOCATION_STORAGE_KEY);
      }
      setStatus("Последняя геопозиция стерта.");
      return applyPreference(data);
    } catch (error) {
      setStatus(error?.message || "Не удалось стереть последнюю геопозицию.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [apiBaseUrl, applyPreference, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId || !preference.enabled || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      if (preference.enabled && typeof navigator !== "undefined" && !("geolocation" in navigator)) {
        setStatus("геолокация недоступна");
      }
      return undefined;
    }

    const publishLocation = (position) => {
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }

      const payload = {
        id: userId,
        userId,
        name: String(user?.nickname || user?.firstName || user?.first_name || "Вы").trim() || "Вы",
        avatar: user?.avatar || user?.avatarUrl || "",
        locationLabel: "Моё местоположение",
        latitude,
        longitude,
        kind: "self",
        updatedAt: new Date().toISOString(),
      };

      safeWriteJson(SELF_LOCATION_STORAGE_KEY, payload);
      dispatchBrowserEvent(SELF_LOCATION_UPDATED_EVENT, payload);
      setStatus("");

      const now = Date.now();
      if (now - lastSentAtRef.current < LOCATION_UPDATE_MIN_INTERVAL_MS) {
        return;
      }

      lastSentAtRef.current = now;
      startChatConnection()
        .then((connection) => connection?.invoke?.("UpdateLocation", latitude, longitude))
        .catch(() => {});
    };

    const watchId = navigator.geolocation.watchPosition(
      publishLocation,
      () => {
        setStatus("геолокация выключена в браузере");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 12000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [preference.enabled, user, userId]);

  return useMemo(() => ({
    enabled: preference.enabled,
    visibility: preference.visibility,
    retentionHours: preference.retentionHours,
    status,
    isLoading,
    isSaving,
    refresh,
    setEnabled: updatePreference,
    clearLocation,
  }), [clearLocation, isLoading, isSaving, preference, refresh, status, updatePreference]);
}

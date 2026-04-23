import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = {
  latitude: 55.751244,
  longitude: 37.618423,
  accuracy: null,
};

const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const DEFAULT_ZOOM = 15;
const DEGREE_SYMBOL = "\u00B0";

function clampLatitude(value) {
  return Math.max(-85.05112878, Math.min(85.05112878, Number(value) || 0));
}

function normalizeLongitude(value) {
  let longitude = Number(value) || 0;
  while (longitude > 180) {
    longitude -= 360;
  }
  while (longitude < -180) {
    longitude += 360;
  }
  return longitude;
}

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Number(value) || DEFAULT_ZOOM)));
}

function formatCoordinate(value) {
  return Number(value || 0).toFixed(6);
}

export default function TextChatLocationPickerModal({
  open,
  currentLocation,
  locationError = "",
  isLocating = false,
  onClose,
  onLocateCurrent,
  onSubmit,
}) {
  const initialLocation = currentLocation || DEFAULT_CENTER;
  const [center, setCenter] = useState(initialLocation);
  const [marker, setMarker] = useState(initialLocation);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const mapElementRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const suppressMoveSyncRef = useRef(false);

  useEffect(() => {
    if (!open || !mapElementRef.current || mapInstanceRef.current) {
      return undefined;
    }

    const initialMapLocation = currentLocation || DEFAULT_CENTER;
    const map = L.map(mapElementRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });

    const syncSelectionFromMap = () => {
      if (suppressMoveSyncRef.current) {
        suppressMoveSyncRef.current = false;
        return;
      }

      const nextCenter = map.getCenter();
      const nextZoom = clampZoom(map.getZoom());
      const nextLocation = {
        latitude: clampLatitude(nextCenter.lat),
        longitude: normalizeLongitude(nextCenter.lng),
      };

      setCenter(nextLocation);
      setMarker(nextLocation);
      setZoom(nextZoom);
    };

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: ["a", "b", "c"],
      minZoom: MIN_ZOOM,
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    const handleMapClick = (event) => {
      const nextLocation = {
        latitude: clampLatitude(event.latlng.lat),
        longitude: normalizeLongitude(event.latlng.lng),
      };

      suppressMoveSyncRef.current = true;
      map.setView([nextLocation.latitude, nextLocation.longitude], map.getZoom(), {
        animate: false,
      });
      setCenter(nextLocation);
      setMarker(nextLocation);
      setZoom(clampZoom(map.getZoom()));
    };

    map.on("moveend", syncSelectionFromMap);
    map.on("zoomend", syncSelectionFromMap);
    map.on("click", handleMapClick);
    mapInstanceRef.current = map;
    map.setView([initialMapLocation.latitude, initialMapLocation.longitude], DEFAULT_ZOOM, {
      animate: false,
    });
    map.whenReady(syncSelectionFromMap);

    return () => {
      map.off("moveend", syncSelectionFromMap);
      map.off("zoomend", syncSelectionFromMap);
      map.off("click", handleMapClick);
      map.remove();
      mapInstanceRef.current = null;
      suppressMoveSyncRef.current = false;
    };
  }, [open, currentLocation]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const map = mapInstanceRef.current;
    if (!map) {
      return undefined;
    }

    const mapCenter = map.getCenter();
    const mapZoom = clampZoom(map.getZoom());
    const latitudeChanged = Math.abs(mapCenter.lat - center.latitude) > 0.000001;
    const longitudeChanged = Math.abs(mapCenter.lng - center.longitude) > 0.000001;
    const zoomChanged = mapZoom !== zoom;

    if (!latitudeChanged && !longitudeChanged && !zoomChanged) {
      return undefined;
    }

    suppressMoveSyncRef.current = true;
    map.setView([center.latitude, center.longitude], zoom, {
      animate: false,
    });

    return undefined;
  }, [open, center, zoom]);

  useEffect(() => {
    if (!open || !currentLocation) {
      return undefined;
    }

    const map = mapInstanceRef.current;
    if (!map) {
      return undefined;
    }

    map.setView([currentLocation.latitude, currentLocation.longitude], map.getZoom(), {
      animate: false,
    });

    return undefined;
  }, [open, currentLocation]);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    const resetLocation = currentLocation || DEFAULT_CENTER;
    setCenter(resetLocation);
    setMarker(resetLocation);
    setZoom(DEFAULT_ZOOM);
    onClose?.();
  };

  const handleBackdropPointerDown = (event) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  const handleZoomChange = (delta) => {
    setZoom((currentZoom) => clampZoom(currentZoom + delta));
  };

  const handleConfirm = async () => {
    const submitResult = await onSubmit?.({
      latitude: marker.latitude,
      longitude: marker.longitude,
      zoom,
    });

    if (submitResult) {
      handleClose();
    }
  };

  return (
    <div className="location-picker-backdrop" role="presentation" onMouseDown={handleBackdropPointerDown}>
      <div className="location-picker-modal" role="dialog" aria-modal="true" aria-label="Выбор локации">
        <div className="location-picker-modal__header">
          <div className="location-picker-modal__copy">
            <h3>Отправить локацию</h3>
            <p>Нажмите по карте, чтобы точно отметить точку.</p>
          </div>
          <button type="button" className="location-picker-modal__close" onClick={handleClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="location-picker-modal__toolbar">
          <button
            type="button"
            className="location-picker-modal__toolbar-button"
            onClick={() => void onLocateCurrent?.()}
            disabled={isLocating}
          >
            {isLocating ? "Определяем..." : "Моё местоположение"}
          </button>

          <div className="location-picker-modal__zoom">
            <button
              type="button"
              className="location-picker-modal__icon-button"
              onClick={() => handleZoomChange(-1)}
              aria-label="Уменьшить карту"
            >
              −
            </button>
            <span className="location-picker-modal__zoom-value">Z{zoom}</span>
            <button
              type="button"
              className="location-picker-modal__icon-button"
              onClick={() => handleZoomChange(1)}
              aria-label="Увеличить карту"
            >
              +
            </button>
          </div>
        </div>

        <div className="location-picker-map">
          <div ref={mapElementRef} className="location-picker-map__viewport" aria-label="Карта для выбора точки" />
          <span className="location-picker-map__marker" aria-hidden="true" />
        </div>

        {locationError ? (
          <div className="location-picker-modal__notice" role="status">
            {locationError}
          </div>
        ) : null}

        <div className="location-picker-modal__footer">
          <div className="location-picker-modal__meta">
            <div className="location-picker-modal__meta-item">
              <span>Широта</span>
              <strong>{formatCoordinate(marker.latitude)}{DEGREE_SYMBOL}</strong>
            </div>
            <div className="location-picker-modal__meta-item">
              <span>Долгота</span>
              <strong>{formatCoordinate(marker.longitude)}{DEGREE_SYMBOL}</strong>
            </div>
          </div>

          <div className="location-picker-modal__actions">
            <button type="button" className="location-picker-modal__button location-picker-modal__button--ghost" onClick={handleClose}>
              Отмена
            </button>
            <button type="button" className="location-picker-modal__button" onClick={() => void handleConfirm()}>
              Отправить точку
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

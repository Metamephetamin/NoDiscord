import { useMemo, useState } from "react";

const DEFAULT_CENTER = {
  latitude: 55.751244,
  longitude: 37.618423,
  accuracy: null,
};

const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const DEFAULT_ZOOM = 15;
const MAP_IMAGE_WIDTH = 960;
const MAP_IMAGE_HEIGHT = 540;
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

function projectLatLng(latitude, longitude, zoom) {
  const scale = 256 * (2 ** zoom);
  const normalizedLatitude = clampLatitude(latitude);
  const normalizedLongitude = normalizeLongitude(longitude);
  const sinLatitude = Math.sin((normalizedLatitude * Math.PI) / 180);

  return {
    x: ((normalizedLongitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

function unprojectLatLng(x, y, zoom) {
  const scale = 256 * (2 ** zoom);
  const normalizedX = ((x % scale) + scale) % scale;
  const normalizedY = Math.max(0, Math.min(scale, y));
  const longitude = (normalizedX / scale) * 360 - 180;
  const mercator = Math.PI - ((2 * Math.PI * normalizedY) / scale);
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercator) - Math.exp(-mercator)));

  return {
    latitude: clampLatitude(latitude),
    longitude: normalizeLongitude(longitude),
  };
}

function formatCoordinate(value) {
  return Number(value || 0).toFixed(6);
}

function buildStaticMapUrl(center, marker, zoom) {
  const centerLatitude = formatCoordinate(center?.latitude);
  const centerLongitude = formatCoordinate(center?.longitude);
  const markerLatitude = formatCoordinate(marker?.latitude ?? center?.latitude);
  const markerLongitude = formatCoordinate(marker?.longitude ?? center?.longitude);

  return `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLatitude},${centerLongitude}&zoom=${zoom}&size=${MAP_IMAGE_WIDTH}x${MAP_IMAGE_HEIGHT}&maptype=mapnik&markers=${markerLatitude},${markerLongitude},red-pushpin`;
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

  const mapImageUrl = useMemo(
    () => buildStaticMapUrl(center, marker, zoom),
    [center, marker, zoom]
  );

  if (!open) {
    return null;
  }

  const handleBackdropPointerDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  const updateCenterByPixelOffset = (deltaX, deltaY) => {
    const projectedCenter = projectLatLng(center.latitude, center.longitude, zoom);
    const nextCenter = unprojectLatLng(projectedCenter.x + deltaX, projectedCenter.y + deltaY, zoom);
    setCenter(nextCenter);
    setMarker(nextCenter);
  };

  const handleMapClick = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - bounds.left;
    const clickY = event.clientY - bounds.top;
    const projectedCenter = projectLatLng(center.latitude, center.longitude, zoom);
    const scaleX = MAP_IMAGE_WIDTH / Math.max(1, bounds.width);
    const scaleY = MAP_IMAGE_HEIGHT / Math.max(1, bounds.height);
    const nextPoint = unprojectLatLng(
      projectedCenter.x + ((clickX - bounds.width / 2) * scaleX),
      projectedCenter.y + ((clickY - bounds.height / 2) * scaleY),
      zoom
    );

    setMarker(nextPoint);
    setCenter(nextPoint);
  };

  const handleZoomChange = (delta) => {
    setZoom((current) => clampZoom(current + delta));
    setMarker(center);
  };

  const handleConfirm = async () => {
    const submitResult = await onSubmit?.({
      latitude: marker.latitude,
      longitude: marker.longitude,
      zoom,
    });

    if (submitResult) {
      onClose?.();
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
          <button type="button" className="location-picker-modal__close" onClick={onClose} aria-label="Закрыть">
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
            <button type="button" className="location-picker-modal__icon-button" onClick={() => handleZoomChange(-1)} aria-label="Уменьшить карту">−</button>
            <span className="location-picker-modal__zoom-value">z{zoom}</span>
            <button type="button" className="location-picker-modal__icon-button" onClick={() => handleZoomChange(1)} aria-label="Увеличить карту">+</button>
          </div>
        </div>

        <div className="location-picker-map">
          <button
            type="button"
            className="location-picker-map__viewport"
            onClick={handleMapClick}
            aria-label="Карта для выбора точки"
          >
            <img src={mapImageUrl} alt="" className="location-picker-map__image" draggable="false" />
            <span className="location-picker-map__marker" aria-hidden="true" />
          </button>

          <div className="location-picker-map__nav">
            <button type="button" className="location-picker-map__nav-button" onClick={() => updateCenterByPixelOffset(0, -96)} aria-label="Сдвинуть вверх">↑</button>
            <div className="location-picker-map__nav-row">
              <button type="button" className="location-picker-map__nav-button" onClick={() => updateCenterByPixelOffset(-96, 0)} aria-label="Сдвинуть влево">←</button>
              <button type="button" className="location-picker-map__nav-button" onClick={() => updateCenterByPixelOffset(96, 0)} aria-label="Сдвинуть вправо">→</button>
            </div>
            <button type="button" className="location-picker-map__nav-button" onClick={() => updateCenterByPixelOffset(0, 96)} aria-label="Сдвинуть вниз">↓</button>
          </div>
        </div>

        {locationError ? (
          <div className="location-picker-modal__notice" role="status">
            {locationError}
          </div>
        ) : null}

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
          <button type="button" className="location-picker-modal__button location-picker-modal__button--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="location-picker-modal__button" onClick={() => void handleConfirm()}>
            Отправить точку
          </button>
        </div>
      </div>
    </div>
  );
}

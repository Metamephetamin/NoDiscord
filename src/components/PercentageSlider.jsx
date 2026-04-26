import { useCallback, useEffect, useMemo, useState } from "react";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const SLIDER_THUMB_SIZE_PX = 20;
const SLIDER_THUMB_RADIUS_PX = SLIDER_THUMB_SIZE_PX / 2;

export default function PercentageSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled = false,
  className = "",
  inputClassName = "",
  ariaLabel = "",
  formatValue,
}) {
  const numericMin = Number(min);
  const numericMax = Number(max);
  const numericValue = Number(value);
  const normalizedMin = Number.isFinite(numericMin) ? numericMin : 0;
  const normalizedMax = Number.isFinite(numericMax) ? numericMax : 100;
  const normalizedValue = Number.isFinite(numericValue)
    ? clamp(numericValue, normalizedMin, normalizedMax)
    : normalizedMin;
  const range = normalizedMax - normalizedMin;
  const positionPercent = range > 0
    ? ((normalizedValue - normalizedMin) / range) * 100
    : 0;
  const thumbCenterOffsetPx = SLIDER_THUMB_RADIUS_PX - (positionPercent / 100) * SLIDER_THUMB_SIZE_PX;
  const tooltipPosition = `calc(${positionPercent}% + ${thumbCenterOffsetPx}px)`;
  const progressPosition = `${positionPercent}%`;

  const [isDragging, setIsDragging] = useState(false);

  const stopDragging = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging || typeof window === "undefined") {
      return undefined;
    }

    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [isDragging, stopDragging]);

  const valueLabel = useMemo(() => {
    if (typeof formatValue === "function") {
      return formatValue(normalizedValue);
    }

    return `${Math.round(normalizedValue)}%`;
  }, [formatValue, normalizedValue]);

  const isTooltipVisible = !disabled && isDragging;
  const wrapperClassName = [
    "slider-with-tooltip",
    isTooltipVisible ? "slider-with-tooltip--active" : "",
    className,
  ].filter(Boolean).join(" ");
  const resolvedInputClassName = inputClassName ? `slider-with-tooltip__input ${inputClassName}` : "slider-with-tooltip__input";

  return (
    <div
      className={wrapperClassName}
      style={{
        "--slider-tooltip-position": tooltipPosition,
        "--slider-progress-position": progressPosition,
      }}
    >
      <span className="slider-with-tooltip__bubble" aria-hidden="true">{valueLabel}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={resolvedInputClassName}
        aria-label={ariaLabel || valueLabel}
        aria-valuetext={valueLabel}
        onBlur={stopDragging}
        onPointerDown={(event) => {
          if (disabled) {
            return;
          }
          if (event.button !== undefined && event.button !== 0) {
            return;
          }
          setIsDragging(true);
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      />
    </div>
  );
}

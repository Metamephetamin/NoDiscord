import { useCallback, useEffect, useRef } from "react";

const DEFAULT_DELAY_MS = 520;
const DEFAULT_MOVE_TOLERANCE_PX = 12;

function buildSyntheticContextEvent(sourceEvent, origin) {
  return {
    clientX: Number(origin?.x ?? sourceEvent?.clientX ?? 0),
    clientY: Number(origin?.y ?? sourceEvent?.clientY ?? 0),
    target: sourceEvent?.target || null,
    currentTarget: sourceEvent?.currentTarget || null,
    pointerType: sourceEvent?.pointerType || "touch",
    preventDefault: () => sourceEvent?.preventDefault?.(),
    stopPropagation: () => sourceEvent?.stopPropagation?.(),
  };
}

export default function useMobileLongPress({
  delayMs = DEFAULT_DELAY_MS,
  moveTolerancePx = DEFAULT_MOVE_TOLERANCE_PX,
} = {}) {
  const timeoutRef = useRef(null);
  const pointerStateRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const clearLongPress = useCallback((notifyCancel = false) => {
    const currentState = pointerStateRef.current;

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (notifyCancel && currentState?.onCancel) {
      currentState.onCancel(currentState.payload);
    }

    pointerStateRef.current = null;
  }, []);

  useEffect(() => () => {
    clearLongPress();
  }, [clearLongPress]);

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressNextClickRef.current) {
      return false;
    }

    suppressNextClickRef.current = false;
    return true;
  }, []);

  const bindLongPress = useCallback((payload, onLongPress, options = {}) => ({
    onPointerDown: (event) => {
      if (typeof onLongPress !== "function" || event.button > 0 || event.pointerType === "mouse") {
        return;
      }

      clearLongPress(true);
      longPressTriggeredRef.current = false;
      pointerStateRef.current = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0),
        payload,
        onCancel: typeof options.onCancel === "function" ? options.onCancel : null,
      };
      options.onStart?.(payload);

      timeoutRef.current = window.setTimeout(() => {
        const origin = pointerStateRef.current;
        longPressTriggeredRef.current = true;
        suppressNextClickRef.current = true;
        timeoutRef.current = null;
        origin?.onCancel?.(origin?.payload);

        onLongPress(buildSyntheticContextEvent(event, origin), origin?.payload);
        options.onTrigger?.(origin?.payload);

        if (typeof navigator?.vibrate === "function") {
          navigator.vibrate(14);
        }
      }, delayMs);
    },
    onPointerMove: (event) => {
      if (!pointerStateRef.current || longPressTriggeredRef.current) {
        return;
      }

      const deltaX = Math.abs(Number(event.clientX || 0) - pointerStateRef.current.x);
      const deltaY = Math.abs(Number(event.clientY || 0) - pointerStateRef.current.y);
      if (deltaX > moveTolerancePx || deltaY > moveTolerancePx) {
        clearLongPress(true);
      }
    },
    onPointerUp: (event) => {
      const hasTriggered = longPressTriggeredRef.current;
      clearLongPress(!hasTriggered);
      longPressTriggeredRef.current = false;

      if (!hasTriggered) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    onPointerCancel: () => {
      clearLongPress(true);
      longPressTriggeredRef.current = false;
    },
    onPointerLeave: () => {
      clearLongPress(true);
      longPressTriggeredRef.current = false;
    },
  }), [clearLongPress, delayMs, moveTolerancePx]);

  return {
    bindLongPress,
    clearLongPress,
    consumeSuppressedClick,
  };
}

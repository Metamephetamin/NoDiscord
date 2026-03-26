import { useState } from "react";

export default function ScreenShareButton({
  onStart,
  onStop,
  disabled = false,
  isActive = false,
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const startScreenShare = async () => {
    if (!onStart) {
      return;
    }

    setIsStarting(true);

    try {
      await onStart();
    } catch (error) {
      console.error("Ошибка запуска трансляции:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const stopScreenShare = async () => {
    if (!onStop) {
      return;
    }

    setIsStopping(true);

    try {
      await onStop();
    } catch (error) {
      console.error("Ошибка остановки трансляции:", error);
    } finally {
      setIsStopping(false);
    }
  };

  if (isActive) {
    return (
      <button
        type="button"
        className="stream-modal__action stream-modal__action--danger"
        onClick={stopScreenShare}
        disabled={isStopping}
      >
        {isStopping ? "Завершение..." : "Завершить трансляцию"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="stream-modal__action"
      onClick={startScreenShare}
      disabled={disabled || isStarting}
    >
      {isStarting ? "Запуск..." : "Начать трансляцию"}
    </button>
  );
}

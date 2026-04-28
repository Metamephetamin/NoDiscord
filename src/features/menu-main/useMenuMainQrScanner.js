import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../config/runtime";
import { authFetch, getApiErrorMessage, parseApiResponse } from "../../utils/auth";
import { parseQrLoginPayload } from "./menuMainControllerUtils";

export default function useMenuMainQrScanner({
  refreshDeviceSessions,
  showServerInviteFeedback,
}) {
  const [showQrScannerModal, setShowQrScannerModal] = useState(false);
  const [qrScannerDevices, setQrScannerDevices] = useState([]);
  const [selectedQrScannerDeviceId, setSelectedQrScannerDeviceId] = useState("");
  const [qrScannerError, setQrScannerError] = useState("");
  const [qrScannerStatus, setQrScannerStatus] = useState("");
  const [hasQrScannerPreview, setHasQrScannerPreview] = useState(false);
  const qrScannerPreviewRef = useRef(null);
  const qrScannerStreamRef = useRef(null);
  const qrScannerFrameRef = useRef(0);
  const qrScannerBusyRef = useRef(false);
  const qrScannerCooldownUntilRef = useRef(0);

  const stopQrScannerLoop = useCallback(() => {
    if (qrScannerFrameRef.current) {
      window.cancelAnimationFrame(qrScannerFrameRef.current);
      qrScannerFrameRef.current = 0;
    }
    qrScannerBusyRef.current = false;
  }, []);

  const stopQrScannerPreview = useCallback(() => {
    stopQrScannerLoop();
    qrScannerStreamRef.current?.getTracks?.().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore qr scanner shutdown failures
      }
    });
    qrScannerStreamRef.current = null;

    if (qrScannerPreviewRef.current) {
      qrScannerPreviewRef.current.srcObject = null;
    }

    setHasQrScannerPreview(false);
  }, [stopQrScannerLoop]);

  const loadQrScannerDevices = useCallback(async (preferredDeviceId = "") => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setQrScannerDevices([]);
      return [];
    }

    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        id: device.deviceId || `qr-camera-${index + 1}`,
        label: String(device.label || "").trim() || `Камера ${index + 1}`,
      }));

    setQrScannerDevices(devices);

    const nextDeviceId =
      devices.find((device) => device.id === preferredDeviceId)?.id ||
      devices.find((device) => device.id === selectedQrScannerDeviceId)?.id ||
      devices[0]?.id ||
      "";

    if (nextDeviceId && nextDeviceId !== selectedQrScannerDeviceId) {
      setSelectedQrScannerDeviceId(nextDeviceId);
    }

    return devices;
  }, [selectedQrScannerDeviceId]);

  const closeQrScannerModal = useCallback(() => {
    setShowQrScannerModal(false);
    setQrScannerError("");
    setQrScannerStatus("");
    stopQrScannerPreview();
  }, [stopQrScannerPreview]);

  const confirmQrScannerPayload = useCallback(async (payload) => {
    setQrScannerError("");
    setQrScannerStatus("Подтверждаем вход...");
    qrScannerCooldownUntilRef.current = Number.POSITIVE_INFINITY;
    stopQrScannerLoop();

    try {
      const previewQuery = new URLSearchParams({ scannerToken: payload.scannerToken });
      const previewResponse = await authFetch(
        `${API_BASE_URL}/auth/qr-login/session/${encodeURIComponent(payload.sessionId)}/preview?${previewQuery}`,
        { method: "GET" }
      );
      const previewData = await parseApiResponse(previewResponse);

      if (!previewResponse.ok) {
        throw new Error(getApiErrorMessage(previewResponse, previewData, "QR-код устарел или уже использован."));
      }

      const approveResponse = await authFetch(`${API_BASE_URL}/auth/qr-login/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const approveData = await parseApiResponse(approveResponse);

      if (!approveResponse.ok) {
        throw new Error(getApiErrorMessage(approveResponse, approveData, "Не удалось подключить устройство."));
      }

      setQrScannerStatus("Устройство подключено.");
      await refreshDeviceSessions();
      showServerInviteFeedback("Устройство подключено.");
      window.setTimeout(() => {
        closeQrScannerModal();
      }, 700);
    } catch (error) {
      qrScannerCooldownUntilRef.current = performance.now() + 1800;
      setQrScannerStatus("");
      setQrScannerError(error?.message || "Не удалось подключить устройство.");
    }
  }, [closeQrScannerModal, refreshDeviceSessions, showServerInviteFeedback, stopQrScannerLoop]);

  const startQrScannerLoop = useCallback(() => {
    stopQrScannerLoop();

    const BarcodeDetectorClass = typeof window !== "undefined" ? window.BarcodeDetector : undefined;
    if (typeof BarcodeDetectorClass !== "function") {
      setQrScannerStatus("");
      setQrScannerError("На этом устройстве браузер пока не умеет считывать QR-коды через камеру.");
      return;
    }

    const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
    const tick = async () => {
      if (!showQrScannerModal) {
        stopQrScannerLoop();
        return;
      }

      const video = qrScannerPreviewRef.current;
      if (!video || video.readyState < 2) {
        qrScannerFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (qrScannerBusyRef.current || performance.now() < qrScannerCooldownUntilRef.current) {
        qrScannerFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      qrScannerBusyRef.current = true;
      try {
        const results = await detector.detect(video);
        const rawValue = String(results?.[0]?.rawValue || "").trim();
        if (rawValue) {
          const payload = parseQrLoginPayload(rawValue);
          if (!payload) {
            qrScannerCooldownUntilRef.current = performance.now() + 1500;
            setQrScannerStatus("");
            setQrScannerError("Это не QR-код входа MAX.");
          } else {
            await confirmQrScannerPayload(payload);
          }
        }
      } catch (error) {
        console.error("Ошибка распознавания QR-кода:", error);
        setQrScannerStatus("");
        setQrScannerError("Не удалось распознать QR-код. Попробуйте ещё раз.");
        qrScannerCooldownUntilRef.current = performance.now() + 1500;
      } finally {
        qrScannerBusyRef.current = false;
      }

      qrScannerFrameRef.current = window.requestAnimationFrame(tick);
    };

    qrScannerFrameRef.current = window.requestAnimationFrame(tick);
  }, [confirmQrScannerPayload, showQrScannerModal, stopQrScannerLoop]);

  const startQrScannerPreview = useCallback(async (deviceId = selectedQrScannerDeviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setQrScannerError("Эта система не дала приложению доступ к камере.");
      return;
    }

    stopQrScannerPreview();
    setQrScannerError("");
    setQrScannerStatus("Наведите камеру на QR-код входа.");

    try {
      const preferredVideoConstraints = deviceId && !String(deviceId).startsWith("qr-camera-")
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: preferredVideoConstraints,
          audio: false,
        });
      } catch (captureError) {
        if (deviceId && !String(deviceId).startsWith("qr-camera-")) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } else {
          throw captureError;
        }
      }

      qrScannerStreamRef.current = stream;

      if (qrScannerPreviewRef.current) {
        qrScannerPreviewRef.current.srcObject = stream;
        qrScannerPreviewRef.current.muted = true;
        await qrScannerPreviewRef.current.play().catch(() => {});
      }

      setHasQrScannerPreview(true);

      const devices = await loadQrScannerDevices(deviceId);
      const activeTrack = stream.getVideoTracks?.()[0];
      const activeDeviceId = activeTrack?.getSettings?.().deviceId || deviceId || devices[0]?.id || "";

      if (activeDeviceId && activeDeviceId !== selectedQrScannerDeviceId) {
        setSelectedQrScannerDeviceId(activeDeviceId);
      }

      startQrScannerLoop();
    } catch (error) {
      await loadQrScannerDevices(deviceId).catch(() => {});
      setQrScannerStatus("");
      setQrScannerError("Не удалось открыть камеру для сканирования QR-кода.");
      console.error("Ошибка запуска QR-сканера:", error);
    }
  }, [
    loadQrScannerDevices,
    selectedQrScannerDeviceId,
    startQrScannerLoop,
    stopQrScannerPreview,
  ]);

  const openQrDeviceScanner = useCallback(() => {
    setQrScannerError("");
    setQrScannerStatus("");
    qrScannerCooldownUntilRef.current = 0;
    setShowQrScannerModal(true);
    window.requestAnimationFrame(() => {
      loadQrScannerDevices(selectedQrScannerDeviceId)
        .then((devices) => startQrScannerPreview(
          devices.find((device) => device.id === selectedQrScannerDeviceId)?.id || devices[0]?.id || selectedQrScannerDeviceId
        ))
        .catch((error) => {
          console.error("Ошибка подготовки QR-сканера:", error);
          setQrScannerError("Не удалось подготовить камеру для сканирования QR-кода.");
        });
    });
  }, [loadQrScannerDevices, selectedQrScannerDeviceId, startQrScannerPreview]);

  const handleQrScannerDeviceChange = useCallback((deviceId) => {
    setSelectedQrScannerDeviceId(deviceId);

    if (hasQrScannerPreview) {
      startQrScannerPreview(deviceId).catch((error) => {
        console.error("Ошибка обновления QR-сканера:", error);
      });
    }
  }, [hasQrScannerPreview, startQrScannerPreview]);

  useEffect(() => {
    if (!showQrScannerModal) {
      stopQrScannerPreview();
      return;
    }

    if (!hasQrScannerPreview) {
      return;
    }

    startQrScannerLoop();
  }, [hasQrScannerPreview, showQrScannerModal, startQrScannerLoop, stopQrScannerPreview]);

  useEffect(() => () => {
    stopQrScannerPreview();
  }, [stopQrScannerPreview]);

  return {
    showQrScannerModal,
    qrScannerDevices,
    selectedQrScannerDeviceId,
    qrScannerPreviewRef,
    hasQrScannerPreview,
    qrScannerError,
    qrScannerStatus,
    openQrDeviceScanner,
    closeQrScannerModal,
    handleQrScannerDeviceChange,
    startQrScannerPreview,
  };
}

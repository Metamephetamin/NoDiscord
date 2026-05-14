const STATUS_LABELS = {
  pending: "\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435",
  preparing: "\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430",
  uploading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430",
  processing: "\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430",
  failed: "\u041e\u0448\u0438\u0431\u043a\u0430",
  canceled: "\u041e\u0442\u043c\u0435\u043d\u0435\u043d\u043e",
  sent: "\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e",
};

const FAILURE_STATUSES = new Set(["failed", "canceled"]);
const ACTIVE_STATUSES = new Set(["pending", "preparing", "uploading", "processing"]);

const RETRY_LABEL = "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0443";
const CANCEL_LABEL = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0443";

function formatUploadFileSize(size) {
  if (!size) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = Math.max(0, Number(size) || 0);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getTelegramUploadOverlayState(attachmentItem = {}) {
  const status = String(attachmentItem?.localEchoStatus || "uploading").trim() || "uploading";
  const progress = Math.max(0, Math.min(100, Math.round(Number(attachmentItem?.localEchoProgress) || 0)));
  const totalBytes = Math.max(0, Number(attachmentItem?.localEchoTotalBytes || attachmentItem?.attachmentSize) || 0);
  const uploadedBytes = Math.max(
    0,
    Math.min(
      totalBytes || Number.MAX_SAFE_INTEGER,
      Number(attachmentItem?.localEchoUploadedBytes) || (
        totalBytes > 0 ? Math.round((totalBytes * progress) / 100) : 0
      )
    )
  );

  if (status === "sent") {
    return {
      visible: false,
      failed: false,
      active: false,
      status,
      progress,
      label: "",
      progressLabel: "",
      primaryAction: "",
      ariaLabel: "",
    };
  }

  const failed = FAILURE_STATUSES.has(status);
  const active = ACTIVE_STATUSES.has(status) || !failed;
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.uploading;
  const errorLabel = String(attachmentItem?.localEchoError || "").trim();
  const label = failed
    ? (errorLabel || statusLabel)
    : `${statusLabel} ${progress}%`;
  const progressLabel = failed
    ? (errorLabel || statusLabel)
    : totalBytes > 0
      ? `${formatUploadFileSize(uploadedBytes)} / ${formatUploadFileSize(totalBytes)}`
      : `${progress}%`;

  return {
    visible: true,
    failed,
    active,
    status,
    progress,
    label,
    progressLabel,
    primaryAction: failed ? "retry" : "cancel",
    ariaLabel: failed ? RETRY_LABEL : CANCEL_LABEL,
  };
}

export function getDocumentUploadCardState(attachmentItem = {}) {
  const status = String(attachmentItem?.localEchoStatus || "uploading").trim() || "uploading";
  const progress = Math.max(0, Math.min(100, Math.round(Number(attachmentItem?.localEchoProgress) || 0)));

  if (status === "sent") {
    return {
      visible: false,
      failed: false,
      active: false,
      showSpinner: false,
      status,
      progress,
      statusLabel: "",
      progressLabel: "",
      primaryAction: "",
    };
  }

  const failed = FAILURE_STATUSES.has(status);
  const active = ACTIVE_STATUSES.has(status) || !failed;
  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.uploading;
  const totalBytes = Math.max(0, Number(attachmentItem?.localEchoTotalBytes || attachmentItem?.attachmentSize) || 0);
  const uploadedBytes = Math.max(
    0,
    Math.min(
      totalBytes || Number.MAX_SAFE_INTEGER,
      Number(attachmentItem?.localEchoUploadedBytes) || (
        totalBytes > 0 ? Math.round((totalBytes * progress) / 100) : 0
      )
    )
  );
  const errorLabel = String(attachmentItem?.localEchoError || "").trim();
  const progressLabel = failed
    ? (errorLabel || statusLabel)
    : totalBytes > 0
      ? `${formatUploadFileSize(uploadedBytes)} / ${formatUploadFileSize(totalBytes)}`
      : `${progress}%`;

  return {
    visible: true,
    failed,
    active,
    showSpinner: active && !failed,
    status,
    progress,
    statusLabel,
    progressLabel,
    primaryAction: failed ? "retry" : "cancel",
  };
}

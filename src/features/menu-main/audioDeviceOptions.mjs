const DEVICE_ALIAS_PREFIX_PATTERN = /^(default|communications|default communications|по умолчанию|устройство связи|связь)\s*[-:]\s*/i;
const DEVICE_PARENTHESES_PATTERN = /\s*\([^)]*\)\s*$/g;
const DEVICE_WHITESPACE_PATTERN = /\s+/g;
const MAX_DEVICE_LABEL_LENGTH = 42;
const ALIAS_DEVICE_IDS = new Set(["default", "communications"]);

export function compactDeviceLabel(value, fallback) {
  const rawLabel = String(value || "").trim();
  const compactLabel = rawLabel
    .replace(DEVICE_ALIAS_PREFIX_PATTERN, "")
    .replace(DEVICE_PARENTHESES_PATTERN, "")
    .replace(DEVICE_WHITESPACE_PATTERN, " ")
    .trim();
  const label = compactLabel || fallback;

  return label.length > MAX_DEVICE_LABEL_LENGTH
    ? `${label.slice(0, MAX_DEVICE_LABEL_LENGTH - 1).trim()}…`
    : label;
}

function isAliasDevice(device) {
  const id = String(device?.id || "").trim().toLowerCase();
  const label = String(device?.label || "").trim();
  return ALIAS_DEVICE_IDS.has(id) || DEVICE_ALIAS_PREFIX_PATTERN.test(label);
}

function getDeviceDedupeKey(device, fallback) {
  const groupId = String(device?.groupId || "").trim();
  if (groupId) {
    return `group:${groupId}`;
  }

  return `label:${compactDeviceLabel(device?.label, fallback).toLowerCase().replace(DEVICE_WHITESPACE_PATTERN, " ")}`;
}

function choosePreferredDevice(previousDevice, nextDevice, selectedDeviceId) {
  const selectedId = String(selectedDeviceId || "");
  const previousId = String(previousDevice?.id || "");
  const nextId = String(nextDevice?.id || "");

  if (nextId && nextId === selectedId) {
    return nextDevice;
  }

  if (previousId && previousId === selectedId) {
    return previousDevice;
  }

  if (isAliasDevice(previousDevice) && !isAliasDevice(nextDevice)) {
    return nextDevice;
  }

  return previousDevice;
}

export function normalizeAudioDeviceOptions({ devices, selectedDeviceId, fallbackPrefix }) {
  const selectedId = String(selectedDeviceId || "");
  const normalizedDevices = (Array.isArray(devices) ? devices : []).map((device, index) => ({
    ...device,
    id: String(device?.id || "").trim(),
    label: compactDeviceLabel(device?.label, `${fallbackPrefix} ${index + 1}`),
    groupId: String(device?.groupId || "").trim(),
  }));
  const byDevice = new Map();

  normalizedDevices.forEach((device, index) => {
    const key = getDeviceDedupeKey(device, `${fallbackPrefix} ${index + 1}`);
    const previousDevice = byDevice.get(key);
    byDevice.set(
      key,
      previousDevice
        ? choosePreferredDevice(previousDevice, device, selectedId)
        : device
    );
  });

  const dedupedDevices = Array.from(byDevice.values());
  const nextSelectedDeviceId = dedupedDevices.some((device) => device.id === selectedId)
    ? selectedId
    : dedupedDevices[0]?.id || "";

  return {
    devices: dedupedDevices,
    selectedDeviceId: nextSelectedDeviceId,
  };
}

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAudioDeviceOptions } from "../audioDeviceOptions.mjs";

test("normalizeAudioDeviceOptions collapses default and communications microphone aliases", () => {
  const result = normalizeAudioDeviceOptions({
    devices: [
      { id: "default", label: "Default - Microphone Array (Realtek Audio)", groupId: "built-in-mic" },
      { id: "communications", label: "Communications - Microphone Array (Realtek Audio)", groupId: "built-in-mic" },
      { id: "physical-mic", label: "Microphone Array (Realtek Audio)", groupId: "built-in-mic" },
    ],
    selectedDeviceId: "",
    fallbackPrefix: "Microphone",
  });

  assert.deepEqual(result.devices, [
    { id: "physical-mic", label: "Microphone Array", groupId: "built-in-mic" },
  ]);
  assert.equal(result.selectedDeviceId, "physical-mic");
});

test("normalizeAudioDeviceOptions preserves selected alias while removing duplicate options", () => {
  const result = normalizeAudioDeviceOptions({
    devices: [
      { id: "default", label: "Default - Microphone Array (Realtek Audio)", groupId: "built-in-mic" },
      { id: "communications", label: "Communications - Microphone Array (Realtek Audio)", groupId: "built-in-mic" },
      { id: "physical-mic", label: "Microphone Array (Realtek Audio)", groupId: "built-in-mic" },
    ],
    selectedDeviceId: "default",
    fallbackPrefix: "Microphone",
  });

  assert.deepEqual(result.devices, [
    { id: "default", label: "Microphone Array", groupId: "built-in-mic" },
  ]);
  assert.equal(result.selectedDeviceId, "default");
});

test("normalizeAudioDeviceOptions collapses localized default aliases by label", () => {
  const result = normalizeAudioDeviceOptions({
    devices: [
      { id: "default", label: "По умолчанию - Микрофон Realtek", groupId: "" },
      { id: "communications", label: "Устройство связи - Микрофон Realtek", groupId: "" },
      { id: "physical-mic", label: "Микрофон Realtek", groupId: "" },
    ],
    selectedDeviceId: "",
    fallbackPrefix: "Microphone",
  });

  assert.deepEqual(result.devices, [
    { id: "physical-mic", label: "Микрофон Realtek", groupId: "" },
  ]);
  assert.equal(result.selectedDeviceId, "physical-mic");
});

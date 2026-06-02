export const SOUNDBOARD_WAVEFORM_BAR_COUNT = 64;

const clampUnit = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function buildWaveformSamplesFromChannelData(channelData, barCount = SOUNDBOARD_WAVEFORM_BAR_COUNT) {
  const samples = Array.isArray(channelData) || ArrayBuffer.isView(channelData) ? channelData : [];
  const resolvedBarCount = Math.max(1, Math.round(Number(barCount) || SOUNDBOARD_WAVEFORM_BAR_COUNT));

  if (!samples.length) {
    return Array.from({ length: resolvedBarCount }, () => 0.24);
  }

  const samplesPerBar = Math.max(1, Math.floor(samples.length / resolvedBarCount));

  return Array.from({ length: resolvedBarCount }, (_, index) => {
    const startIndex = index * samplesPerBar;
    const endIndex = index === resolvedBarCount - 1
      ? samples.length
      : Math.min(samples.length, startIndex + samplesPerBar);
    let peak = 0;

    for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(Number(samples[sampleIndex]) || 0));
    }

    return Number(clampUnit(peak).toFixed(3));
  });
}

export function normalizeWaveformSamples(samples, barCount = SOUNDBOARD_WAVEFORM_BAR_COUNT) {
  const resolvedBarCount = Math.max(1, Math.round(Number(barCount) || SOUNDBOARD_WAVEFORM_BAR_COUNT));
  const normalizedSamples = (Array.isArray(samples) ? samples : [])
    .map(clampUnit)
    .filter((value) => Number.isFinite(value));

  if (!normalizedSamples.length) {
    return Array.from({ length: resolvedBarCount }, () => 0.24);
  }

  if (normalizedSamples.length === resolvedBarCount) {
    return normalizedSamples;
  }

  return Array.from({ length: resolvedBarCount }, (_, index) => {
    const sourceIndex = Math.min(
      normalizedSamples.length - 1,
      Math.round((index / Math.max(1, resolvedBarCount - 1)) * (normalizedSamples.length - 1)),
    );

    return normalizedSamples[sourceIndex];
  });
}

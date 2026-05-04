function normalizeDraftValue(value) {
  return String(value || "").trim();
}

export function shouldApplySpeechDraftUpdate({
  requestId,
  currentRequestId,
  currentValue,
  rawDraftValue,
  displayedDraftValue,
} = {}) {
  if (Number(requestId) !== Number(currentRequestId)) {
    return false;
  }

  const normalizedCurrentValue = normalizeDraftValue(currentValue);
  if (!normalizedCurrentValue) {
    return true;
  }

  return normalizedCurrentValue === normalizeDraftValue(rawDraftValue)
    || normalizedCurrentValue === normalizeDraftValue(displayedDraftValue);
}

import assert from "node:assert/strict";
import test from "node:test";

import { shouldApplySpeechDraftUpdate } from "../speechDraftLifecycle.mjs";

test("shouldApplySpeechDraftUpdate ignores stale punctuation after speech draft is consumed", () => {
  const shouldApply = shouldApplySpeechDraftUpdate({
    requestId: 3,
    currentRequestId: 4,
    currentValue: "",
    rawDraftValue: "привет",
    displayedDraftValue: "привет",
  });

  assert.equal(shouldApply, false);
});

test("shouldApplySpeechDraftUpdate allows active punctuation while composer still contains speech draft", () => {
  const shouldApply = shouldApplySpeechDraftUpdate({
    requestId: 5,
    currentRequestId: 5,
    currentValue: "привет",
    rawDraftValue: "Привет",
    displayedDraftValue: "привет",
  });

  assert.equal(shouldApply, true);
});

test("shouldApplySpeechDraftUpdate ignores punctuation after user typed a different value", () => {
  const shouldApply = shouldApplySpeechDraftUpdate({
    requestId: 7,
    currentRequestId: 7,
    currentValue: "другой текст",
    rawDraftValue: "Привет",
    displayedDraftValue: "привет",
  });

  assert.equal(shouldApply, false);
});

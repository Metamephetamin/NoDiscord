import assert from "node:assert/strict";
import test from "node:test";

import { createPollMessagePayload, parsePollMessage } from "../../utils/pollMessages.js";

test("poll payload preserves anonymous voting setting", () => {
  const payload = createPollMessagePayload({
    question: "Куда идём?",
    options: [
      { id: "a", text: "Кафе" },
      { id: "b", text: "Парк" },
    ],
    settings: {
      anonymous: true,
      allowMultipleAnswers: true,
    },
  });

  const parsed = parsePollMessage(payload);

  assert.equal(parsed.settings.anonymous, true);
  assert.equal(parsed.settings.showWhoVoted, false);
  assert.equal(parsed.settings.allowMultipleAnswers, true);
});

test("legacy open poll setting remains open", () => {
  const payload = createPollMessagePayload({
    question: "Открыто?",
    options: [
      { id: "yes", text: "Да" },
      { id: "no", text: "Нет" },
    ],
    settings: {
      showWhoVoted: true,
    },
  });

  const parsed = parsePollMessage(payload);

  assert.equal(parsed.settings.anonymous, false);
  assert.equal(parsed.settings.showWhoVoted, true);
});

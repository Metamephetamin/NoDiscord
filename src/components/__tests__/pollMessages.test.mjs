import assert from "node:assert/strict";
import test from "node:test";

import { createPollMessagePayload, getPollDisplayOptions, parsePollMessage } from "../../utils/pollMessages.js";

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

test("open poll preserves voters by option", () => {
  const payload = createPollMessagePayload({
    question: "Куда идём?",
    options: [
      { id: "cafe", text: "Кафе" },
      { id: "park", text: "Парк" },
    ],
    votes: {
      cafe: 0,
      park: 1,
    },
    voters: {
      park: [
        { userId: "42", displayName: "lanaya", avatarUrl: "/avatars/u42.png" },
      ],
    },
    settings: {
      anonymous: false,
      showWhoVoted: true,
    },
  });

  const parsed = parsePollMessage(payload);

  assert.deepEqual(parsed.voters.park, [
    { userId: "42", displayName: "lanaya", avatarUrl: "/avatars/u42.png" },
  ]);
  assert.deepEqual(parsed.voters.cafe, []);
});

test("poll display options are deterministically shuffled per viewer", () => {
  const poll = parsePollMessage(createPollMessagePayload({
    question: "Что выбрать?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
    settings: {
      shuffleOptions: true,
    },
  }));

  const firstViewerOptions = getPollDisplayOptions(poll, { messageId: 42, currentUserId: 7 });
  const repeatedFirstViewerOptions = getPollDisplayOptions(poll, { messageId: 42, currentUserId: 7 });
  const secondViewerOptions = getPollDisplayOptions(poll, { messageId: 42, currentUserId: 8 });

  assert.deepEqual(
    firstViewerOptions.map((option) => option.id),
    repeatedFirstViewerOptions.map((option) => option.id)
  );
  assert.notDeepEqual(
    firstViewerOptions.map((option) => option.id),
    poll.options.map((option) => option.id)
  );
  assert.notDeepEqual(
    firstViewerOptions.map((option) => option.id),
    secondViewerOptions.map((option) => option.id)
  );
});

test("poll display options keep author order when shuffle is disabled", () => {
  const poll = parsePollMessage(createPollMessagePayload({
    question: "Что выбрать?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ],
  }));

  const options = getPollDisplayOptions(poll, { messageId: 42, currentUserId: 7 });

  assert.deepEqual(options.map((option) => option.id), ["a", "b", "c"]);
});

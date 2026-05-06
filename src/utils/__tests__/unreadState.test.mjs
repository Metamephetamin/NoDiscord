import assert from "node:assert/strict";
import test from "node:test";
import {
  clearUnreadCount,
  getTotalUnreadCount,
  getUnreadThreadCount,
  incrementUnreadCount,
  mergeUnreadCountsFromTargets,
  shouldNotifyForUnread,
  shouldTrackIncomingUnread,
} from "../unreadState.js";

test("unread increments for inactive channel", () => {
  const canTrack = shouldTrackIncomingUnread({
    channelId: "server:1::channel:general",
    activeChannelId: "server:1::channel:voice",
    authorUserId: "2",
    currentUserId: "1",
  });

  assert.equal(canTrack, true);
  assert.deepEqual(incrementUnreadCount({}, "server:1::channel:general"), {
    "server:1::channel:general": 1,
  });
});

test("unread clears on open", () => {
  const state = { "dm:1:2": 3 };

  assert.deepEqual(clearUnreadCount(state, "dm:1:2", { keepZero: true }), { "dm:1:2": 0 });
  assert.deepEqual(clearUnreadCount(state, "dm:1:2"), {});
});

test("mention count can stay separate from unread total", () => {
  const unreadState = {
    channelA: 2,
    channelB: 1,
  };
  const mentionState = {
    channelA: 1,
  };

  assert.equal(getTotalUnreadCount(unreadState), 3);
  assert.equal(getTotalUnreadCount(mentionState), 1);
});

test("muted channel suppresses notification but can keep unread", () => {
  const canTrack = shouldTrackIncomingUnread({
    channelId: "conversation:7",
    activeChannelId: "conversation:2",
    authorUserId: "9",
    currentUserId: "1",
  });
  const state = canTrack ? incrementUnreadCount({}, "conversation:7") : {};

  assert.deepEqual(state, { "conversation:7": 1 });
  assert.equal(shouldNotifyForUnread({ notificationsEnabled: true, muted: true, shouldTrackUnread: canTrack }), false);
});

test("server thread count ignores active channel and uses fallback counts", () => {
  const channels = [
    { id: "a", unreadCount: 5 },
    { id: "b", unreadCount: 2 },
    { id: "c", unreadCount: 0 },
  ];

  assert.equal(getUnreadThreadCount(channels, {
    state: { b: 4 },
    activeChannelId: "a",
    getChannelId: (channel) => channel.id,
  }), 1);
});

test("conversation backend unread counts merge without reopening cleared channels", () => {
  const previous = { active: 0, stale: 1 };
  const next = mergeUnreadCountsFromTargets(previous, [
    { channelId: "active", unreadCount: 3 },
    { channelId: "stale", unreadCount: 2 },
    { channelId: "new", unreadCount: 4 },
  ], {
    activeChannelId: "active",
    getChannelId: (item) => item.channelId,
  });

  assert.deepEqual(next, {
    active: 0,
    stale: 2,
    new: 4,
  });
});

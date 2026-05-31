import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getOrderedServerChannelItems,
  moveServerChannelAcrossLists,
  removeChannelCategoryWithChannels,
} from "../../features/menu-main/channelManagementUtils.js";
import { getMutedChannelKey, toggleMutedChannelKey } from "../../features/menu-main/mutedServerChannels.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

test("deleting a custom category removes its text and voice channels", () => {
  const server = {
    id: "server-1",
    channelCategories: [
      { id: "cat-a", name: "A" },
      { id: "cat-b", name: "B" },
    ],
    textChannels: [
      { id: "text-a", categoryId: "cat-a" },
      { id: "text-b", categoryId: "cat-b" },
      { id: "text-root", categoryId: "" },
    ],
    voiceChannels: [
      { id: "voice-a", categoryId: "cat-a" },
      { id: "voice-b", categoryId: "cat-b" },
      { id: "voice-root", categoryId: "" },
    ],
  };

  const result = removeChannelCategoryWithChannels(server, "cat-a");

  assert.deepEqual(result.removedTextChannelIds, new Set(["text-a"]));
  assert.deepEqual(result.removedVoiceChannelIds, new Set(["voice-a"]));
  assert.deepEqual(result.nextServer.channelCategories.map((category) => category.id), ["cat-b"]);
  assert.deepEqual(result.nextServer.textChannels.map((channel) => channel.id), ["text-b", "text-root"]);
  assert.deepEqual(result.nextServer.voiceChannels.map((channel) => channel.id), ["voice-b", "voice-root"]);
});

test("channel ordering mutations sync shared server snapshots", () => {
  const source = readRepoFile("src/features/menu-main/useMenuMainChannelActions.js");

  assert.match(source, /const reorderChannelCategories = [\s\S]*?syncSharedServer\(nextServer\);[\s\S]*?const moveServerChannel = /);
  assert.match(source, /moveServerChannelAcrossLists\(activeServer, \{[\s\S]*?targetType,[\s\S]*?targetChannelId,[\s\S]*?syncSharedServer\(nextServer\);/);
});

test("text and voice channels share one saved order inside a category", () => {
  const server = {
    textChannels: [
      { id: "rules", name: "rules", categoryId: "cat-a", order: 0 },
      { id: "chat", name: "chat", categoryId: "cat-a", order: 2 },
    ],
    voiceChannels: [
      { id: "voice", name: "voice", categoryId: "cat-a", order: 1 },
    ],
  };

  assert.deepEqual(
    getOrderedServerChannelItems(server.textChannels, server.voiceChannels, "cat-a").map((item) => `${item.type}:${item.channel.id}`),
    ["text:rules", "voice:voice", "text:chat"]
  );

  const nextServer = moveServerChannelAcrossLists(server, {
    type: "voice",
    channelId: "voice",
    targetType: "text",
    targetChannelId: "chat",
    targetCategoryId: "cat-a",
    placement: "after",
  });

  assert.deepEqual(
    getOrderedServerChannelItems(nextServer.textChannels, nextServer.voiceChannels, "cat-a").map((item) => `${item.type}:${item.channel.id}`),
    ["text:rules", "text:chat", "voice:voice"]
  );
  assert.deepEqual(nextServer.textChannels.map((channel) => [channel.id, channel.order]), [["rules", 0], ["chat", 1]]);
  assert.deepEqual(nextServer.voiceChannels.map((channel) => [channel.id, channel.order]), [["voice", 2]]);
});

test("server sidebar renders channels from one mixed order", () => {
  const source = readRepoFile("src/components/ServerWorkspace.jsx");

  assert.match(source, /getOrderedServerChannelItems\(textChannels, voiceChannels, categoryId\)/);
  assert.match(source, /targetType: type/);
  assert.doesNotMatch(source, /renderTextChannelListItems\(visibleTextChannels, category\.id\)[\s\S]*?renderVoiceChannels\(visibleVoiceChannels, category\.id\)/);
});

test("created channels do not reopen inline rename mode", () => {
  const source = readRepoFile("src/features/menu-main/useMenuMainChannelActions.js");
  const createServerChannelStart = source.indexOf("const createServerChannel =");
  const createForumPostStart = source.indexOf("const createForumPost =", createServerChannelStart);
  const createServerChannelSource = source.slice(createServerChannelStart, createForumPostStart);

  assert.match(createServerChannelSource, /setChannelRenameState\(null\);/);
  assert.doesNotMatch(createServerChannelSource, /setChannelRenameState\(\{\s*type:/);
});

test("muted channel keys are server scoped and toggle without duplicates", () => {
  const textKey = getMutedChannelKey("server-a", "text", "general");
  const voiceKey = getMutedChannelKey("server-a", "voice", "general");
  const otherServerKey = getMutedChannelKey("server-b", "text", "general");

  assert.notEqual(textKey, voiceKey);
  assert.notEqual(textKey, otherServerKey);

  const mutedOnce = toggleMutedChannelKey({}, textKey);
  const mutedTwice = toggleMutedChannelKey(mutedOnce, textKey);

  assert.equal(mutedOnce[textKey], true);
  assert.equal(Object.keys(mutedOnce).length, 1);
  assert.deepEqual(mutedTwice, {});
});

test("server channel mute is available without channel management permissions", () => {
  const source = readRepoFile("src/components/ServerWorkspace.jsx");
  const openChannelContextMenuStart = source.indexOf("const openChannelContextMenu =");
  const deleteCategoryContextMenuStart = source.indexOf("const deleteCategoryFromContextMenu =", openChannelContextMenuStart);
  const openChannelContextMenuSource = source.slice(openChannelContextMenuStart, deleteCategoryContextMenuStart);

  assert.doesNotMatch(openChannelContextMenuSource, /canManageChannels/);
  assert.match(source, /onToggleServerChannelMute\?\.\(\{/);
  assert.match(source, /categoryContextMenu\.muted \? "Включить уведомления" : "Заглушить канал"/);
});

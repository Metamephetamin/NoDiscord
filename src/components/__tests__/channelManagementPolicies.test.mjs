import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { removeChannelCategoryWithChannels } from "../../features/menu-main/channelManagementUtils.js";

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
  assert.match(source, /voiceChannels: moveChannelInList[\s\S]*?syncSharedServer\(nextServer\);[\s\S]*?return;/);
  assert.match(source, /textChannels: moveChannelInList[\s\S]*?syncSharedServer\(nextServer\);[\s\S]*?};/);
});

test("created channels do not reopen inline rename mode", () => {
  const source = readRepoFile("src/features/menu-main/useMenuMainChannelActions.js");
  const createServerChannelStart = source.indexOf("const createServerChannel =");
  const createForumPostStart = source.indexOf("const createForumPost =", createServerChannelStart);
  const createServerChannelSource = source.slice(createServerChannelStart, createForumPostStart);

  assert.match(createServerChannelSource, /setChannelRenameState\(null\);/);
  assert.doesNotMatch(createServerChannelSource, /setChannelRenameState\(\{\s*type:/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

test("friend request rows open profile on click and user menu on right click", () => {
  const source = readRepoFile("src/components/FriendsWorkspace.jsx");

  assert.match(source, /function FriendRequestDirectoryRow/);
  assert.match(source, /const handleProfileOpen = \(event\) => \{/);
  assert.match(source, /onOpenProfile\?\.\(requestUser\);/);
  assert.match(source, /const handleContextMenuOpen = \(event\) => \{/);
  assert.match(source, /onOpenActions\?\.\(event, requestUser\);/);
  assert.match(source, /role="button"[\s\S]*?onClick=\{handleProfileOpen\}[\s\S]*?onContextMenu=\{handleContextMenuOpen\}/);
  assert.match(source, /requestUser=\{\{[\s\S]*?\.\.\.request\.sender,[\s\S]*?friendshipStatus: "pending_incoming"/);
  assert.match(source, /requestUser=\{\{[\s\S]*?\.\.\.request\.receiver,[\s\S]*?friendshipStatus: "pending_outgoing"/);
});

test("pending request context menus do not expose friend-only removal actions", () => {
  const source = readRepoFile("src/features/menu-main/MenuMainController.jsx");

  assert.match(source, /const isPendingRelation = \["pending_outgoing", "pending_incoming"\]\.includes/);
  assert.match(source, /isFriend,\s+isBlocked,/);
  assert.match(source, /disabled: Boolean\(!friendListUserContextMenu\?\.userId \|\| !friendListUserContextMenu\?\.canOpenDirectChat/);
  assert.match(source, /\.\.\.\(friendListUserContextMenu\?\.isFriend\s+\?\s+\[/);
});

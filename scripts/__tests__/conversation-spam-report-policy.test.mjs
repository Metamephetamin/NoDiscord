import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const conversationsController = readFileSync("BackNoDiscord/BackNoDiscord/Controllers/ConversationsController.cs", "utf8");
const friendsWorkspace = readFileSync("src/components/FriendsWorkspace.jsx", "utf8");
const friendsStateHook = readFileSync("src/hooks/useFriendsWorkspaceState.js", "utf8");
const adminOverview = readFileSync("BackNoDiscord/BackNoDiscord/Services/AdminSecurityOverviewService.cs", "utf8");

test("conversation spam flow creates an admin moderation report before leaving", () => {
  assert.match(
    conversationsController,
    /\[HttpPost\("\{conversationId:int\}\/report-spam-and-leave"\)\]/,
    "backend must expose a dedicated report-spam-and-leave endpoint",
  );
  assert.match(
    conversationsController,
    /new\s+ChatModerationReportRecord/,
    "conversation spam endpoint should reuse moderation reports for admin review",
  );
  assert.match(
    conversationsController,
    /conversation_spam/,
    "conversation spam reports need a machine-readable reason kind",
  );
  assert.match(
    conversationsController,
    /Remove\(currentMember\)/,
    "reporting spam should remove the current user from the conversation",
  );
});

test("conversation chat exposes report spam and exit action", () => {
  assert.match(
    friendsWorkspace,
    /Сообщить о спаме и выйти/,
    "conversation topbar/settings must expose the spam report action",
  );
  assert.match(
    friendsWorkspace,
    /onReportConversationSpamAndLeave/,
    "FriendsWorkspace should call a dedicated spam-report handler",
  );
  assert.match(
    friendsStateHook,
    /report-spam-and-leave/,
    "frontend state hook should call the backend spam report endpoint",
  );
});

test("admin overview surfaces conversation spam as a risk event", () => {
  assert.match(
    adminOverview,
    /ConversationSpamReasonKind/,
    "admin overview should recognize conversation spam reports",
  );
  assert.match(
    adminOverview,
    /ReportKind/,
    "report DTO should include a typed kind for the admin UI",
  );
});

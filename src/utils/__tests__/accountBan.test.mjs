import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBannedAccount } from "../accountBan.js";

test("normalizeBannedAccount reads account_banned backend payload", () => {
  const result = normalizeBannedAccount({
    code: "account_banned",
    user: {
      id: 42,
      first_name: "Але",
      nickname: "ale",
      email: "ale@example.com",
      avatar_url: "/uploads/avatar.png",
      ban_reason: "spam",
      banned_at: "2026-05-14T10:00:00.000Z",
      is_banned: true,
    },
  });

  assert.equal(result.id, 42);
  assert.equal(result.displayName, "Але");
  assert.equal(result.email, "ale@example.com");
  assert.equal(result.avatarUrl, "/uploads/avatar.png");
  assert.equal(result.banReason, "spam");
  assert.equal(result.isBanned, true);
});

test("normalizeBannedAccount ignores regular users", () => {
  assert.equal(normalizeBannedAccount({ id: 1, nickname: "user", is_banned: false }), null);
});

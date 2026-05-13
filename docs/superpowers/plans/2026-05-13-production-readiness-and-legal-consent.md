# Production Readiness And Legal Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring NoDiscord/Tend to a stronger production state by adding observability, delivery reliability, moderation, storage safety, account security, voice resilience, release gates, and registration consent with a readable user agreement.

**Architecture:** Implement this as independent production layers, each ending in working software, tests, and a commit. Avoid large rewrites: add focused services, DTOs, UI panels, and policy helpers around existing Electron + React + ASP.NET Core + SignalR + LiveKit paths.

**Tech Stack:** Electron, React, Vite, ASP.NET Core 8, EF Core/Npgsql, PostgreSQL, SignalR, LiveKit, service worker/PWA shell caching, GitHub Actions production deploy from `master`.

---

## Non-Negotiable Constraints

- Start each task with `git status --short`.
- Do not push risky unverified work directly to production.
- Use small commits per task.
- Run the cheapest relevant checks after each task.
- Do not log secrets, tokens, cookies, authorization headers, or message bodies.
- For legal text, write transparent product language, not a fake liability shield. The agreement may limit liability "to the maximum extent permitted by law", but it must not claim that the operator has zero responsibility for every possible data leak.

## Sources To Respect For Legal/Data Text

- FTC "Start with Security" recommends collecting only needed data, keeping it only while needed, protecting it in storage/transit, and preparing an incident response process.
- ICO privacy notice guidance says users should be told who operates the service, why data is processed, what categories are collected, who receives data, retention rules, and available rights.

---

## Workstreams

1. Observability and production health.
2. Message delivery, read states, and durable outbox.
3. Moderation and abuse tooling.
4. Media storage, quotas, cleanup, and file safety.
5. Account security and session control.
6. Voice/call resilience for weak networks.
7. E2E smoke tests and release gates.
8. Performance hardening for chats/media/voice.
9. Legal pages, registration consent checkbox, and agreement preview.

---

## Global Success Gates

Run before final production push:

```powershell
npm run lint:ci
npm run check:encoding
npm run build:frontend
dotnet build BackNoDiscord\BackNoDiscord\BackNoDiscord.csproj --configuration Release
dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release
```

After deployment:

```powershell
Invoke-RestMethod https://lanaya.space/api/ping
```

Expected: status is `ok`.

---

## Phase 1: Observability And Health

**Result:** When production breaks, we can see where: frontend, backend, SignalR, LiveKit, uploads, auth, deploy, database, or storage.

**Files:**
- Create: `BackNoDiscord/BackNoDiscord/Observability/RequestCorrelationMiddleware.cs`
- Create: `BackNoDiscord/BackNoDiscord/Observability/ProductionMetrics.cs`
- Create: `BackNoDiscord/BackNoDiscord/Controllers/HealthController.cs`
- Create: `src/utils/clientDiagnostics.js`
- Create: `src/utils/__tests__/clientDiagnostics.test.mjs`
- Modify: `BackNoDiscord/BackNoDiscord/Program.cs`
- Modify: `src/renderer.jsx`
- Modify: `src/SignalR/ChatConnect.jsx`
- Modify: `src/webrtc/livekitVoiceRoomClient.js`

- [x] Add request correlation id middleware and include it in structured logs.
- [x] Add `/api/health/live` and `/api/health/ready`: live checks process; ready checks database and critical config.
- [x] Add frontend diagnostic queue for sanitized client errors: error name, component area, route, app version, timestamp, no message contents.
- [x] Hook `window.onerror`, `unhandledrejection`, SignalR reconnect events, LiveKit connect failures, upload failures.
- [x] Add backend endpoint `POST /api/diagnostics/client-events` with rate limit and payload size limit.
- [x] Add tests proving diagnostics reject message content/token-like fields.
- [x] Verify with `npm run lint:ci`, `npm run build:frontend`, `dotnet test`.
- [x] Commit: `Add production diagnostics and health checks`.

**Acceptance:**
- A failed upload or voice connect produces a sanitized diagnostic event.
- `/api/health/ready` fails when DB is unavailable.
- No auth token, cookie, or message text appears in diagnostic payloads.

---

## Phase 2: Durable Message Delivery

**Result:** Messages survive reconnects/restarts, avoid duplicates, and expose clear delivery states.

**Files:**
- Create: `src/features/text-chat/messageDeliveryState.mjs`
- Create: `src/features/text-chat/__tests__/messageDeliveryState.test.mjs`
- Create: `BackNoDiscord/BackNoDiscord/Services/MessageDeduplicationService.cs`
- Create: `BackNoDiscord/BackNoDiscord.Tests/Services/MessageDeduplicationServiceTests.cs`
- Modify: `src/features/text-chat/TextChatController.jsx`
- Modify: `src/features/text-chat/TextChatMessageList.jsx`
- Modify: `src/utils/textChatHttpFallback.js`
- Modify: `BackNoDiscord/BackNoDiscord/ChatHub.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/ChatMessagesController.cs`
- Modify: `BackNoDiscord/BackNoDiscord/DbContext.cs`

- [x] Add `clientMessageId` to send paths and backend persistence.
- [x] Add unique backend dedupe by `(authorUserId, channelId, clientMessageId)`.
- [x] Persist local outbox per channel in IndexedDB or existing local cache layer.
- [x] Add delivery states: `queued`, `sending`, `sent`, `delivered`, `failed`.
- [x] Add resend after app restart when auth/session is valid.
- [x] Add "read by me" and "last read" server state for read receipts.
- [x] Add minimal UI indicators without re-rendering entire message list.
- [x] Verify direct chat, server chat, image send, offline/reconnect, duplicate resend.
- [x] Commit: `Harden durable chat delivery`.

**Acceptance:**
- Killing the app mid-send does not lose the message.
- Reconnecting does not duplicate already accepted messages.
- User can distinguish sending, sent, delivered, and failed.

---

## Phase 3: Moderation And Abuse Tools

**Result:** Product can handle spam, harassment, and unsafe users without database surgery.

**Files:**
- Create: `BackNoDiscord/BackNoDiscord/Moderation/ModerationModels.cs`
- Create: `BackNoDiscord/BackNoDiscord/Controllers/ModerationController.cs`
- Create: `BackNoDiscord/BackNoDiscord/Services/ModerationService.cs`
- Create: `BackNoDiscord/BackNoDiscord.Tests/Services/ModerationServiceTests.cs`
- Create: `src/features/moderation/ModerationPanel.jsx`
- Create: `src/features/moderation/moderationApi.js`
- Modify: `BackNoDiscord/BackNoDiscord/DbContext.cs`
- Modify: `BackNoDiscord/BackNoDiscord/ChatHub.cs`
- Modify: `src/components/TextChatMessageList.jsx`
- Modify: `src/features/menu-main/MenuMainController.jsx`

- [x] Add report table: reporter, target user/message/server, reason, status, timestamps.
- [x] Add mute/ban/block enforcement in message send, friend requests, invites, voice actions.
- [x] Add moderator role check using existing server permissions where possible.
- [x] Add report action in message/user context menu.
- [x] Add basic moderation inbox: open, reviewed, actioned, dismissed.
- [x] Add audit log for moderation actions without storing private message bodies in logs.
- [x] Verify reports, mute, ban, unban, blocked send, audit entries.
- [x] Commit: `Add moderation reports and enforcement`.

**Acceptance:**
- A muted user cannot send in scoped channels.
- A banned user cannot rejoin the server.
- Moderation actions are auditable.

---

## Phase 4: Media Storage Safety

**Result:** Uploads have quotas, cleanup, safer file rules, and operational visibility.

**Files:**
- Create: `BackNoDiscord/BackNoDiscord/Services/UserStorageQuotaService.cs`
- Create: `BackNoDiscord/BackNoDiscord/Services/ChatFileCleanupService.cs`
- Create: `BackNoDiscord/BackNoDiscord.Tests/Services/UserStorageQuotaServiceTests.cs`
- Create: `BackNoDiscord/BackNoDiscord.Tests/Services/ChatFileCleanupServiceTests.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/ChatFilesController.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Services/StreamedChatFileUploadReader.cs`
- Modify: `BackNoDiscord/BackNoDiscord/DbContext.cs`
- Modify: `src/features/text-chat/TextChatComposer.jsx`
- Modify: `src/components/TextChatMessageList.jsx`

- [x] Add per-user and per-server storage usage counters.
- [x] Enforce quota before accepting large uploads.
- [x] Add background cleanup for orphaned temp files and failed uploads.
- [x] Store file metadata: owner, channel, size, mime, checksum, created_at, deleted_at.
- [x] Block dangerous executable types and double-extension traps.
- [x] Add UI error copy for quota exceeded and unsafe file type.
- [x] Verify upload under quota, quota exceed, blocked executable, cleanup.
- [x] Commit: `Add chat media quota and cleanup`.

**Acceptance:**
- Storage cannot grow forever from failed uploads.
- Users get clear errors instead of silent upload failures.

---

## Phase 5: Account Security

**Result:** Users can control sessions and recover from compromised devices.

**Files:**
- Create: `BackNoDiscord/BackNoDiscord/Services/UserSessionService.cs`
- Create: `BackNoDiscord/BackNoDiscord.Tests/Services/UserSessionServiceTests.cs`
- Create: `src/features/account-security/AccountSessionsPanel.jsx`
- Create: `src/features/account-security/accountSecurityApi.js`
- Modify: `BackNoDiscord/BackNoDiscord/AuthController.cs`
- Modify: `BackNoDiscord/BackNoDiscord/DbContext.cs`
- Modify: `src/components/Auth.jsx`
- Modify: `src/utils/auth.js`

- [x] Persist refresh/session records with device label, created_at, last_used_at, revoked_at.
- [x] Add `GET /api/auth/sessions`.
- [x] Add revoke one session and revoke all other sessions.
- [x] Rotate refresh tokens and invalidate reused/revoked tokens.
- [x] Add suspicious login signal: new device/IP family/email notification if email is configured.
- [x] Add UI in settings for active sessions.
- [x] Verify login, refresh, revoke current, revoke other, stolen refresh reuse.
- [x] Commit: `Add account session management`.

**Acceptance:**
- User can log out all devices.
- Reused revoked refresh token cannot mint a session.

---

## Phase 6: Voice And Calls Under Weak Network

**Result:** Calls degrade gracefully on 3G/packet loss instead of feeling broken.

**Files:**
- Create: `src/webrtc/voiceNetworkProfile.mjs`
- Create: `src/webrtc/__tests__/voiceNetworkProfile.test.mjs`
- Modify: `src/webrtc/livekitVoiceRoomClient.js`
- Modify: `src/webrtc/streamDiagnostics.mjs`
- Modify: `src/features/menu-main/menuMainDirectCallState.js`
- Modify: `src/components/MenuMainOverlays.jsx`
- Modify: `BackNoDiscord/BackNoDiscord/VoiceHub.cs`

- [x] Normalize network profiles: `good`, `constrained`, `poor`, `reconnecting`.
- [x] Apply lower audio bitrate and disable nonessential video/screen quality under poor network.
- [x] Add visible diagnostics: reconnecting, poor network, trying lower quality.
- [x] Add explicit LiveKit token/session failure UI path.
- [x] Add "test call diagnostics" mode showing mic selected, permissions, route, ping, packet pressure.
- [x] Verify simulated reconnect, LiveKit session failure, no mic, weak route, direct call command retry.
- [x] Commit: `Improve weak network voice resilience`.

**Acceptance:**
- On poor network, app attempts lower quality before failing.
- User sees actionable reason instead of generic broken call.

---

## Phase 7: E2E Smoke And Release Gates

**Result:** `master` deploy is protected by repeatable smoke checks.

**Files:**
- Create: `scripts/smoke/auth-smoke.mjs`
- Create: `scripts/smoke/chat-smoke.mjs`
- Create: `scripts/smoke/upload-smoke.mjs`
- Create: `scripts/smoke/voice-smoke.mjs`
- Create: `docs/release/rollback.md`
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/release/production-checklist.md`

- [x] Add smoke scripts with environment-driven test user credentials.
- [x] Add deploy workflow gate: build, backend tests, frontend build, smoke against staging or preview URL.
- [x] Add rollback doc with exact GitHub Actions/manual steps.
- [x] Add post-deploy health check against `https://lanaya.space/api/ping`.
- [x] Verify local smoke commands and CI syntax.
- [x] Commit: `Add production smoke release gates`.

**Acceptance:**
- A broken auth/chat/upload path blocks release before production.
- Rollback steps are documented and executable.

---

## Phase 8: Performance Hardening

**Result:** Long chats, media previews, and voice UI remain responsive on weak machines.

**Files:**
- Modify: `src/components/TextChatMessageList.jsx`
- Modify: `src/hooks/useTextChatVirtualizer.js`
- Modify: `src/features/text-chat/TextChatController.jsx`
- Modify: `src/features/menu-main/MenuMainController.jsx`
- Modify: `src/webrtc/livekitVoiceRoomClient.js`
- Modify: `scripts/perf-audit.mjs`
- Modify: `docs/performance/registry.md`

- [x] Measure long chat render, scroll, upload modal first paint, voice join, settings navigation.
- [x] Move heavy preview/media work out of render and into chunked async steps.
- [x] Keep direct call and voice state localized to avoid MenuMain-wide rerenders.
- [x] Split additional lazy chunks only where bundle audit proves value.
- [x] Add perf budget to `npm run audit:perf`.
- [x] Verify perf audit, lint, build; manual long-chat scroll remains a local QA step.
- [x] Commit: `Tighten chat and voice performance budgets`.

**Acceptance:**
- Long chat scroll stays responsive.
- Upload preview and voice join do not block the main UI.

---

## Phase 9: Legal Pages And Registration Consent

**Result:** Registration requires explicit agreement, and the user can open/read the user agreement before creating an account.

**Files:**
- Create: `src/legal/userAgreementText.js`
- Create: `src/components/UserAgreementModal.jsx`
- Create: `src/components/__tests__/userAgreementText.test.mjs`
- Modify: `src/components/Auth.jsx`
- Modify: `src/css/Auth.css`
- Modify: `BackNoDiscord/BackNoDiscord/AuthController.cs`
- Modify: `BackNoDiscord/BackNoDiscord/DbContext.cs`
- Create migration SQL or EF migration for consent fields.

- [x] Add frontend state: `termsAccepted: false` to `initialRegisterForm`.
- [x] Render checkbox above the registration submit button:

```jsx
{mode === "register" && !shouldShowRegistrationCodeStep ? (
  <label className="auth-terms-consent">
    <input
      type="checkbox"
      checked={registerForm.termsAccepted}
      onChange={handleRegisterFieldChange("termsAccepted")}
      required
    />
    <span>
      Согласен с{" "}
      <button type="button" className="auth-terms-link" onClick={openUserAgreementPreview}>
        пользовательским соглашением
      </button>
    </span>
  </label>
) : null}
```

- [x] Disable registration until checkbox is checked and show a clear error if submit is attempted without consent.
- [x] Add modal preview component with scrollable agreement text, close button, and "Понятно" action.
- [x] Add backend `termsAccepted` to `RegisterDto`.
- [x] Reject `/auth/register` with `400` if `termsAccepted != true`.
- [x] Store consent fields on user: `terms_accepted_at`, `terms_version`, `privacy_version`.
- [x] Add tests proving registration fails without terms and succeeds with terms.
- [x] Add frontend tests proving agreement text includes: collected data, purposes, retention, security, user content responsibility, limitation of liability, breach limitation wording.
- [x] Verify register flow contract: unchecked payload is blocked by frontend/backend, link renders modal component, checked payload stores consent metadata. Manual click-through remains in Phase 10 QA.
- [x] Commit: `Require user agreement consent at registration`.

**Agreement Text Policy:**

Use honest wording:

- We collect registration data: name, nickname, email, password hash, avatar/profile settings.
- We process messages, attachments, calls metadata, friend/server relationships, device/session data, diagnostics needed for service operation.
- We use data to provide accounts, messages, calls, media uploads, security, abuse prevention, support, and diagnostics.
- We do not sell personal data and do not use private messages for personal purposes.
- Users are responsible for their own content, credentials, devices, and what they publish/share.
- The service takes reasonable security measures, but no internet service can guarantee absolute security.
- Liability is limited to the maximum extent permitted by law. Do not write that the operator is never responsible for any data leak; instead write that the operator is not responsible for leaks caused by user actions, compromised user devices, third-party services outside operator control, or force majeure, except where liability cannot legally be excluded.
- Users can request account/data deletion through a documented contact path.

**Acceptance:**
- A user cannot register without explicit consent.
- The agreement is readable before registration.
- Backend enforces consent; it is not only a frontend checkbox.

---

## Phase 10: Final Production Review

**Result:** All layers work together and production is deployable with known residual risk.

**Files:**
- Modify: `docs/release/production-checklist.md`
- Modify: `docs/release/rollback.md`
- Modify: `docs/performance/registry.md`

- [x] Run frontend checks.
- [x] Run backend build/tests.
- [x] Run smoke tests in local skip-mode; credentialed production smoke remains in the release checklist.
- [ ] Manually verify: registration consent, login, message send, image in DM, image in server chat, offline/reconnect send, call start/accept/end, poor network status, upload quota error, report user, mute user, revoke session.
- [x] Update production checklist with exact result and date.
- [x] Push to `origin master`.
- [x] Check `https://lanaya.space/api/ping`.
- [x] Commit final docs if needed: `Document production readiness verification`.

**Acceptance:**
- Production deploy is green.
- Critical user paths are verified.
- Known risks are documented instead of hidden.

---

## Recommended Execution Order

1. Phase 9 first if you want the registration agreement immediately visible.
2. Phase 1 next because every later layer benefits from diagnostics.
3. Phase 2 and Phase 6 for core communication reliability.
4. Phase 3 and Phase 4 before wider public traffic.
5. Phase 5 before serious account growth.
6. Phase 7 and Phase 8 before treating `master` as a stable release train.
7. Phase 10 before the next production push.

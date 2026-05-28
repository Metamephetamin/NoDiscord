# Production System Design Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Lanaya's current monolithic production system closer to a safe, interview-grade system design without breaking the existing chat, friends, map, voice, files, deploy, or production domain.

**Architecture:** Keep the current modular monolith and harden it in layers: privacy/data lifecycle first, then migration discipline, background-job safety, storage recovery, realtime contracts, observability, and deploy safety. Every phase must be backwards-compatible with current production data and must ship with tests before production code changes. No microservice split is included in this plan.

**Tech Stack:** ASP.NET Core 8, EF Core/Npgsql, PostgreSQL, SignalR, Redis backplane, React/Vite/Electron, Leaflet, nginx, systemd, GitHub Actions, Bash/PowerShell release scripts.

---

## Non-Negotiable Safety Rules

- Do not remove `DatabaseSchemaInitializer` until EF migrations are proven in production for at least one deploy.
- Do not change the production domain away from `https://lanaya.space`.
- Do not push to `master` until local checks for the touched layer pass.
- Do not enable multiple backend instances until hosted services are protected by a distributed lock.
- Do not make geolocation invisible by accident: if location sharing is disabled, clients must show a clear state instead of silently failing.
- Do not log secrets, connection strings, precise user coordinates, access tokens, or backup contents.

## Current Risks This Plan Addresses

- Location sharing updates automatically, but there is no explicit server-side privacy state, clear retention, or disable path.
- Database schema changes are mostly startup patching, not versioned migrations.
- Hosted cleanup/repair services can run twice if more than one backend process is started.
- PostgreSQL backups exist, but uploaded files also need backup and restore coverage.
- SignalR event names and payloads are raw strings spread across backend/frontend code.
- Health checks only prove a small part of production readiness.
- Deploy works, but staging and atomic release behavior are still weaker than the documented target state.

## File Map

- `BackNoDiscord/BackNoDiscord/DbContext.cs`: user fields, new EF entities, model configuration.
- `BackNoDiscord/BackNoDiscord/Infrastructure/DatabaseSchemaInitializer.cs`: compatibility columns/indexes during the migration transition.
- `BackNoDiscord/BackNoDiscord/ChatHub.cs`: current location updates and realtime dispatch.
- `BackNoDiscord/BackNoDiscord/Controllers/FriendsController.cs`: friend payloads and visible location data.
- `BackNoDiscord/BackNoDiscord/Controllers/UserController.cs`: add user privacy/location preference endpoints if there is no narrower settings controller.
- `BackNoDiscord/BackNoDiscord/Services/`: new services for location privacy, distributed locks, storage backup checks, and realtime sync helpers.
- `BackNoDiscord/BackNoDiscord/Observability/ProductionHealthService.cs`: readiness checks for database, Redis, storage, backup timer, and config.
- `BackNoDiscord/BackNoDiscord.Tests/`: tests for every backend behavior change.
- `src/features/menu-main/MenuMainController.jsx`: current global auto-location watch; later move into a hook.
- `src/components/FriendsWorkspace.jsx`: map UI, locate button, live markers.
- `src/components/MenuSettingsPanels.jsx`: likely place for user-facing privacy controls.
- `src/realtime/`: new frontend realtime event constants.
- `scripts/__tests__/`: smoke/invariant tests for infra, frontend source contracts, and deploy safety.
- `infra/systemd/`, `infra/nginx/`, `infra/redis/`: current free scaling layer.
- `.github/workflows/deploy.yml`: deploy and health-check hardening.
- `docs/release/`: operator runbooks.

---

## Phase 1: Location Privacy And Retention

**Goal:** Keep the map working, but give every user explicit server-backed control over location sharing and automatic expiration of stale coordinates.

**Decision:** To avoid breaking the feature the user requested earlier, existing users stay shareable by default, but they get a visible toggle and server-side disable/clear behavior. Visibility is limited to accepted friends plus the user themselves. Coordinates older than the configured retention are not returned to clients.

### Task 1.1: Add Backend Location Privacy Model

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/DbContext.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Infrastructure/DatabaseSchemaInitializer.cs`
- Create: `BackNoDiscord/BackNoDiscord/Services/UserLocationPrivacyService.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Services/UserLocationPrivacyServiceTests.cs`

- [x] **Step 1: Write failing service tests**

Test cases:
- Default privacy allows sharing to accepted friends.
- Disabled privacy rejects `UpdateLocation`.
- Expired location is hidden from friend payloads.
- `ClearLocationAsync` nulls latitude, longitude, and updated timestamp.

Run:

```bash
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release --filter UserLocationPrivacyServiceTests
```

Expected before implementation: tests fail because `UserLocationPrivacyService` does not exist.

- [x] **Step 2: Add user columns**

Add nullable/backwards-compatible columns:
- `location_sharing_enabled boolean NOT NULL DEFAULT true`
- `location_visibility text NOT NULL DEFAULT 'friends'`
- `last_location_expires_at timestamptz NULL`

Add matching properties to `User` and `OnModelCreating`.

- [x] **Step 3: Add compatibility initializer**

Add these exact `ALTER TABLE users ADD COLUMN IF NOT EXISTS` statements in `DatabaseSchemaInitializer`:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_sharing_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_visibility text NOT NULL DEFAULT 'friends';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location_expires_at timestamptz NULL;
```

Add a check constraint only if it can be added idempotently without breaking old data:

```sql
CHECK (location_visibility IN ('friends', 'none'))
```

- [x] **Step 4: Implement service**

Service API:

```csharp
public sealed class UserLocationPrivacyService
{
    public Task<bool> CanPublishLocationAsync(int userId, CancellationToken cancellationToken);
    public Task<DateTimeOffset> GetLocationExpiryAsync(DateTimeOffset now, CancellationToken cancellationToken);
    public Task ClearLocationAsync(int userId, CancellationToken cancellationToken);
    public bool IsLocationVisible(User user, DateTimeOffset now);
}
```

Default retention: 24 hours through `Location:RetentionHours`, clamped to 1-168 hours.

- [x] **Step 5: Verify tests pass**

Run the filtered test command again. Expected: all new tests pass.

- [x] **Step 6: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/DbContext.cs BackNoDiscord/BackNoDiscord/Infrastructure/DatabaseSchemaInitializer.cs BackNoDiscord/BackNoDiscord/Services/UserLocationPrivacyService.cs BackNoDiscord/BackNoDiscord.Tests/Services/UserLocationPrivacyServiceTests.cs
git commit -m "feat: add location privacy model"
```

### Task 1.2: Enforce Location Privacy In SignalR And Friend Payloads

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/ChatHub.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/FriendsController.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Controllers/FriendsControllerTests.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Services/UserLocationPrivacyServiceTests.cs`

- [x] **Step 1: Write failing controller tests**

Test cases:
- Friend payload includes non-expired coordinates when sharing is enabled.
- Friend payload omits coordinates when sharing is disabled.
- Friend payload omits coordinates when `last_location_expires_at < now`.

Run:

```bash
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release --filter FriendsControllerTests
```

Expected before implementation: disabled/expired location still leaks.

- [x] **Step 2: Inject `UserLocationPrivacyService`**

Register service in `Program.cs` as scoped. Use it in `ChatHub.UpdateLocation` before writing coordinates.

- [x] **Step 3: Store expiry on update**

`UpdateLocation` must set:
- `last_location_latitude`
- `last_location_longitude`
- `last_location_updated_at`
- `last_location_expires_at`

- [x] **Step 4: Filter friend payloads**

In `FriendsController`, only return `latitude`, `longitude`, `locationLabel`, and `locationUpdatedAt` when `IsLocationVisible(friend, DateTimeOffset.UtcNow)` is true.

- [x] **Step 5: Verify**

Run:

```bash
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release --filter "FriendsControllerTests|UserLocationPrivacyServiceTests"
```

- [x] **Step 6: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/ChatHub.cs BackNoDiscord/BackNoDiscord/Controllers/FriendsController.cs BackNoDiscord/BackNoDiscord/Program.cs BackNoDiscord/BackNoDiscord.Tests/Controllers/FriendsControllerTests.cs BackNoDiscord/BackNoDiscord.Tests/Services/UserLocationPrivacyServiceTests.cs
git commit -m "fix: enforce location privacy"
```

### Task 1.3: Add User Controls For Location Sharing

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/UserController.cs`
- Modify: `src/components/MenuSettingsPanels.jsx`
- Create: `src/hooks/useLocationSharingPreference.js`
- Modify: `src/features/menu-main/MenuMainController.jsx`
- Modify: `src/components/FriendsWorkspace.jsx`
- Test: `scripts/location-ui-smoke.mjs`
- Test: `scripts/__tests__/location-privacy-source.test.mjs`

- [x] **Step 1: Write failing frontend source test**

Create a node test asserting:
- `MenuMainController.jsx` does not call `watchPosition` directly after the hook is introduced.
- `useLocationSharingPreference.js` checks server preference before starting geolocation.
- Settings panel contains text/control for location sharing.

Run:

```bash
node --test scripts/__tests__/location-privacy-source.test.mjs
```

Expected before implementation: test fails because the hook does not exist.

- [x] **Step 2: Add backend preference endpoint**

Endpoints:
- `GET /api/user/location-sharing`
- `PUT /api/user/location-sharing`
- `POST /api/user/location-sharing/clear`

Payload:

```json
{
  "enabled": true,
  "visibility": "friends",
  "retentionHours": 24
}
```

- [x] **Step 3: Move auto-location into hook**

Create `useLocationSharingPreference(user, startChatConnection)`:
- fetch preference after login;
- start `watchPosition` only when `enabled === true`;
- call `UpdateLocation` with throttling;
- stop watcher when disabled/logout.

- [x] **Step 4: Add UI toggle**

In settings:
- toggle "Показывать меня на карте";
- button "Стереть мою последнюю локацию";
- short note that only accepted friends see the location.

- [x] **Step 5: Update map empty/status states**

`FriendsWorkspace` should show a clear status when self location is disabled, without breaking friends' visible markers.

- [x] **Step 6: Verify**

Run:

```bash
node --test scripts/__tests__/location-privacy-source.test.mjs
npm run test:location-ui
npm run lint:ci
npm run build:frontend
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release
```

- [x] **Step 7: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/Controllers/UserController.cs src/components/MenuSettingsPanels.jsx src/hooks/useLocationSharingPreference.js src/features/menu-main/MenuMainController.jsx src/components/FriendsWorkspace.jsx scripts/location-ui-smoke.mjs scripts/__tests__/location-privacy-source.test.mjs
git commit -m "feat: add location sharing controls"
```

---

## Phase 2: Versioned Database Migrations

**Goal:** Start moving schema changes from startup patching to versioned EF migrations while preserving current production startup safety.

### Task 2.1: Add Migration Infrastructure Without Applying It Automatically

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj`
- Create: `BackNoDiscord/BackNoDiscord/Infrastructure/AppDbContextDesignTimeFactory.cs`
- Create: `BackNoDiscord/BackNoDiscord/Migrations/<timestamp>_BaselineProductionSchema.cs`
- Create: `BackNoDiscord/BackNoDiscord/Migrations/<timestamp>_BaselineProductionSchema.Designer.cs`
- Create: `BackNoDiscord/BackNoDiscord/Migrations/AppDbContextModelSnapshot.cs`
- Test: `scripts/__tests__/migration-policy.test.mjs`

- [x] **Step 1: Write failing migration policy test**

Assertions:
- migrations directory exists;
- design-time factory exists;
- deploy workflow does not run destructive migrations automatically;
- `DatabaseSchemaInitializer` still exists.

Run:

```bash
node --test scripts/__tests__/migration-policy.test.mjs
```

- [x] **Step 2: Add design-time factory**

Factory reads `ConnectionStrings__DefaultConnection` or uses a harmless local placeholder for migration generation only.

- [x] **Step 3: Generate baseline migration**

Use:

```bash
dotnet ef migrations add BaselineProductionSchema --project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --startup-project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj
```

If `dotnet-ef` is missing, install local tool manifest:

```bash
dotnet new tool-manifest
dotnet tool install dotnet-ef --version 8.*
dotnet tool run dotnet-ef migrations add BaselineProductionSchema --project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --startup-project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj
```

- [x] **Step 4: Document production migration policy**

Create `docs/release/database-migrations.md`:
- migrations are reviewed in PR;
- production migration command is run during deploy only after backup;
- rollback path is documented for additive migrations.

- [x] **Step 5: Verify**

Run:

```bash
node --test scripts/__tests__/migration-policy.test.mjs
dotnet build BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --configuration Release
```

- [x] **Step 6: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/Infrastructure/AppDbContextDesignTimeFactory.cs BackNoDiscord/BackNoDiscord/Migrations docs/release/database-migrations.md scripts/__tests__/migration-policy.test.mjs
git commit -m "chore: add versioned database migrations"
```

### Task 2.2: Add Safe Migration Preflight To Deploy

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/release/database-backup-restore.md`
- Test: `scripts/__tests__/free-scaling-infra.test.mjs`

- [x] **Step 1: Extend deploy invariant test**

Assert deploy order:
1. backend publish;
2. backup timer/script available;
3. migration script generated;
4. health check.

- [x] **Step 2: Add migration script generation**

Use:

```bash
dotnet ef migrations script --idempotent --project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --startup-project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --output ./artifacts/backend-migrations.sql
```

Do not execute it automatically in the first deployment. Upload as an artifact for inspection.

- [x] **Step 3: Verify**

Run:

```bash
node --test scripts/__tests__/free-scaling-infra.test.mjs
dotnet build BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --configuration Release
```

- [x] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml docs/release/database-backup-restore.md scripts/__tests__/free-scaling-infra.test.mjs
git commit -m "ci: add migration preflight artifact"
```

---

## Phase 3: Distributed Locks For Background Services

**Goal:** Make it safe to run multiple backend processes later by preventing duplicate cleanup and repair jobs.

### Task 3.1: Add Distributed Job Lock Abstraction

**Files:**
- Create: `BackNoDiscord/BackNoDiscord/Services/DistributedJobLock.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Program.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Services/DistributedJobLockTests.cs`

- [ ] **Step 1: Write failing tests**

Test cases:
- lock returns acquired when provider grants it;
- second acquisition of same key returns not acquired;
- dispose releases the lock;
- lock timeout does not throw.

Run:

```bash
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release --filter DistributedJobLockTests
```

- [ ] **Step 2: Implement interface**

```csharp
public interface IDistributedJobLock
{
    Task<IAsyncDisposable?> TryAcquireAsync(string key, TimeSpan ttl, CancellationToken cancellationToken);
}
```

Implementation:
- Prefer PostgreSQL advisory lock using the existing database connection.
- Use a stable 64-bit key derived from SHA256 of the job name.
- Keep the DB connection open until the returned handle is disposed.

- [ ] **Step 3: Register service**

Register as scoped or singleton depending on connection ownership. Avoid sharing a single open DbConnection globally.

- [ ] **Step 4: Verify**

Run filtered tests and backend build.

- [ ] **Step 5: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/Services/DistributedJobLock.cs BackNoDiscord/BackNoDiscord/Program.cs BackNoDiscord/BackNoDiscord.Tests/Services/DistributedJobLockTests.cs
git commit -m "feat: add distributed job locks"
```

### Task 3.2: Protect Hosted Cleanup And Repair Jobs

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/Services/ChatFileCleanupService.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Services/ChatFileMetadataRepairHostedService.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Services/ChatFileCleanupServiceTests.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Services/ChatFileMetadataRepairServiceTests.cs`

- [ ] **Step 1: Write failing hosted-service tests**

Use a fake lock service returning null. Assert:
- cleanup service does not call cleanup when lock is unavailable;
- metadata repair does not run batches when lock is unavailable.

- [ ] **Step 2: Inject lock service**

Use keys:
- `chat-file-cleanup`
- `chat-file-metadata-repair`

TTL:
- cleanup: interval duration;
- repair: 30 minutes.

- [ ] **Step 3: Verify**

Run:

```bash
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release --filter "ChatFileCleanupServiceTests|ChatFileMetadataRepairServiceTests|DistributedJobLockTests"
```

- [ ] **Step 4: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/Services/ChatFileCleanupService.cs BackNoDiscord/BackNoDiscord/Services/ChatFileMetadataRepairHostedService.cs BackNoDiscord/BackNoDiscord.Tests/Services
git commit -m "fix: guard hosted jobs with distributed locks"
```

---

## Phase 4: Uploaded File Backup And Restore

**Goal:** Back up user-uploaded files alongside PostgreSQL so a database restore does not point to missing media.

### Task 4.1: Add Storage Backup Timer

**Files:**
- Create: `scripts/storage-backup.sh`
- Create: `infra/systemd/nodiscord-storage-backup.service`
- Create: `infra/systemd/nodiscord-storage-backup.timer`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/release/free-scaling.md`
- Create: `docs/release/storage-backup-restore.md`
- Test: `scripts/__tests__/storage-backup-infra.test.mjs`

- [ ] **Step 1: Write failing infra test**

Assert:
- script exists;
- script uses `tar` or `rsync` without printing file contents;
- timer exists;
- deploy installs/enables timer.

- [ ] **Step 2: Implement script**

Behavior:
- reads `Storage__Root`;
- writes compressed archive to `/opt/nodiscord/.deploy/backups/storage`;
- excludes temporary files such as `upload-*.tmp`;
- retention default 14 days.

- [ ] **Step 3: Install through deploy**

Add rsync/copy of script and systemd units in the existing "Enable free single-server scaling layer" step.

- [ ] **Step 4: Verify**

Run:

```bash
node --test scripts/__tests__/storage-backup-infra.test.mjs
npm run check:encoding
```

- [ ] **Step 5: Commit**

```bash
git add scripts/storage-backup.sh infra/systemd/nodiscord-storage-backup.service infra/systemd/nodiscord-storage-backup.timer .github/workflows/deploy.yml docs/release/free-scaling.md docs/release/storage-backup-restore.md scripts/__tests__/storage-backup-infra.test.mjs
git commit -m "chore: add storage backup timer"
```

---

## Phase 5: Realtime Contracts And Recovery

**Goal:** Replace ad hoc SignalR strings with shared constants and add recovery hooks for missed realtime events.

### Task 5.1: Add Backend And Frontend Event Constants

**Files:**
- Create: `BackNoDiscord/BackNoDiscord/Realtime/RealtimeEvents.cs`
- Create: `src/realtime/realtimeEvents.js`
- Modify: `BackNoDiscord/BackNoDiscord/ChatHub.cs`
- Modify: `BackNoDiscord/BackNoDiscord/VoiceHub.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/*.cs` where hub events are sent
- Modify: `src/SignalR/ChatConnect.jsx`
- Modify: `src/components/FriendsWorkspace.jsx`
- Test: `scripts/realtime-smoke.mjs`

- [ ] **Step 1: Extend realtime smoke test**

Assert:
- `FriendLocationUpdated` is imported from constants on frontend;
- backend has `RealtimeEvents.FriendLocationUpdated`;
- no new location event raw strings exist outside constants.

- [ ] **Step 2: Add constants**

Backend:

```csharp
public static class RealtimeEvents
{
    public const string FriendLocationUpdated = "FriendLocationUpdated";
    public const string FriendPresenceUpdated = "FriendPresenceUpdated";
}
```

Frontend:

```js
export const REALTIME_EVENTS = Object.freeze({
  friendLocationUpdated: "FriendLocationUpdated",
  friendPresenceUpdated: "FriendPresenceUpdated",
});
```

- [ ] **Step 3: Replace location and presence events first**

Do not refactor every event in one commit. Start with location and presence.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test:realtime
npm run lint:ci
dotnet build BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --configuration Release
```

- [ ] **Step 5: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/Realtime/RealtimeEvents.cs src/realtime/realtimeEvents.js BackNoDiscord/BackNoDiscord/ChatHub.cs src/components/FriendsWorkspace.jsx scripts/realtime-smoke.mjs
git commit -m "chore: centralize realtime location events"
```

### Task 5.2: Add Reconnect Sync For Friends And Location

**Files:**
- Modify: `src/SignalR/ChatConnect.jsx`
- Modify: `src/hooks/useFriendsWorkspaceState.js`
- Modify: `src/components/FriendsWorkspace.jsx`
- Test: `scripts/realtime-smoke.mjs`

- [ ] **Step 1: Write failing smoke assertion**

Assert frontend calls friends refresh after SignalR reconnect so missed location/presence updates can be recovered.

- [ ] **Step 2: Add reconnect event subscription**

Expose a safe callback registration API from `ChatConnect.jsx`:

```js
const chatReconnectedCallbacks = new Set();

export function onChatReconnected(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  chatReconnectedCallbacks.add(callback);
  return () => chatReconnectedCallbacks.delete(callback);
}
```

- [ ] **Step 3: Refresh friends on reconnect**

In friends workspace state, call `refreshFriends()` after reconnect. Debounce to avoid repeated API calls.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test:realtime
npm run lint:ci
npm run build:frontend
```

- [ ] **Step 5: Commit**

```bash
git add src/SignalR/ChatConnect.jsx src/hooks/useFriendsWorkspaceState.js src/components/FriendsWorkspace.jsx scripts/realtime-smoke.mjs
git commit -m "fix: resync friends after realtime reconnect"
```

---

## Phase 6: Production Observability

**Goal:** Make production health answer what is broken: DB, Redis, storage, backups, backend, SignalR endpoints, and deploy config.

### Task 6.1: Extend Readiness Checks

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/Observability/ProductionHealthService.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/HealthController.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Observability/ProductionHealthServiceTests.cs`

- [ ] **Step 1: Write failing tests**

Check output contains:
- `database`
- `redis`
- `storage`
- `configuration`
- `backupTimer`

- [ ] **Step 2: Implement checks**

Redis:
- if `Redis__ConnectionString` empty: `disabled`;
- if configured and ping succeeds: `ok`;
- if configured and ping fails: `unavailable`.

Storage:
- verify root exists;
- verify writable by creating and deleting a small probe file.

Backup timer:
- on Linux, check `systemctl is-enabled nodiscord-db-backup.timer` through a small abstraction so tests can fake it;
- outside Linux: report `unknown`.

- [ ] **Step 3: Verify**

Run:

```bash
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release --filter ProductionHealthServiceTests
```

- [ ] **Step 4: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/Observability/ProductionHealthService.cs BackNoDiscord/BackNoDiscord/Controllers/HealthController.cs BackNoDiscord/BackNoDiscord.Tests/Observability/ProductionHealthServiceTests.cs
git commit -m "feat: expand production readiness checks"
```

### Task 6.2: Add Operational Docs And Smoke Assertions

**Files:**
- Modify: `docs/release/observability.md`
- Modify: `docs/release/monitoring.md`
- Modify: `scripts/release-smoke.mjs`
- Test: `npm run smoke:release:strict`

- [ ] **Step 1: Add smoke check for readiness JSON keys**

Strict smoke must assert readiness includes DB, Redis, storage, and backup fields.

- [ ] **Step 2: Update docs**

Document what each readiness status means and what operator command to run.

- [ ] **Step 3: Verify**

Run:

```bash
npm run smoke:release:strict
npm run check:encoding
```

- [ ] **Step 4: Commit**

```bash
git add docs/release/observability.md docs/release/monitoring.md scripts/release-smoke.mjs
git commit -m "docs: document production readiness signals"
```

---

## Phase 7: Deploy And Staging Safety

**Goal:** Make production deploys safer without requiring a second paid server immediately.

### Task 7.1: Add Deploy Preflight And Health URL Guard

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/__tests__/release-smoke-gate-policy.test.mjs`

- [ ] **Step 1: Write failing workflow test**

Assert:
- production health URL is hardcoded to `https://lanaya.space` or validates against it;
- deploy refuses `tendsec.ru` for production;
- health checks include frontend, `/api/ping`, `/chatHub/negotiate`, `/voiceHub/negotiate`.

- [ ] **Step 2: Add guard**

In workflow, fail early if `vars.HEALTHCHECK_URL` is set and is not `https://lanaya.space`.

- [ ] **Step 3: Verify**

Run:

```bash
node --test scripts/__tests__/release-smoke-gate-policy.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml scripts/__tests__/release-smoke-gate-policy.test.mjs
git commit -m "ci: guard production healthcheck domain"
```

### Task 7.2: Move Toward Atomic Release Directories

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `infra/deploy/README.md`
- Modify: `docs/release/rollback.md`
- Test: `scripts/__tests__/release-smoke-gate-policy.test.mjs`

- [ ] **Step 1: Write failing workflow invariant**

Assert workflow uses:
- `/var/www/tend-app/releases/<run-id>`;
- `/opt/nodiscord/.deploy/releases/<run-id>`;
- `current` symlink update after validation.

- [ ] **Step 2: Implement frontend release directory first**

Frontend:
- rsync to `/var/www/tend-app/releases/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`;
- validate `index.html`;
- switch `/var/www/tend-app/current` symlink.

- [ ] **Step 3: Implement backend release directory second**

Backend:
- rsync to `/opt/nodiscord/.deploy/releases/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/backend`;
- keep `.env` and storage outside releases;
- update `/opt/nodiscord/.deploy/backend` symlink only after validation.

- [ ] **Step 4: Keep rollback simple**

Rollback command should repoint symlinks to previous release and restart backend.

- [ ] **Step 5: Verify**

Run:

```bash
node --test scripts/__tests__/release-smoke-gate-policy.test.mjs
npm run check:encoding
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy.yml infra/deploy/README.md docs/release/rollback.md scripts/__tests__/release-smoke-gate-policy.test.mjs
git commit -m "ci: deploy with atomic release directories"
```

---

## Phase 8: Code Boundary Cleanup

**Goal:** Reduce risk in large files by extracting only the parts touched by this plan.

### Task 8.1: Extract Location Publishing Hook

**Files:**
- Create: `src/hooks/useAutoLocationSharing.js`
- Modify: `src/features/menu-main/MenuMainController.jsx`
- Test: `scripts/__tests__/location-privacy-source.test.mjs`

- [ ] **Step 1: Write failing source test**

Assert `MenuMainController.jsx` imports `useAutoLocationSharing` and no longer contains direct `navigator.geolocation.watchPosition`.

- [ ] **Step 2: Move existing logic**

Move throttled geolocation watch from `MenuMainController.jsx` into the hook. Keep behavior unchanged except for privacy preference integration from Phase 1.

- [ ] **Step 3: Verify**

Run:

```bash
node --test scripts/__tests__/location-privacy-source.test.mjs
npm run lint:ci
npm run build:frontend
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAutoLocationSharing.js src/features/menu-main/MenuMainController.jsx scripts/__tests__/location-privacy-source.test.mjs
git commit -m "refactor: extract auto location sharing hook"
```

### Task 8.2: Extract Location Hub Logic

**Files:**
- Create: `BackNoDiscord/BackNoDiscord/Services/UserLocationRealtimeService.cs`
- Modify: `BackNoDiscord/BackNoDiscord/ChatHub.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Services/UserLocationPrivacyServiceTests.cs`

- [ ] **Step 1: Write failing service test**

Assert service validates coordinates, stores location, and returns recipient IDs for friends plus self.

- [ ] **Step 2: Move `UpdateLocation` internals**

`ChatHub.UpdateLocation` should become a thin wrapper:
- authenticate user;
- call service;
- send realtime event returned by service.

- [ ] **Step 3: Verify**

Run:

```bash
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release --filter "UserLocationPrivacyServiceTests|FriendsControllerTests"
```

- [ ] **Step 4: Commit**

```bash
git add BackNoDiscord/BackNoDiscord/Services/UserLocationRealtimeService.cs BackNoDiscord/BackNoDiscord/ChatHub.cs BackNoDiscord/BackNoDiscord.Tests/Services/UserLocationPrivacyServiceTests.cs
git commit -m "refactor: extract location realtime service"
```

---

## Full Verification Matrix

Run this before any `master` push that touches production behavior:

```bash
node --test scripts/__tests__/free-scaling-infra.test.mjs
npm run lint:ci
npm run check:encoding
npm run build:frontend
dotnet build BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj --configuration Release
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj --configuration Release
git diff --check
```

Run this after production deploy:

```bash
curl --fail --silent --show-error https://lanaya.space/api/ping
curl --silent --show-error --request POST --output /dev/null --write-out 'chat:%{http_code}\n' 'https://lanaya.space/chatHub/negotiate?negotiateVersion=1'
curl --silent --show-error --request POST --output /dev/null --write-out 'voice:%{http_code}\n' 'https://lanaya.space/voiceHub/negotiate?negotiateVersion=1'
```

Expected:
- `/api/ping` returns `{"status":"ok"}`;
- chat negotiate returns non-5xx, usually `401` without auth;
- voice negotiate returns non-5xx, usually `401` without auth.

## Deployment Strategy

- Each task gets its own commit.
- Each phase may be pushed to `master` only after the phase verification commands pass.
- If production health fails after deploy, first check whether the failure is real production breakage or a workflow configuration issue.
- If production is broken, rollback via `docs/release/rollback.md` before continuing feature work.

## Execution Order

1. Phase 1: Location Privacy And Retention.
2. Phase 3: Distributed Locks For Background Services.
3. Phase 4: Uploaded File Backup And Restore.
4. Phase 6: Production Observability.
5. Phase 5: Realtime Contracts And Recovery.
6. Phase 2: Versioned Database Migrations.
7. Phase 7: Deploy And Staging Safety.
8. Phase 8: Code Boundary Cleanup.

This order intentionally handles user/data safety before deeper structural cleanup. It also prevents enabling extra backend processes before background jobs are lock-safe.

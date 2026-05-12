# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring NoDiscord/Tend from "passes release checks" to a stronger production product by removing the known P0/P1 responsiveness risks, reducing early payload cost, and closing the manual release smoke gaps.

**Architecture:** Work from measured bottlenecks, not guesses. First make repeatable perf traces for the hot flows, then isolate TextChat state/render paths, then defer voice-heavy runtime loading, then split oversized app/menu code, and finally make release validation reproducible.

**Tech Stack:** Electron, React 19, Vite, ASP.NET Core 8, SignalR, LiveKit, Web Audio AudioWorklet, WebAssembly DeepFilterNet runtime.

---

## Current Constraints

- Current branch strategy: `master` is production/release, `dev` is validation.
- Do not touch unrelated dirty files unless they belong to the current task.
- Current dirty files observed before this plan: `src/components/TextChatMessageList.jsx`, `src/css/TextChat.css`.
- Required baseline checks are listed in `docs/release/production-checklist.md`.
- Known performance registry items are in `docs/performance/registry.md`.

## Workstreams

1. P0 TextChat upload and local state churn.
2. P1 voice/noise pipeline payload and initialization.
3. P1 bundle/menu-main split and state isolation.
4. Asset weight and release smoke automation.

## Success Gates

- `npm run check:encoding`
- `npm run test:encoding`
- `npm run test:auth-branding`
- `npm run lint:ci`
- `npm run build:frontend`
- `npm run audit:public-assets`
- `npm run audit:perf`
- `dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release`
- Manual smoke: auth, direct/server message, image upload, zip upload, blocked exe, voice join/speak/leave, camera, screen share, notification, session restore.

---

### Task 1: Establish Reproducible Perf Baselines

**Files:**
- Modify: `scripts/perf-audit.mjs`
- Modify: `docs/performance/playbook.md`
- Modify: `docs/performance/registry.md`

- [ ] **Step 1: Record exact hot flows**

Add a "Measured Baseline" section to `docs/performance/playbook.md` with these flows:

```md
## Measured Baseline Flows

1. TextChat batch upload: open a long text channel, select 3+ images, measure time to first visible batch modal.
2. TextChat local state churn: open a long text channel, toggle reply/edit/media preview, measure message list commits.
3. Voice init: cold start app, do not join voice, confirm voice/noise runtime is not initialized.
4. Voice join: join voice, speak for 10 seconds, leave, measure audio pipeline init and cleanup.
5. MenuMain navigation: switch workspace/server/settings repeatedly, measure long tasks and React commit counts.
```

- [ ] **Step 2: Extend perf audit output**

Update `scripts/perf-audit.mjs` to print open registry items with ids/titles, not only counts. Keep the JSON report compact but add:

```js
registry: {
  issueCount: issues.length,
  byPriority: countBy(issues, "priority"),
  byStatus: countBy(issues, "status"),
  byArea: countBy(issues, "area"),
  openIssues: issues.filter((issue) => issue.status !== "done"),
},
```

- [ ] **Step 3: Run audit and verify**

Run:

```powershell
npm run audit:perf
```

Expected: command exits 0 and prints the open issue list.

- [ ] **Step 4: Commit**

```powershell
git add scripts/perf-audit.mjs docs/performance/playbook.md docs/performance/registry.md
git commit -m "Track open performance issues in audit"
```

---

### Task 2: Fix P0 TextChat Batch Upload First Paint

**Files:**
- Modify: `src/hooks/useTextChatAttachmentPickerFlow.js`
- Modify: `src/features/text-chat/TextChatController.jsx`
- Modify: `src/features/text-chat/TextChatView.jsx`
- Modify: `src/components/TextChatMediaPreview.jsx`
- Test: existing upload smoke scripts under `scripts/*upload*smoke*.mjs`

- [ ] **Step 1: Locate blocking work**

Inspect the file picker flow and identify synchronous loops that build previews, read metadata, or update parent chat state before the modal first appears.

- [ ] **Step 2: Add a cheap first-paint marker**

Add perf events around selection start, modal state set, first preview item hydrated, and upload queue commit. Use existing perf utilities instead of new dependencies.

- [ ] **Step 3: Split immediate UI from heavy preview hydration**

The first state update should only store file count, total size, and lightweight names. Image dimensions, thumbnails, media probing, compression, and descriptor building should run after the modal is visible.

- [ ] **Step 4: Keep input responsive**

Move per-file work into small chunks using existing async scheduling patterns in the repo. Avoid doing all selected files in one render path.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test:upload-ui
npm run lint:ci
npm run build:frontend
```

Expected: upload smoke passes, lint exits 0, build exits 0. Manual expected behavior: batch upload modal appears quickly with skeleton/light metadata, then previews hydrate.

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/useTextChatAttachmentPickerFlow.js src/features/text-chat/TextChatController.jsx src/features/text-chat/TextChatView.jsx src/components/TextChatMediaPreview.jsx
git commit -m "Defer text chat upload preview hydration"
```

---

### Task 3: Fix P0 TextChat Render Churn

**Files:**
- Modify: `src/components/TextChatMessageList.jsx`
- Modify: `src/features/text-chat/TextChatController.jsx`
- Modify: `src/features/text-chat/TextChatView.jsx`
- Modify: `src/features/text-chat/TextChatComposer.jsx`
- Modify: `src/features/text-chat/TextChatMediaPreview.jsx`
- Test: `scripts/perf-audit.mjs`, text chat smoke scripts.

- [ ] **Step 1: Preserve current user changes**

Before editing, run:

```powershell
git status --short
git diff -- src/components/TextChatMessageList.jsx src/css/TextChat.css
```

If these files still contain unrelated user changes, either incorporate them intentionally or ask before editing the same hunks.

- [ ] **Step 2: Map prop churn**

Use existing React Profiler hooks in `TextChatView.jsx` to identify which local actions cause `TextChatMessageList` commits.

- [ ] **Step 3: Stabilize list inputs**

Memoize derived message arrays, item render callbacks, selection maps, attachment maps, and context menu handlers at the lowest useful owner. Do not lift state higher.

- [ ] **Step 4: Isolate composer/media local state**

Ensure reply/edit/media preview state changes update composer/panels without forcing a full message list re-render unless the actual visible message set changes.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test:media-preview
npm run test:upload-ui
npm run audit:perf
npm run lint:ci
npm run build:frontend
```

Expected: smoke checks pass, perf audit still passes budgets, manual long chat interactions keep scroll/input responsive.

- [ ] **Step 6: Commit**

```powershell
git add src/components/TextChatMessageList.jsx src/features/text-chat/TextChatController.jsx src/features/text-chat/TextChatView.jsx src/features/text-chat/TextChatComposer.jsx src/features/text-chat/TextChatMediaPreview.jsx
git commit -m "Reduce text chat render churn"
```

---

### Task 4: Defer DeepFilterNet Runtime Until Real Voice Need

**Files:**
- Modify: `src/webrtc/processedMicrophoneTrack.js`
- Modify: `src/webrtc/livekitVoiceRoomClient.js`
- Modify: `src/hooks/useTextChatVoiceSpeech.js`
- Test: `src/webrtc/__tests__/processedMicrophoneTrack.test.mjs`
- Test: `src/webrtc/__tests__/voiceProcessingProfiles.test.mjs`

- [ ] **Step 1: Confirm current load behavior**

Inspect `processedMicrophoneTrack.js` and `@cc-livekit/audio-pipeline-plugin` usage. Confirm DeepFilter assets are only fetched when `createProcessedMicrophoneTrack` creates an AudioPipeline processor.

- [ ] **Step 2: Prevent preview-only eager initialization**

Audit calls to `ensureMicrophonePreview`, microphone menu opening, settings voice tab, and direct-call idle states. Opening settings should enumerate devices and meter only when needed; it should not initialize DeepFilter unless preview/test/voice capture requires processed audio.

- [ ] **Step 3: Keep fallback quality**

Keep fallback chain: DeepFilterNet -> browser WebRTC noise suppression -> off. Do not remove DeepFilter by default.

- [ ] **Step 4: Add tests**

Extend `processedMicrophoneTrack.test.mjs` with source assertions that DeepFilter public assets exist, RNNoise is not fetched, and fallback modes remain present.

- [ ] **Step 5: Verify**

Run:

```powershell
node --test src/webrtc/__tests__/processedMicrophoneTrack.test.mjs
node --test src/webrtc/__tests__/voiceProcessingProfiles.test.mjs
npm run build:frontend
npm run audit:perf
```

Expected: tests pass and build still emits DeepFilter asset, but voice-heavy runtime is not initialized before voice/recording paths.

- [ ] **Step 6: Commit**

```powershell
git add src/webrtc/processedMicrophoneTrack.js src/webrtc/livekitVoiceRoomClient.js src/hooks/useTextChatVoiceSpeech.js src/webrtc/__tests__/processedMicrophoneTrack.test.mjs src/webrtc/__tests__/voiceProcessingProfiles.test.mjs
git commit -m "Defer audio denoiser initialization"
```

---

### Task 5: Add Denoiser Quality Modes Without Removing DeepFilter

**Files:**
- Modify: `src/webrtc/processedMicrophoneTrack.js`
- Modify: `src/features/menu-main/useMenuMainVoiceProcessing.js`
- Modify: `src/components/MenuSettingsPanels.jsx`
- Modify: `src/features/menu-main/MenuMainSettingsRenderer.jsx`
- Test: `src/webrtc/__tests__/processedMicrophoneTrack.test.mjs`

- [ ] **Step 1: Define product modes**

Use three user-facing modes:

```txt
Best quality: DeepFilterNet, strongest CPU/network-independent denoise.
Balanced: browser WebRTC noise suppression, lighter and usually good enough.
Off: raw microphone path for troubleshooting.
```

- [ ] **Step 2: Keep profile tuning**

Do not "simplify" `deepfilter.wasm`. Instead tune config by profile through existing `attenLimDb` and `postFilterBeta` values.

- [ ] **Step 3: Expose mode clearly in settings**

Show the mode in voice/video settings and keep profile labels separate from denoiser engine choice.

- [ ] **Step 4: Verify**

Run:

```powershell
node --test src/webrtc/__tests__/processedMicrophoneTrack.test.mjs
npm run lint:ci
npm run build:frontend
```

Expected: tests pass, settings build, and selected mode persists.

- [ ] **Step 5: Commit**

```powershell
git add src/webrtc/processedMicrophoneTrack.js src/features/menu-main/useMenuMainVoiceProcessing.js src/components/MenuSettingsPanels.jsx src/features/menu-main/MenuMainSettingsRenderer.jsx src/webrtc/__tests__/processedMicrophoneTrack.test.mjs
git commit -m "Add selectable audio denoiser modes"
```

---

### Task 6: Split MenuMain Hot State Into Smaller Islands

**Files:**
- Modify: `src/features/menu-main/MenuMainController.jsx`
- Modify: existing hooks under `src/features/menu-main/useMenuMain*.js`
- Create if needed: focused hooks under `src/features/menu-main/`
- Test: affected smoke scripts under `scripts/*smoke*.mjs`

- [ ] **Step 1: Identify one state island**

Start with the least risky island, such as profile/audio device menus, QR scanner, or notification sounds. Do not split every concern at once.

- [ ] **Step 2: Move state and callbacks into a hook**

The hook should own only its state, stable callbacks, and side effects. It should return primitive values and stable handlers.

- [ ] **Step 3: Memoize component boundary**

Keep `MenuMainProfilePanelSlot.jsx` and related panel props stable so unrelated workspace changes do not rerender profile/audio UI.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run lint:ci
npm run build:frontend
npm run audit:perf
```

Manual expected behavior: server switching, settings opening, mic/sound menu, profile controls still work.

- [ ] **Step 5: Commit**

```powershell
git add src/features/menu-main/MenuMainController.jsx src/features/menu-main
git commit -m "Isolate menu main state island"
```

---

### Task 7: Reduce Early Bundle And Asset Weight

**Files:**
- Modify: `vite.renderer.config.mjs`
- Modify: lazy imports in `src/features/menu-main/MenuMainController.jsx`
- Modify: asset references under `public/`
- Modify: `scripts/audit-public-assets.mjs`

- [ ] **Step 1: Separate app-critical and rare paths**

Lazy-load settings renderer, heavy voice room UI, direct-call overlays, map/location UI, and media-heavy modals only when opened.

- [ ] **Step 2: Compress or replace huge static video**

Target `public/video/GoldenDustGlow2.mp4` first. Produce a smaller asset variant or defer loading it until auth screen needs it.

- [ ] **Step 3: Add asset budget warnings**

Update `scripts/audit-public-assets.mjs` so files above agreed thresholds are explicit warnings, not just a table.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run build:frontend
npm run audit:public-assets
npm run audit:perf
```

Expected: total eager JS/CSS moves down or stays stable, no new chunk load errors, huge assets are either justified or reduced.

- [ ] **Step 5: Commit**

```powershell
git add vite.renderer.config.mjs src/features/menu-main/MenuMainController.jsx scripts/audit-public-assets.mjs public
git commit -m "Reduce early renderer and asset weight"
```

---

### Task 8: Automate Release Smoke Evidence

**Files:**
- Modify: `docs/release/production-checklist.md`
- Create: `scripts/release-smoke.mjs`
- Create: optional smoke helpers under `scripts/`

- [ ] **Step 1: Encode endpoint checks**

Create a release smoke script that checks:

```txt
https://lanaya.space/
https://lanaya.space/api/ping
POST https://lanaya.space/chatHub/negotiate?negotiateVersion=1
POST https://lanaya.space/voiceHub/negotiate?negotiateVersion=1
```

Expected: frontend 200, ping ok, negotiate non-5xx.

- [ ] **Step 2: Keep auth-required checks explicit**

The script should report 401 for unauthenticated SignalR negotiate as acceptable, because it proves endpoint is reachable and auth is enforcing.

- [ ] **Step 3: Add command to checklist**

Add `node ./scripts/release-smoke.mjs` to `docs/release/production-checklist.md`.

- [ ] **Step 4: Verify**

Run:

```powershell
node ./scripts/release-smoke.mjs
npm run check:encoding
npm run lint:ci
```

Expected: release smoke exits 0, encoding and lint pass.

- [ ] **Step 5: Commit**

```powershell
git add scripts/release-smoke.mjs docs/release/production-checklist.md
git commit -m "Add production release smoke script"
```

---

## Execution Order

1. Task 1: make performance issues visible.
2. Task 2: fix the highest user-visible P0 upload delay.
3. Task 3: fix TextChat rerender churn while TextChat context is warm.
4. Task 4: defer DeepFilter/runtime initialization.
5. Task 5: add quality modes without downgrading default audio.
6. Task 6: split MenuMain state in small safe passes.
7. Task 7: reduce payload and asset weight.
8. Task 8: make release smoke reproducible.

## Release Policy

- Do this on `dev` or a `codex/production-hardening-*` branch first.
- Push to `master` only after checks and manual smoke pass.
- Do not mix unrelated TextChat CSS/message-list edits into the same commits unless they are part of the active TextChat tasks.


# Personal Chat Upload Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `andrey1689123@gmail.com` a `30 GB` chat file upload limit without changing backend limits for other users.

**Architecture:** Keep backend enforcement in `ChatFilesController` and derive request/body/quota limits from the authenticated user's persisted email. Raise frontend preflight limits to `30 GB` so the personal account can actually select large files.

**Tech Stack:** ASP.NET Core 8, EF Core, xUnit, Electron, React/Vite, Node test runner.

---

### Task 1: Backend Personal Limit

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/ChatFilesController.cs`
- Modify: `BackNoDiscord/BackNoDiscord/Program.cs`
- Create: `BackNoDiscord/BackNoDiscord/Services/ChatFileUploadLimitPolicy.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Controllers/ChatFilesControllerTests.cs`

- [x] Add focused tests that call the controller's limit resolver for personal and non-personal users.
- [x] Make the upload action load the current user email before resolving limits.
- [x] Add a private resolver that returns `30 GB` max file and storage quota for `andrey1689123@gmail.com`.
- [x] Raise the global ASP.NET Core request body limit to at least `30 GB` plus multipart overhead.
- [x] Run `dotnet test BackNoDiscord\\BackNoDiscord.Tests\\BackNoDiscord.Tests.csproj --configuration Release --filter ChatFilesControllerTests`.

### Task 2: Frontend Chat File Limit

**Files:**
- Modify: `src/utils/textChatModel.js`
- Modify: `src/main.js`
- Test: `src/utils/__tests__/chatFileSizePolicy.test.mjs`

- [x] Update renderer chat upload constants to `30 * 1024 * 1024 * 1024` and label `30 ГБ`.
- [x] Update Electron attachment picker/download byte cap to `30 * 1024 * 1024 * 1024`.
- [x] Update source policy test expectations.
- [x] Run `node --test src/utils/__tests__/chatFileSizePolicy.test.mjs`.

### Task 3: Validation And Push

**Files:**
- Validate repository state and requested commands.
- Modify: `infra/nginx/lanaya.space.conf`
- Modify: `infra/nginx/lanaya.space.load-balanced.conf`
- Modify: `infra/nginx/lanaya.space.bootstrap.conf`

- [x] Raise nginx `client_max_body_size` to `31G` so production forwards `30 GB` uploads plus multipart overhead.
- [x] Run `npm run lint:ci`.
- [x] Run `npm run check:encoding`.
- [x] Run `npm run build:frontend`.
- [x] Run `dotnet build BackNoDiscord\\BackNoDiscord\\BackNoDiscord.csproj --configuration Release`.
- [x] Run `dotnet test BackNoDiscord\\BackNoDiscord.Tests\\BackNoDiscord.Tests.csproj --configuration Release`.
- [x] Commit implementation.
- [x] Push committed changes to `origin master`.

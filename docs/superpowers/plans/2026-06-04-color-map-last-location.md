# Color Map Last Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the world map colorful and keep location-sharing users visible at their last saved point when they are offline.

**Architecture:** Backend `/api/user/locations` will return opt-in users with saved coordinates and presence-derived status. Frontend map tiles will switch from dark CARTO tiles to colorful OSM tiles and CSS will stop darkening the tile pane.

**Tech Stack:** ASP.NET Core 8, EF Core, React, Leaflet, Vite, Node test scripts.

---

### Task 1: Backend Last Location Feed

**Files:**
- Modify: `BackNoDiscord/BackNoDiscord/Controllers/UserController.cs`
- Test: `BackNoDiscord/BackNoDiscord.Tests/Controllers/UserControllerTests.cs`

- [ ] Write a failing test that creates an offline user with location sharing enabled and asserts `/api/user/locations` returns latitude, longitude, `kind: "offline"`, and display identity fields.
- [ ] Run `dotnet test BackNoDiscord\\BackNoDiscord.Tests\\BackNoDiscord.Tests.csproj --configuration Release --filter UserControllerTests`.
- [ ] Implement `GetVisibleUserLocations` by querying users with enabled sharing and saved coordinates, then mapping presence through `UserPresenceService`.
- [ ] Re-run the targeted backend test.

### Task 2: Colorful Frontend Map

**Files:**
- Modify: `src/components/FriendsWorkspace.jsx`
- Modify: `src/css/MenuMainShell.css`
- Test: `src/components/__tests__/securityUiPolicies.test.mjs`

- [ ] Write a failing source-policy test that rejects `dark_nolabels`, requires `tile.openstreetmap.org`, and rejects tile-pane filters.
- [ ] Run the relevant Node test file.
- [ ] Change `LANAYA_WORLD_BASE_TILE_URL` and attribution to the colorful OpenStreetMap tile source.
- [ ] Remove the tile-pane and base-tile CSS filters so the map is not blackened.
- [ ] Re-run the source-policy test.

### Task 3: Verification

**Files:**
- No additional files.

- [ ] Run `npm run lint:ci`.
- [ ] Run `npm run check:encoding`.
- [ ] Run `npm run build:frontend`.
- [ ] Run `dotnet test BackNoDiscord\\BackNoDiscord.Tests\\BackNoDiscord.Tests.csproj --configuration Release --filter UserControllerTests`.

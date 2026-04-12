# Project Context for Codex

## Project
- Repository: NoDiscord / Tend messenger.
- Frontend: Electron + React + Vite.
- Backend: ASP.NET Core 8, SignalR, PostgreSQL via Npgsql/EF Core.
- Realtime voice/video: LiveKit client on frontend plus backend voice hub integration.
- Production domain: `https://tendsec.ru`.

## Branching and Deploy
- `dev` is the primary validation branch.
- `master` is the release/deployment branch.
- Production deploy must run only from `master`.
- GitHub remote is `origin` at `https://github.com/Metamephetamin/NoDiscord.git`.
- There is also a `gitflic` remote; do not assume it is the production deploy remote.
- GitHub Actions workflow `Deploy` handles production deployment from `master`.
- Deploy health endpoint: `https://tendsec.ru/api/ping`.

## Important Commands
- Frontend lint: `npm run lint:ci`
- Encoding guard: `npm run check:encoding`
- Frontend build: `npm run build:frontend`
- Backend build: `dotnet build BackNoDiscord\BackNoDiscord\BackNoDiscord.csproj --configuration Release`
- Backend tests: `dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release`

## Encoding
- Russian UI text must stay valid UTF-8.
- Do not introduce CP1251/UTF-8 mojibake, broken emoji/icon text, or placeholder text like `????`.
- `scripts/check-encoding.mjs` is the guard for this and is also run during deploy.
- If text becomes mojibake, fix the source text instead of hiding the check.

## Current Architecture Notes
- `src/components/MenuMain.jsx` is a thin wrapper around `src/features/menu-main/MenuMainContainer.jsx`.
- Main menu logic lives mostly in `src/features/menu-main/MenuMainController.jsx` and related feature components.
- `src/components/TextChat.jsx` is a thin wrapper around `src/features/text-chat/TextChatController.jsx`.
- Text chat UI is split across components like `TextChatMessageList`, `TextChatComposer`, `TextChatPanels`, and `TextChatMediaPreview`.
- Continue splitting very large files into smaller focused components/hooks when touching them.

## Security and Messaging
- Client-side E2EE was removed.
- Do not reintroduce client E2EE unless explicitly requested.
- Keep server-side/security-at-rest style protection where already implemented.
- Old encrypted message/attachment fallback text may still exist for legacy data.

## Mobile Voice UX
- Mobile voice toolbar should stay one row, icon-only, and close to the bottom mobile tab bar.
- Mobile voice stage should show local camera/screen preview and remote stream preview inline.
- iPhone Safari screen share should degrade gracefully instead of trying to force unsupported capture.
- Voice join should avoid race conditions from repeated taps.

## Media/Profile UX
- Avatar, profile background, and server icon support image/GIF/MP4 where the render path allows it.
- Media framing editor is used for avatar/profile background/server icon crops.
- Profile status and redundant avatar-change labels/buttons were intentionally simplified.

## Working Rules
- Do not revert user changes unless explicitly asked.
- Prefer small, targeted commits with clear messages.
- Before pushing, run the relevant checks for touched areas.
- If the user asks to deploy, push to `origin master` and watch GitHub Actions Deploy plus health checks.
- Keep answers to the user in Russian unless they ask otherwise.

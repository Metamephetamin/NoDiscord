# Project

Repository: NoDiscord / Tend messenger
Frontend: Electron + React + Vite
Backend: ASP.NET Core 8 + SignalR
Database: PostgreSQL via Npgsql / EF Core
Realtime: LiveKit client on frontend + backend voice hub integration
Production domain: https://tendsec.ru

# Structure

- src/components/MenuMain.jsx is a thin wrapper around src/features/menu-main/MenuMainContainer.jsx
- Main menu logic lives mostly in src/features/menu-main/MenuMainController.jsx and related feature components
- src/components/TextChat.jsx is a thin wrapper around src/features/text-chat/TextChatController.jsx
- Text chat UI is split across:
  - TextChatMessageList
  - TextChatComposer
  - TextChatPanels
  - TextChatMediaPreview

# Commands

Frontend:
- npm run lint:ci
- npm run check:encoding
- npm run build:frontend

Backend:
- dotnet build BackNoDiscord\BackNoDiscord\BackNoDiscord.csproj --configuration Release
- dotnet test BackNoDiscord\BackNoDiscord.Tests\BackNoDiscord.Tests.csproj --configuration Release

# Branching and deploy

- dev = main validation branch
- master = release / production branch
- production deploy only from master
- GitHub remote origin = https://github.com/Metamephetamin/NoDiscord.git
- gitflic is not the production deploy remote
- GitHub Actions workflow Deploy handles production deployment from master
- health endpoint: https://tendsec.ru/api/ping

Deploy rules:
- never deploy from dev;
- do not push risky unverified changes directly to production;
- if deploy is requested:
  1. ensure changes are committed;
  2. push to origin master;
  3. monitor Deploy workflow;
  4. verify health endpoint.

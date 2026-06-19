# Lanaya
 Lanaya, - это desktop/web-приложение для общения в стиле Discord + Telegram

Проект состоит из backend на ASP.NET Core и frontend на React + Electron. Backend отвечает за API, авторизацию, хранение данных, SignalR-хабы и интеграции. Frontend работает как Electron-приложение и как Vite-renderer.

## Как запустить проект

### Требования

- Node.js `22.x`
- npm `10.x`
- .NET SDK `8.x`
- PostgreSQL
- Docker, для LiveKit

### Установка зависимостей

```bash
npm install
dotnet restore BackNoDiscord/BackNoDiscord.sln
```

### Настройка переменных окружения

Создайте файл `.env` в корне проекта на основе `.env.example`.

Минимально нужны:

```env
ConnectionStrings__DefaultConnection=Host=localhost;Port=5432;Database=voiceapp;Username=postgres;Password=CHANGE_ME
Jwt__Issuer=BackNoDiscord
Jwt__Audience=BackNoDiscordUsers
Jwt__Key=CHANGE_ME_GENERATE_64_RANDOM_CHARS
Jwt__AccessTokenMinutes=15
Jwt__RefreshTokenDays=14
Crypto__Key=base64:CHANGE_ME_GENERATE_32_RANDOM_BYTES_BASE64
Cors__AllowedOrigins=http://localhost:5173
ND_PUBLIC_APP_URL=http://localhost:5173
ND_API_URL=http://localhost:5277/api
Storage__Root=./storage
```

Для дополнительных возможностей можно настроить:

- `Redis__ConnectionString` - SignalR backplane для нескольких backend-инстансов.
- `LiveKit__Url`, `LiveKit__ApiKey`, `LiveKit__ApiSecret` - голосовые комнаты через LiveKit.
- `YooKassa__ShopId`, `YooKassa__SecretKey`, `YooKassa__ReturnUrl` - платежи.
- `Spotify__ClientId`, `GitHub__ClientId`, `BattleNet__ClientId`, `Steam__ApiKey` - внешние интеграции.
- `Email__Smtp__*` - отправка кодов подтверждения.
- `SpeechPunctuation__EnableOllama`, `SpeechPunctuation__OllamaModel`, `SpeechPunctuation__OllamaGenerateEndpoint` - AI-пунктуация через Ollama.

### Запуск backend

```bash
npm run start:backend
```

или напрямую:

```bash
dotnet run --project BackNoDiscord/BackNoDiscord/BackNoDiscord.csproj
```

В режиме разработки Swagger доступен по адресу:

```text
/swagger
```

### Запуск frontend

```bash
npm run dev:frontend
```

### Запуск Electron-приложения

```bash
npm start
```

### Запуск LiveKit

```bash
npm run start:livekit
```

или через Docker:

```bash
npm run start:livekit:docker
```

### Проверки

```bash
npm run lint
npm run build:frontend
dotnet test BackNoDiscord/BackNoDiscord.Tests/BackNoDiscord.Tests.csproj
```

Полный release-check:

```bash
npm run check:release
```

## Стек технологий

### Backend

- C# / .NET 8
- ASP.NET Core Web API
- Entity Framework Core
- PostgreSQL через `Npgsql.EntityFrameworkCore.PostgreSQL`
- JWT Bearer Authentication
- SignalR + MessagePack
- Redis backplane для SignalR, опционально
- Swagger / Swashbuckle
- MailKit для email
- ImageSharp для обработки изображений
- WebPush для push-уведомлений
- YooKassa API для donation-платежей
- LiveKit для voice-сессий

### Frontend

- React 19
- Vite
- Electron Forge
- React Router
- Microsoft SignalR client
- LiveKit client
- Leaflet
- CSS modules/обычные CSS-файлы по компонентам

### AI

- Ollama local inference endpoint `/api/generate`
- Модель по умолчанию: `qwen2.5:3b`
- MyMemory Translate API для перевода текста
- Rule-based fallback для пунктуации, если AI недоступен или дал неподходящий результат

## Архитектура

### Структура проекта

```text
.
├── BackNoDiscord/
│   ├── BackNoDiscord/                 # ASP.NET Core backend
│   │   ├── Controllers/               # REST API controllers
│   │   ├── Services/                  # бизнес-логика
│   │   ├── Security/                  # политики безопасности, лимитеры, проверки
│   │   ├── Observability/             # диагностика, health, метрики
│   │   ├── Infrastructure/            # БД, storage, schema initialization
│   │   ├── Realtime/                  # realtime event contracts
│   │   ├── ChatHub.cs                 # SignalR text/chat hub
│   │   ├── VoiceHub.cs                # SignalR voice hub
│   │   ├── DbContext.cs               # EF Core модели и таблицы
│   │   └── Program.cs                 # DI, middleware, auth, rate limits, routes
│   ├── BackNoDiscord.Tests/           # backend unit/integration tests
│   ├── BackNoDiscord.AppHost/         # app host
│   └── BackNoDiscord.ServiceDefaults/ # service defaults
├── src/
│   ├── components/                    # React UI
│   ├── features/                      # крупные frontend-фичи
│   ├── hooks/                         # React hooks
│   ├── utils/                         # frontend бизнес-утилиты
│   ├── SignalR/                       # SignalR-клиенты
│   ├── webrtc/                        # voice/WebRTC/LiveKit logic
│   ├── config/                        # runtime config
│   ├── livekit/                       # LiveKit configs
│   ├── main.js                        # Electron main process
│   ├── preload.js                     # Electron preload
│   └── renderer.jsx                   # renderer entry
├── scripts/                           # build, smoke, audit, load scripts
├── public/
├── assets/
└── package.json
```

### Основные паттерны

- Controller-Service pattern: контроллеры принимают HTTP-запросы, а бизнес-логика вынесена в сервисы.
- Dependency Injection: сервисы регистрируются в `Program.cs` и внедряются через конструкторы.
- Repository через EF Core DbContext: доступ к PostgreSQL идет через `AppDbContext` и `DbSet`.
- Policy-based security: отдельные классы для CORS, upload policies, hub token policies, permissions и spam limiting.
- Realtime boundary: REST API используется для команд и загрузок, SignalR - для realtime-событий чата и голоса.
- Hosted services: фоновые задачи чистят загруженные файлы и чинят metadata.
- Fallback-first AI: AI улучшает результат, но приложение не ломается без модели.

### Почему выбран такой стек

ASP.NET Core подходит для backend с авторизацией, realtime-хабами, строгой типизацией и хорошей производительностью. PostgreSQL выбран как надежное основное хранилище для пользователей, сообщений, ролей, логов и статистики. SignalR хорошо ложится на чатовые события и presence. Electron + React дают один общий UI для desktop и web-сценариев. LiveKit вынесен отдельно, потому что голос и медиа лучше держать в специализированной инфраструктуре.

## Реализация API

Backend построен как REST API с JWT-авторизацией. Основной префикс - `/api`. Для realtime используются `/chatHub` и `/voiceHub`.

### Основные группы эндпоинтов

| Группа | Эндпоинты | Назначение |
| --- | --- | --- |
| Health | `GET /api/ping`, `GET /api/health/live`, `GET /api/health/ready` | Проверка доступности сервиса |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me` | Регистрация, вход, refresh tokens, профиль текущего пользователя |
| Auth security | `POST /api/auth/totp/setup`, `POST /api/auth/totp/verify`, `POST /api/auth/totp/disable`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}` | 2FA и управление сессиями |
| QR login | `POST /api/auth/qr-login/session`, `GET /api/auth/qr-login/session/{id}`, `POST /api/auth/qr-login/approve` | Вход по QR |
| Friends | `GET /api/friends`, `GET /api/friends/search`, `POST /api/friends/add`, `GET /api/friends/requests`, `POST /api/friends/requests/{id}/accept` | Друзья, заявки, блокировки |
| Conversations | `GET /api/conversations`, `POST /api/conversations`, `PATCH /api/conversations/{id}`, `POST /api/conversations/{id}/members`, `POST /api/conversations/{id}/leave` | Групповые диалоги |
| Chat messages | `GET /api/chats/{chatId}/messages`, `GET /api/chats/{chatId}/messages/search`, `POST /api/chats/{chatId}/messages/outbox` | История, поиск и отправка сообщений |
| Chat files | `POST /api/chat-files/upload`, `GET /chat-files/{fileName}` | Загрузка и выдача вложений |
| Servers/invites | `POST /api/server-invites/create`, `POST /api/server-invites/redeem`, `GET /api/server-invites/server/{serverId}`, `GET /api/server-invites/my-servers` | Серверы, приглашения, роли |
| Voice | `POST /api/voice/join`, `POST /api/voice/leave`, `POST /api/voice/livekit-session` | Голосовые комнаты и LiveKit-токены |
| AI speech | `POST /api/speech/punctuate` | Восстановление пунктуации в тексте |
| Translation | `POST /api/translate` | Перевод текста |
| Moderation | `POST /api/moderation/reports`, `GET /api/moderation/servers/{serverId}/reports`, `PATCH /api/moderation/reports/{id}/status` | Жалобы и модерация |
| Admin | `GET /api/admin/users`, `GET /api/admin/security-overview`, `POST /api/admin/users/{id}/ban` | Админ-панель и безопасность |
| Diagnostics | `POST /api/diagnostics/client-events` | Клиентские diagnostic events |
| Public stats | `GET /api/public/stats` | Публичная статистика проекта |

### Примеры запросов

#### Регистрация

```http
POST /api/auth/register
Content-Type: application/json

{
  "firstName": "Andrey",
  "lastName": "Ivanov",
  "nickname": "metamephetamin",
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

Пример ответа:

```json
{
  "accessToken": "jwt_access_token",
  "refreshToken": "refresh_token",
  "user": {
    "id": 1,
    "nickname": "metamephetamin"
  }
}
```

#### Вход

```http
POST /api/auth/login
Content-Type: application/json

{
  "login": "user@example.com",
  "password": "StrongPassword123!"
}
```

#### Получение сообщений

```http
GET /api/chats/server:main::channel:general/messages?limit=50
Authorization: Bearer <access_token>
```

Пример ответа:

```json
[
  {
    "id": 120,
    "channelId": "server:main::channel:general",
    "content": "Привет!",
    "authorUserId": "1",
    "timestamp": "2026-06-19T12:00:00Z"
  }
]
```

#### Отправка сообщения через HTTP outbox

```http
POST /api/chats/server:main::channel:general/messages/outbox
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "clientMessageId": "msg_123",
  "content": "Привет всем",
  "attachments": []
}
```

#### Загрузка файла

```http
POST /api/chat-files/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

file=<binary>
channelId=server:main::channel:general
```

Пример ответа:

```json
{
  "fileName": "chat-file-...",
  "url": "/chat-files/chat-file-...",
  "size": 1048576,
  "contentType": "image/png"
}
```

#### AI-пунктуация

```http
POST /api/speech/punctuate
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "text": "ну да конечно я понял что ты хотел"
}
```

Пример ответа:

```json
{
  "text": "Ну, да, конечно, я понял, что ты хотел.",
  "provider": "ollama",
  "usedModel": true
}
```

Если модель недоступна:

```json
{
  "text": "Ну, да, конечно, я понял, что ты хотел.",
  "provider": "rule-based",
  "usedModel": false
}
```

#### Перевод текста

```http
POST /api/translate
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "text": "Привет, как дела?",
  "targetLanguage": "en"
}
```

Пример ответа:

```json
{
  "text": "Hello, how are you?",
  "sourceLanguage": "ru",
  "targetLanguage": "en",
  "provider": "mymemory"
}
```

### Валидация и обработка ошибок

- Для пустого текста AI-эндпоинты возвращают успешный ответ с `provider = "empty"`.
- Для слишком длинного текста используется `400 Bad Request`.
- Если сервис перевода недоступен, API возвращает `502 Bad Gateway`.
- При превышении rate limit возвращается `429 Too Many Requests`, при возможности с заголовком `Retry-After`.
- Защищенные endpoints требуют JWT Bearer token.
- Заблокированный аккаунт получает `403 Forbidden`.
- Неверные или запрещенные операции с файлами, ролями и правами возвращают 4xx-статусы.
- В production добавляются security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.

## AI-интеграция

### Пунктуация речи

Главная AI-функция - `POST /api/speech/punctuate`. Она нужна для текстов, которые получаются из речи или диктовки: пользователь говорит фразу без знаков препинания, backend восстанавливает запятые, точки, вопросы, восклицания и капитализацию.

Пайплайн:

1. Контроллер принимает текст и проверяет длину.
2. `SpeechPunctuationService` нормализует вход.
3. Если текст подходит для модели, сервис отправляет prompt в Ollama.
4. Ответ модели проверяется: нельзя менять смысл, порядок слов, ссылки, упоминания, emoji и сленг.
5. Если ответ безопасный, возвращается модельный вариант.
6. Если Ollama недоступна, ответ пустой или не проходит проверку, применяется rule-based fallback.

Prompt для Ollama по смыслу такой:

```text
Ты редактор пунктуации русского текста.
Восстанови пропущенные знаки препинания.
Можно менять только пунктуацию, пробелы, заглавные буквы в начале предложений и минимальные опечатки.
Запрещено менять слова, порядок слов, смысл, сленг, мат, emoji, ссылки и упоминания.
Верни только исправленный текст без объяснений.
```

### Fallback

Fallback реализован на нескольких уровнях:

- Если `SpeechPunctuation__EnableOllama=false`, модель не вызывается.
- Если текст слишком короткий, не кириллический или похож на мусорный ввод, модель не вызывается.
- Если Ollama не отвечает, превышен timeout или очередь занята, сервис возвращает rule-based результат.
- Если модель поменяла количество токенов или слишком сильно изменила слова, ее ответ отклоняется.
- В `SpeechController` есть финальная страховка: при исключении возвращается исходный текст с `provider = "ollama-error"` и `usedModel = false`.

### Перевод

`POST /api/translate` использует `TextTranslationService`.

- Язык определяется простыми эвристиками по Unicode-диапазонам и символам.
- Поддерживаются `ru`, `en`, `es`, `de`, `fr`, `it`, `pt`, `tr`, `uk`, `ja`, `ko`, `zh`, `ar`.
- Если исходный и целевой языки совпали, внешний API не вызывается.
- Основной provider - MyMemory.
- Timeout ограничен настройкой `Translation:TimeoutSeconds`.

## Что сделано с помощью AI

В проекте AI использовался как помощник разработки, а не как единственная логика приложения.

С помощью AI удобно было делать:

- черновики backend-сервисов и контроллеров;
- генерацию тестовых сценариев для security, upload, auth и realtime-политик;
- рефакторинг больших React-компонентов на `features`, `hooks` и `utils`;
- составление regex/rule-based правил для пунктуации;
- черновики prompt для Ollama;
- smoke-тесты и policy-тесты для release-check;
- документацию и описание API.

Примеры промптов, которые можно было использовать в процессе:

```text
Сделай ASP.NET Core endpoint для восстановления пунктуации текста. Добавь JWT authorization, ограничение длины 4000 символов и безопасный fallback, если AI-сервис недоступен.
```

```text
Раздели логику отправки сообщений в React-чате на controller, view и утилиты. Сохрани текущий UX и добавь тесты на optimistic outbox.
```

```text
Проверь backend авторизацию и предложи policy-тесты для JWT, refresh tokens, 2FA, CORS и SignalR hub access.
```

```text
Напиши prompt для локальной модели, которая должна только восстановить пунктуацию русского текста и не менять смысл сообщения.
```

Что пришлось исправлять вручную:

- границы ответственности между контроллерами, сервисами и frontend hooks;
- edge cases для авторизации, банов, refresh tokens и QR-login;
- проверку AI-ответа, чтобы модель не переписывала пользовательский текст;
- лимиты загрузки файлов, квоты и безопасные имена файлов;
- CORS/CSP/security headers под production;
- UX в чатах, голосовых комнатах и настройках.

## Хранение данных

### Основная база

Основное хранилище - PostgreSQL. Доступ реализован через Entity Framework Core и `AppDbContext`.

В базе хранятся:

- пользователи и профили;
- refresh tokens и пользовательские сессии;
- сообщения чатов;
- read-state по каналам;
- вложения и metadata файлов;
- друзья, заявки и блокировки;
- групповые диалоги и участники;
- серверы, приглашения, роли и audit log;
- жалобы и действия модерации;
- push subscriptions;
- внешние интеграции;
- public stats.

### Логи

Есть два уровня логирования:

1. Обычные application logs ASP.NET Core через `ILogger`.
2. Серверный audit log в таблице `server_audit_logs`.

`AuditLogService` сохраняет:

- `serverId`
- `actorUserId`
- `actionType`
- `targetId`
- `metadataJson`
- `createdAt`

Metadata дополнительно санитизируется: ключи с `token`, `secret`, `password`, `cookie`, `authorization`, `auth`, `message`, `body`, `content` не записываются.

### Rate limiting

Rate limiting настроен в `Program.cs` через ASP.NET Core RateLimiter.

Используются fixed-window политики:

- `auth` - 8 запросов в минуту на path + IP.
- `email-send` - 6 запросов за 10 минут на IP.
- `email-verify` - 12 запросов за 10 минут на IP.
- `qr-login-poll` - 80 запросов в минуту на IP.
- `media-render` - 120 запросов в минуту на IP.
- `chat-upload` - 12 загрузок в минуту на IP.
- `client-diagnostics` - 30 запросов в минуту на IP.
- `donations` - 20 запросов в минуту на IP.

Для чата дополнительно есть `ChatSpamBurstLimiter`: максимум 12 сообщений за 10 секунд на пользователя. Состояние хранится in-memory в `ConcurrentDictionary`, старые записи очищаются.

### Файлы и квоты

Файлы хранятся в директории `Storage__Root`.

Backend создает отдельные каталоги:

- `avatars`
- `profile-backgrounds`
- `server-icons`
- `chat-files`

Metadata по chat-файлам хранится в таблице `chat_file_uploads`. `UserStorageQuotaService` считает использование по активным загрузкам, а `ChatFileCleanupHostedService` удаляет устаревшие или отвязанные файлы.

### Статистика

Публичная статистика доступна через:

```http
GET /api/public/stats
```

Она считается по данным из PostgreSQL. Также есть `ProductionMetrics` и `ProductionHealthService` для health/diagnostic сценариев.

## Безопасность

В проекте уже есть несколько важных защит:

- JWT access tokens и refresh tokens.
- TOTP/2FA.
- Управление активными сессиями.
- Бан аккаунта на уровне middleware.
- CORS policy через `FrontendOriginPolicy`.
- CSP и другие security headers.
- Проверка origin/token для SignalR hub access.
- Ограничение размера multipart upload.
- Санитизация имен файлов и идентификаторов.
- Квоты на пользовательское хранилище.
- Rate limiting для критичных endpoints.
- Санитизация diagnostic/audit metadata.
- Тесты на security policies.

## Тесты и качество

В проекте много проверок:

- backend tests в `BackNoDiscord.Tests`;
- frontend unit/policy tests через Node test runner;
- smoke-тесты для auth, chat, upload, voice;
- security policy tests;
- release gate `npm run check:release`;
- lint через ESLint;
- frontend build через Vite;
- performance/public assets audit.

Основной фокус качества backend:

- четкое разделение контроллеров и сервисов;
- отдельные security policies;
- явная обработка ошибок и статусы;
- ограничение опасных операций;
- тесты вокруг авторизации, файлов, модерации и realtime.

## RESTful-принципы

API в основном следует REST-подходу:

- `GET` используется для чтения;
- `POST` - для команд, создания сущностей и действий;
- `PATCH` - для частичного обновления;
- `DELETE` - для удаления или отзыва;
- ресурсы сгруппированы по доменам: `auth`, `friends`, `conversations`, `chats`, `server-invites`, `moderation`, `admin`.

Для realtime-части REST не используется намеренно: чатовые и голосовые события идут через SignalR, потому что там важны низкая задержка и постоянное соединение.

## Фронтенд

Frontend не просто демонстрационный:

- авторизация и экраны аккаунта;
- рабочее пространство друзей;
- серверы и каналы;
- текстовый чат;
- вложения и preview медиа;
- голосовые комнаты;
- screen share;
- настройки профиля;
- модерация;
- QR-login;
- адаптивные mobile-компоненты;
- интеграция с backend API через `authFetch`;
- realtime через SignalR;
- LiveKit/WebRTC-клиент для голоса.

## Итоговые решения

Главное решение проекта - не пытаться держать весь realtime и media-функционал в одном REST API. REST используется для надежных команд и данных, SignalR - для событий, LiveKit - для медиа, PostgreSQL - для постоянного состояния, а AI встроен как дополнительный слой, который не ломает основной сценарий при отказе.

Такой подход делает проект ближе к production-архитектуре: есть авторизация, rate limiting, хранение, background jobs, health checks, security headers, тесты и fallback-механизмы.

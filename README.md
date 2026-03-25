# NoDiscord

## Безопасная настройка локального запуска

Секреты не должны храниться в git. Для локальной разработки:

1. Скопируйте `.env.example` в `.env`.
2. Заполните своими значениями:
   - `ConnectionStrings__DefaultConnection`
   - `Jwt__Key`
   - `Crypto__Key`
   - `LIVEKIT_KEYS` при необходимости
3. Для production-конфига backend используйте шаблон `BackNoDiscord/BackNoDiscord/appsettings.Production.json.example` и сохраните реальный файл локально как `appsettings.Production.json`.

Рекомендуется хранить секреты:

- в `GitHub Secrets`
- в `GitLab CI/CD Variables`
- или в локальном `.env`, который не коммитится

## Локальный запуск

### Backend

```powershell
npm run start:backend
```

Скрипт загрузит переменные из `.env`, если файл существует.

### Frontend / Electron

```powershell
npm start
```

### LiveKit без Docker

Если нужен локальный LiveKit:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-livekit.ps1
```

`LIVEKIT_KEYS` можно передать через `.env` или переменные окружения. Файл `src/livekit/livekit-keys.txt` можно держать только локально, но он больше не должен попадать в git.

## Что нельзя коммитить

Не добавляйте в репозиторий:

- `.env`
- `appsettings.Production.json`
- сертификаты и приватные ключи
- `src/livekit/livekit-keys.txt`
- runtime-данные из `App_Data`
- загруженные файлы и пользовательские аватары

## Важно

Если секреты уже были закоммичены раньше, их нужно считать скомпрометированными:

1. Выпустить новые JWT/Crypto ключи
2. Сменить пароль БД
3. Пересоздать LiveKit ключи
4. При необходимости отдельно переписать git history

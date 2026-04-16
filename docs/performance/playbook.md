# Performance Playbook

## Цель первой волны

Найти и зарегистрировать основные лаги в `Electron Windows`, затем закрывать их по приоритету с обязательным сравнением `baseline -> post-fix`.

## Команды

```powershell
npm run build:frontend
npm run audit:perf
npm run lint:ci
npm run check:encoding
```

Для packaged-проверки:

```powershell
npm run package:prod
```

## Где смотреть perf данные

В dev-режиме доступен глобальный буфер:

```js
window.__TEND_PERF__.getEvents()
window.__TEND_PERF__.clear()
```

События содержат:

```js
{
  traceId,
  area,
  action,
  startedAt,
  durationMs,
  longTaskCount,
  route,
  extra
}
```

## Сценарии обязательной ручной проверки

1. Cold start приложения.
2. Warm reopen.
3. Вход в `MenuMain`.
4. Переключение workspace `friends <-> servers`.
5. Переключение сервера и текстового канала.
6. Открытие настроек.
7. Открытие длинного текстового чата.
8. Скролл длинной переписки.
9. Выбор `1 / 3 / 10` изображений через file picker.
10. Открытие media preview.
11. Join / leave voice channel.

## Как регистрировать проблему

1. Повторить сценарий не меньше `3` раз.
2. Снять `window.__TEND_PERF__.getEvents()`.
3. Проверить bundle snapshot через `npm run audit:perf`.
4. Добавить запись в `registry.md`.
5. Обновить `baseline.md`.

## Что считать проблемой

- Любой `longtask > 50 ms` должен быть виден в логах.
- Любой повторяемый UI freeze `> 100 ms` в частом сценарии должен попасть в реестр.
- Любой повторяемый фриз `> 500 ms` сразу идёт как `P0`.
- Любой eager-heavy bundle/chunk, влияющий на startup или первый рендер, идёт в реестр даже без визуального фриза.

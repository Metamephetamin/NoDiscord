# Performance Baseline

Эта таблица нужна для замеров `до / после` по одной и той же методике в `Electron Windows`.

## Bundle snapshot

Текущее известное baseline-состояние по сборке:

| Метрика | Значение | Источник |
| --- | --- | --- |
| Основной renderer chunk | `~1.27 MB` minified | `npm run build:frontend` |
| `noise_suppression` chunk | `~4.82 MB` minified | `npm run build:frontend` |
| CSS bundle | `~235 KB` minified | `npm run build:frontend` |

## Runtime scenario matrix

Заполнять повторяемыми ручными замерами и событиями из `window.__TEND_PERF__`.

| Сценарий | Baseline | Цель | Статус |
| --- | --- | --- | --- |
| Cold start приложения | `pending manual audit` | `<= 200 ms` до первой локальной интерактивности после появления окна | open |
| Warm reopen | `pending manual audit` | быстрее cold start и без фриза `> 100 ms` | open |
| Вход в main workspace | `pending manual audit` | `<= 200 ms` | open |
| Переключение серверов и каналов | `pending manual audit` | `<= 200 ms` | open |
| Открытие большого текстового чата | `pending manual audit` | без long task `> 100 ms` | open |
| Быстрый скролл длинной переписки | `pending manual audit` | без визуальных рывков и без фриза `> 100 ms` | open |
| Выбор `1/3/10` изображений | `batch upload lag reported` | `<= 150 ms` до первого видимого состояния | in_progress |
| Открытие media preview | `pending manual audit` | `<= 150 ms` | open |
| Открытие настроек/профиля | `pending manual audit` | `<= 150 ms` | open |
| Join voice room | `pending manual audit` | без блокировки UI и с измеримым async trace | open |
| Leave voice room | `pending manual audit` | быстрый возврат UI без рывков | open |

## Что уже инструментировано

- Dev-only renderer perf buffer `window.__TEND_PERF__`
- `PerformanceObserver` для `longtask > 50 ms`
- Electron main buffer через `window.electronPerf`
- Startup traces для renderer и Electron main
- Route hydration trace
- MenuMain traces: workspace/server/channel/settings
- TextChat traces: queue files, send message, media preview, scroll-to-message
- Voice traces: join / leave voice channel

## Post-fix update template

После каждого заметного фикса обновлять:

| Дата | ID проблемы | Было | Стало | Комментарий |
| --- | --- | --- | --- | --- |
| `YYYY-MM-DD` | `PERF-XXX` | `...` | `...` | `что изменилось` |

## 2026-05-13 release budget snapshot

Source: `npm run build:frontend` + `npm run audit:perf`.

| Metric | Current | Budget | Status |
| --- | --- | --- | --- |
| MenuMain JS chunk | `878.26 KB` | `<= 950 KB` | pass |
| LiveKit JS chunk | `471.49 KB` | `<= 540 KB` | pass |
| Voice JS chunk | `105.19 KB` | `<= 140 KB` | pass |
| MenuMain CSS chunk | `596.31 KB` | `<= 660 KB` | pass |
| Text chat virtualization threshold | `160 messages` | `>= 50 messages` | pass |
| Text chat media prefetch image limit | `4 images` | `<= 4 images` | pass |
| Batch upload initial render | `12 items` | `<= 12 items` | pass |
| Batch upload render chunk | `18 items` | `<= 24 items` | pass |
| Voice join optimistic UI | before client/media await | required | pass |
| Settings renderer | lazy chunk | required | pass |

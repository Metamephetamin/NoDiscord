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

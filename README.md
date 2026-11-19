# Family Budget Automation

Автоматизация семейного бюджета: еженедельный HTML-отчёт уровня Family Office и голосовой ввод фактических операций через Telegram.

## Состояние

| | |
|---|---|
| Работающая система | v0.9 Stable — см. [`docs/HANDBOOK_v0.9.md`](docs/HANDBOOK_v0.9.md) |
| Миграция | v1.0 — см. [`docs/TARGET_ARCHITECTURE_v1.0.md`](docs/TARGET_ARCHITECTURE_v1.0.md) (источник истины до выпуска Handbook v1.0) |
| Рабочие данные | Google Sheets `data v1.1`; Stage 3 — `data v1.2 migration baseline` |

## Структура репозитория

```text
apps-script/   код Apps Script, привязанного к таблице data v1.1
agent/         агент отчёта: инструкция, шаблон HTML, скрипты сверки (фаза 1)
docs/          Handbook, целевая архитектура, архивные спецификации
CHANGELOG.md   история изменений
```

## Развёртывание кода Apps Script

Через clasp на компьютере пользователя; подробности и откат — в [`apps-script/README.md`](apps-script/README.md).

1. Изменения вносятся коммитом в `apps-script/`.
2. Файлы копируются в папку clasp (`Documents/fba-apps-script`).
3. Копия папки → `clasp status` → `clasp push` (заменяет проект целиком).
4. Запустить тестовую функцию, указанную в описании изменения.

## Безопасность

- В репозитории нет токенов, ключей и финансовых данных.
- Токен Telegram-бота и токен API-триггера агента хранятся только в Script Properties и хранилище Nodul.
- `.gitignore` исключает выгрузки данных (`report_data_*.json`, `*.xlsx`).

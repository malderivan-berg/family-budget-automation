# CHANGELOG

## [Unreleased] — миграция на v1.0

### Added
- Репозиторий проекта.
- `docs/HANDBOOK_v0.9.md` — Project Handbook v0.9 (перенесён из docx).
- `docs/TARGET_ARCHITECTURE_v1.0.md` — целевая архитектура v1.0, черновик 0.2.
- `apps-script/` — исходный код v0.9 (15 модулей, снимок 06.09.2026).
- `docs/VOICE_TRANSACTION_BATCH_SCHEMA_v2.0.md`, `docs/STAGE3_SPECIFICATION_v0.2.md` — действующие спецификации.
- `docs/archive/` — LLM Analysis Contract v1.0 (draft), Report Model Specification v1.0 (draft), AI Report Schema v1.2 (legacy).
- `agent/` — агент отчёта: инструкция 1.0, карта показателей v1.1, шаблон, скрипты сборки (`render_report.py`), сверки чисел (`check_numbers.py`), проверки вёрстки (`render_check.py`), просмотра данных (`show_data.py`). Пробный прогон на отчёте №9: 155 чисел сверено, расхождений нет.

- `apps-script/ReportAgentManager.js` — конвейер v1.0: запуск агента через API-триггер, контроль доставки через 30 минут, предупреждения напрямую через Telegram Bot API.
- `runTestReportAgentPilot` — сквозной пилот v1.0 на последнем существующем отчёте без создания нового блока в «Расчеты» (только в тестовом режиме).
- `Export.gs`: выгрузка `report_data` (schema 1.0, raw + display). `Config.gs`: настройки `REPORT_AGENT`, имена секретов `SCRIPT_PROPS`. `Main.gs`, `Menu.gs`: пункты меню v1.0 и тестовые функции. `DriveManager.gs`: `findFileInFolder_`.

### Changed
- Инструкция агента 1.1: загрузка в Drive ссылкой на локальный файл (`sha256:…:путь`) с `disableConversionToGoogleType`, контроль загрузки по sha256, `telegram_request` собирает скрипт `agent/tools/make_telegram_request.py`.
- `apps-script/` синхронизирован с живым проектом (`clasp clone`, 19.11.2026); файлы переименованы в `.js`, как у clasp. Восстановленный из docx `PromptTemplates` был неполным (не хватало `VOICE_NER` и функций промптов) — исправлено. Остальные 14 модулей совпали со снимком, кроме пустых строк.
- Развёртывание Apps Script — через clasp вместо ручного копирования.
- Одна таблица — один проект Apps Script: из `data v1.1` удаляются старые привязанные копии v0.3.1–v0.9, рабочий проект — v0.9.1.
- Шаблон отчёта v1.1: единая шкала шрифтов (h1 30 → раздел 22 → блок 17 → текст 15 → подпись 13), заголовки разделов с золотой меткой; версии в подвале с префиксом «v», чтобы сверка чисел их не учитывала.
- `docs/TARGET_ARCHITECTURE_v1.0.md` 0.3: формат `report_data` (raw + display), разделение труда внутри агента, находки в данных v1.1.

## [0.9] — 2026-09-06 — Stable

- Голосовой ввод фактических операций через Telegram (Voice Transaction Batch Schema v2.0): actual-only, idempotency, recovery, Outbox + notification_sent ACK.
- Подробности — `docs/HANDBOOK_v0.9.md`, история документа.

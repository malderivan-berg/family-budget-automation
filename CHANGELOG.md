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

### Changed
- Шаблон отчёта v1.1: единая шкала шрифтов (h1 30 → раздел 22 → блок 17 → текст 15 → подпись 13), заголовки разделов с золотой меткой; версии в подвале с префиксом «v», чтобы сверка чисел их не учитывала.
- `docs/TARGET_ARCHITECTURE_v1.0.md` 0.3: формат `report_data` (raw + display), разделение труда внутри агента, находки в данных v1.1.

## [0.9] — 2026-09-06 — Stable

- Голосовой ввод фактических операций через Telegram (Voice Transaction Batch Schema v2.0): actual-only, idempotency, recovery, Outbox + notification_sent ACK.
- Подробности — `docs/HANDBOOK_v0.9.md`, история документа.

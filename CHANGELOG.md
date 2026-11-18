# CHANGELOG

## [Unreleased] — миграция на v1.0

### Added
- Репозиторий проекта.
- `docs/HANDBOOK_v0.9.md` — Project Handbook v0.9 (перенесён из docx).
- `docs/TARGET_ARCHITECTURE_v1.0.md` — целевая архитектура v1.0, черновик 0.2.
- `apps-script/` — исходный код v0.9 (15 модулей, снимок 06.09.2026).
- `docs/VOICE_TRANSACTION_BATCH_SCHEMA_v2.0.md`, `docs/STAGE3_SPECIFICATION_v0.2.md` — действующие спецификации.
- `docs/archive/` — LLM Analysis Contract v1.0 (draft), Report Model Specification v1.0 (draft), AI Report Schema v1.2 (legacy).

## [0.9] — 2026-09-06 — Stable

- Голосовой ввод фактических операций через Telegram (Voice Transaction Batch Schema v2.0): actual-only, idempotency, recovery, Outbox + notification_sent ACK.
- Подробности — `docs/HANDBOOK_v0.9.md`, история документа.

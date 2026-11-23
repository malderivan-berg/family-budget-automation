## [Browser Validator trigger test] — 2026-11-23 — Not passed

- По явному разрешению пользователя опубликована Nodul Prod v245 и выполнена одна ограниченная активация пилота. Заявка для синтетического `report_id=999905` была обновлена на месте теми же байтами после Deploy; второй запрос не создавался.
- После примерно 90 секунд polling Nodul не зарегистрировал запуск; Drive result/receipt, новое Gmail-событие и ответ ChatGPT Work отсутствуют. Найденное письмо с тем же `run_id` относится к предыдущему `report_id=999904`.
- Пилот приостановлен (Active выключен; Prod v245 сохранён). Причина отсутствия срабатывания не установлена; до диагностики новые события не создаются. Подробности: [операционный протокол](docs/NODUL_BROWSER_VALIDATOR_PILOT_v1.0.md).

# CHANGELOG

## [Work event contract] — 2026-11-22 — Proposed v0.1

- Создана [спецификация универсального event-протокола ChatGPT Work](docs/WORK_EVENT_PROTOCOL_v0.1.md): GAS START marker → Nodul Outlook Relay → Gmail Work, затем Nodul QA REPAIR/VALIDATED и штатный Telegram Sender.
- Определены `run_id`, имена QA-файлов, правила идемпотентности, предварительные схемы START/QA/result/receipt, точные границы рабочих папок и условия публикации.
- Ограничения перед rollout: START-мост ещё не испытан, возможны гонки дублированных событий, неизвестны права папок и время QA относительно 30-минутного контроля GAS.
- Прямой API Workspace Agents описан только как условная альтернатива, а не как подтверждённый интерфейс текущего ChatGPT Work. Никаких runtime-изменений.

## [Architecture direction corrected] — 2026-11-22 — Target: ChatGPT Work

- Подтверждено ранее принятое 21.11.2026 решение: **ChatGPT Work заменяет недоступного Claude** в роли отчётного агента. Pilot №10 реализовал Work ↔ Drive ↔ Nodul ↔ Outlook/Gmail с REPAIR/VALIDATED; это основа целевой цепочки.
- Прежний [QA-аудит](docs/PILOT_TO_PRODUCTION_QA_AUDIT_2026-11-22.md) отозван как основанный на неверной предпосылке: возвращаться к Claude и переносить браузерную проверку из Nodul в Claude **не планируется**.
- Подготовлен [план миграции ChatGPT Work](docs/CHATGPT_WORK_AGENT_MIGRATION_2026-11-22.md): универсальный event-протокол, транспорт START из GAS, восстановление/идемпотентность, обязательная проверка перед публикацией и сохранение Telegram Request/Response. Production не изменён.

## [QA architecture audit] — 2026-11-22 — Proposed

- Изучены Nodul Stable Pilot JSON, рабочая инструкция Claude 2.1, `render_check.py`, ReportAgentManager и Handbook. Выпущен [аудит перехода Pilot → Production](docs/PILOT_TO_PRODUCTION_QA_AUDIT_2026-11-22.md).
- Рекомендовано **не переносить** тестовые N00–N06 и Outlook/Gmail/Work в production. Минимальный L2-маршрут: сначала проверить наличие Chromium в среде Claude, затем расширить `render_check.py` до пяти ширин и испытать обязательную проверку в TEST_MODE; основной код и контракты не менялись.
- Риски: текущий `render_check.py` проверяет только 390px; `exit=3` при отсутствии Playwright допускается инструкцией агента. Ручная повторная отправка из GAS не вызывает агента — учесть при QA rollout.

## [Pilot documentation] — 2026-11-22 — Development only

- Зафиксирован **FBA Nodul Browser Validator — Stable Pilot v1.0**: 20 функциональных узлов (1 триггер + 19 действий), 21 ребро; checkpoint Nodul 237. Production не изменён.
- После неудачного t10 восстановлены источники HTML у N03/N04, удалены временные узлы 34–38, отключён захват PNG. Геометрическая проверка остаётся в Nodul; визуальная приёмка — вне обязательного конвейера (L2). Исправления сломанных ссылок — L1.
- Подтверждены одиночные прогоны N03 (SHA256), N04 (`PASS_GEOMETRY` на пяти ширинах, 0 замечаний), N02 (`SKIP`); ранее успешно проверена сквозная цепочка `REPAIR → VALIDATED → финальный HTML`. `RESEND` после восстановления — только анализ кода, не runtime-тест.
- Добавлен [операционный протокол пилота](docs/NODUL_BROWSER_VALIDATOR_PILOT_v1.0.md); обновлены Handbook (приложение C) и Roadmap (раздел 36).
- 22.11.2026 получен внешний JSON-экспорт Nodul (20 функциональных узлов + 2 стикера, 21 связь, структурная проверка PASS; экспорт v240, Dev v239). Файл хранится приватно, **не в публичном GitHub**. Восстановление импортом ещё не проверено; checkpoint Nodul 237 — дополнительный откат.
- Ни Deploy, ни Active, ни изменения GAS/Sheets/Claude/Telegram не выполнялись.

## [1.0] — 2026-11-19 — Stable

Отчёт строит агент Claude по выгрузке из Google Sheets; все числа — из таблицы, тексты сверяются программно. Доставка — Nodul, контроль — Apps Script. Подробности — `docs/HANDBOOK_v1.0.md`.

Проверка: пилот на отчёте №9 (143 числа без расхождений), отчёт №10 в тестовом режиме (137 чисел), повторная отправка; затем доставка обоим.

### Added
- Репозиторий проекта.
- `docs/HANDBOOK_v1.0.md` — Project Handbook v1.0. Handbook v0.9 (перенесён из docx) — в `docs/archive/`.
- `docs/TARGET_ARCHITECTURE_v1.0.md` — целевая архитектура v1.0, черновик 0.2.
- `apps-script/` — исходный код v0.9 (15 модулей, снимок 06.09.2026).
- `docs/VOICE_TRANSACTION_BATCH_SCHEMA_v2.0.md`, `docs/STAGE3_SPECIFICATION_v0.2.md` — действующие спецификации.
- `docs/archive/` — LLM Analysis Contract v1.0 (draft), Report Model Specification v1.0 (draft), AI Report Schema v1.2 (legacy).
- `agent/` — агент отчёта: инструкция 1.0, карта показателей v1.1, шаблон, скрипты сборки (`render_report.py`), сверки чисел (`check_numbers.py`), проверки вёрстки (`render_check.py`), просмотра данных (`show_data.py`). Пробный прогон на отчёте №9: 155 чисел сверено, расхождений нет.

- `apps-script/ReportAgentManager.js` — конвейер v1.0: запуск агента через API-триггер, контроль доставки через 30 минут, предупреждения напрямую через Telegram Bot API.
- `runTestReportAgentPilot` — сквозной пилот v1.0 на последнем существующем отчёте без создания нового блока в «Расчеты» (только в тестовом режиме).
- `Export.gs`: выгрузка `report_data` (schema 1.0, raw + display). `Config.gs`: настройки `REPORT_AGENT`, имена секретов `SCRIPT_PROPS`. `Main.gs`, `Menu.gs`: пункты меню v1.0 и тестовые функции. `DriveManager.gs`: `findFileInFolder_`.

### Changed
- Фаза 4: доставка обоим (`TEST_MODE = false`); меню — только пункты v1.0, без пометки «(v1.0)»; новый пункт «Отправить отчёт повторно» (пересоздаёт запрос агента, старый ответ — в корзину).
- Сценарий 2 Nodul: запрос — самый новый `telegram_request_N.json` в Outbox, ответ — `telegram_response_N.json`; узлы поиска и безвозвратного удаления старого ответа убраны.
- Инструкция агента 1.1: загрузка в Drive ссылкой на локальный файл (`sha256:…:путь`) с `disableConversionToGoogleType`, контроль загрузки по sha256, `telegram_request` собирает скрипт `agent/tools/make_telegram_request.py`.
- `apps-script/` синхронизирован с живым проектом (`clasp clone`, 19.11.2026); файлы переименованы в `.js`, как у clasp. Восстановленный из docx `PromptTemplates` был неполным (не хватало `VOICE_NER` и функций промптов) — исправлено. Остальные 14 модулей совпали со снимком, кроме пустых строк.
- Развёртывание Apps Script — через clasp вместо ручного копирования.
- Одна таблица — один проект Apps Script: из `data v1.1` удаляются старые привязанные копии v0.3.1–v0.9, рабочий проект — v0.9.1.
- Шаблон отчёта v1.1: единая шкала шрифтов (h1 30 → раздел 22 → блок 17 → текст 15 → подпись 13), заголовки разделов с золотой меткой; версии в подвале с префиксом «v», чтобы сверка чисел их не учитывала.
- `docs/TARGET_ARCHITECTURE_v1.0.md` 0.3: формат `report_data` (raw + display), разделение труда внутри агента, находки в данных v1.1.

### Removed
- Старый отчётный конвейер: модули PipelineManager, Import, PromptBuilder, PromptTemplates (включая устаревшую копию промпта голосового ввода), HtmlReportRenderer, TelegramManager; xlsx-экспорт, SCHEMA-заглушки в Reports, функции Job/AI_Report/архива в DriveManager, неиспользуемые настройки (`AI_PIPELINE_MODE`, `PIPELINE`, `PROJECT_FILES`, `ARCHIVE_FILES` и др.). Голосовой ввод не затронут.

## [0.9] — 2026-09-06 — Stable

- Голосовой ввод фактических операций через Telegram (Voice Transaction Batch Schema v2.0): actual-only, idempotency, recovery, Outbox + notification_sent ACK.
- Подробности — `docs/archive/HANDBOOK_v0.9.md`, история документа.

# Этап 3 — рабочие материалы

`apps-script-0.9.2/` — снимок кода проекта Apps Script таблицы `data v1.2 migration baseline` (Family Office Report 0.9.2), `clasp clone` 20.11.2026. Это код v0.9 плюс модуль `MarketDataManager` (рыночные данные), настройки `MARKET_DATA` и команда `runUpdateMarketData`. Папка — эталон для шага 5.2, не папка развёртывания.

Аудит и план этапа — [`../docs/STAGE3_AUDIT_AND_PLAN.md`](../docs/STAGE3_AUDIT_AND_PLAN.md).

## Ветка `stage3` — код проекта таблицы v1.2

Папка `apps-script/` в этой ветке развёртывается в проект таблицы `data v1.2` (папка clasp `fba-apps-script-v12`), а не в проект `data v1.1`. Отличия от `main`:

- `MarketDataManager`; одноразовый перенос `MigrationManager` удалён 21.11.2026 при переключении (код — в истории git);
- создание отчёта в пяти листах — `syncReportSheets_()`;
- выгрузка `report_data` schema 2.0 — [`../docs/REPORT_DATA_2.0.md`](../docs/REPORT_DATA_2.0.md);
- `REPORT_AGENT.TEST_MODE = false` с переключения 21.11.2026 (на пилоте было `true`: отчёт получал только муж); пилот убирает старый ответ Nodul с тем же номером отчёта;
- триггер голосового ввода `runProcessVoiceCallbacks` — в проекте v1.2; в проекте v1.1 триггеров нет.

Агент отчёта (`agent/`) общий для обеих таблиц: инструкция v2.0 читает schema 1.0 и 2.0. Задача Claude клонирует ветку по умолчанию, поэтому для пилота агент v2.0 должен быть в `main`.

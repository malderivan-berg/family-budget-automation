# Apps Script — Family Budget Automation

Код проекта Apps Script, привязанного к таблице `Data/data v1.1`.

Исходная версия — снимок **Source Code v0.9** от 06.09.2026 (код после этой даты не менялся). Файлы восстановлены из docx построчно; каждый файл и весь проект целиком проходят проверку синтаксиса.

| Модуль | Ответственность | В v1.0 |
|---|---|---|
| Config.gs | Настройки проекта | Изменяется |
| Utils.gs | Вспомогательные функции | Без изменений |
| Validation.gs | Проверки входных данных | Без изменений |
| Main.gs | Публичные точки входа | Изменяется |
| Menu.gs | Меню Google Sheets | Изменяется |
| Export.gs | Экспорт report_id | Изменяется: выгрузка `report_data` в JSON |
| Reports.gs | Создание отчёта, report_id | Изменяется: удаление SCHEMA-заглушек |
| HtmlReportRenderer.gs | Legacy SCHEMA-рендерер | Удаляется |
| PromptTemplates.gs | Промпты отчёта | Удаляется: промпт → `agent/report_agent.md` |
| PromptBuilder.gs | AI Job Package | Удаляется |
| Import.gs | Импорт ответа Nodul | Удаляется |
| DriveManager.gs | Работа с Google Drive | Изменяется |
| PipelineManager.gs | Polling-конвейер | Удаляется → ReportAgentManager.gs |
| TelegramManager.gs | Запросы на отправку в Telegram | Изменяется |
| VoiceInputManager.gs | Голосовой ввод | Без изменений |

Порядок развёртывания — в корневом [README](../README.md). Целевые изменения — в [`docs/TARGET_ARCHITECTURE_v1.0.md`](../docs/TARGET_ARCHITECTURE_v1.0.md), раздел 7.

Не хватает `appsscript.json` (манифест проекта) — будет добавлен из редактора.

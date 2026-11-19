# Apps Script — Family Budget Automation

Код проекта Apps Script **Family Office Report v0.9.1**, привязанного к таблице `Data/data v1.1`. Это единственный проект таблицы: в нём триггер голосового ввода `runProcessVoiceCallbacks`, в него отправляет код clasp.

Правило: одна таблица — один привязанный проект. Версии хранятся в git, а не копиями проекта: у каждой копии свой `onOpen`, и меню «Family Budget» строит случайная из них. Старые копии v0.3.1–v0.9 удалены 19.11.2026; код v0.9 — в истории git и в Source Code v0.9. Проект таблицы `data v1.2 migration baseline` — отдельный (Family Office Report 0.9.2, триггер `runScheduledMarketDataUpdate_`).

Источник — живой проект, скачанный `clasp clone` 19.11.2026 (код v0.9, после 06.09.2026 не менялся). Файлы лежат с расширением `.js`, как их скачивает и отправляет clasp; в редакторе Apps Script они называются так же, без расширения.

> Ранний снимок из docx (`*.gs`, коммит `8c55bad`) был неполным: в `PromptTemplates` не хватало промпта `VOICE_NER` и функций работы с промптами. Источник истины — эта папка.

| Модуль | Ответственность | В v1.0 |
|---|---|---|
| Config.js | Настройки проекта | Изменяется |
| Utils.js | Вспомогательные функции | Без изменений |
| Validation.js | Проверки входных данных | Без изменений |
| Main.js | Публичные точки входа | Изменяется |
| Menu.js | Меню Google Sheets | Изменяется |
| Export.js | Экспорт report_id | Изменяется: выгрузка `report_data` в JSON |
| Reports.js | Создание отчёта, report_id | Изменяется: удаление SCHEMA-заглушек |
| ReportAgentManager.js | Запуск агента, контроль доставки | Новый (фаза 2) |
| HtmlReportRenderer.js | Legacy SCHEMA-рендерер | Удаляется |
| PromptTemplates.js | Промпты отчёта; устаревшая копия `VOICE_NER` | Удаляется целиком: промпт отчёта → `agent/report_agent.md`; рабочий промпт голосового ввода — только файл `AI Workspace/Voice/Prompts/voice_ner_prompt.txt` |
| PromptBuilder.js | AI Job Package | Удаляется |
| Import.js | Импорт ответа Nodul | Удаляется |
| DriveManager.js | Работа с Google Drive | Изменяется |
| PipelineManager.js | Polling-конвейер | Удаляется → ReportAgentManager.js |
| TelegramManager.js | Запросы на отправку в Telegram | Изменяется |
| VoiceInputManager.js | Голосовой ввод | Без изменений |

⚠️ Не запускайте `updateVoiceNerPromptInDrive()`: она перезапишет рабочий `voice_ner_prompt.txt` устаревшей версией из кода (с `update_planned`, `target_hint`, `confidence_score`) и сломает голосовой ввод. Функция удаляется в фазе 4.

`appsscript.json` — манифест проекта: часовой пояс Europe/Moscow, среда V8, явный список OAuth-областей не задан (Apps Script определяет их автоматически).

## Развёртывание через clasp

Рабочая папка clasp на компьютере — копия этой папки (`.js` + `appsscript.json`) плюс `.clasp.json` с Script ID проекта. `.clasp.json` в репозиторий не входит, файл `~/.clasprc.json` с токеном входа — тем более.

```
clasp status   # какие файлы будут отправлены
clasp push     # заменяет код проекта целиком содержимым папки
```

`clasp push` заменяет проект целиком: файл, которого нет в папке, будет удалён из проекта. Поэтому перед отправкой папка должна совпадать с этой папкой репозитория, без лишних и без дублей `.js`/`.gs`.

Откат — отправить предыдущую версию: взять файлы `apps-script/` из нужного коммита git (или из резервной копии папки), положить в папку clasp и выполнить `clasp push`. Перед каждым `push` сохраняйте копию папки — это самый быстрый путь назад.

Целевые изменения — в [`docs/TARGET_ARCHITECTURE_v1.0.md`](../docs/TARGET_ARCHITECTURE_v1.0.md), раздел 7.

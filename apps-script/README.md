# Apps Script — Family Budget Automation

Код проекта Apps Script **Family Office Report v0.9.1**, привязанного к таблице `Data/data v1.1`. Это единственный проект таблицы: в нём триггер голосового ввода `runProcessVoiceCallbacks`, в него отправляет код clasp.

Правило: одна таблица — один привязанный проект. Версии хранятся в git, а не копиями проекта: у каждой копии свой `onOpen`, и меню «Family Budget» строит случайная из них. Старые копии v0.3.1–v0.9 удалены 19.11.2026; код v0.9 — в истории git и в Source Code v0.9. Проект таблицы `data v1.2 migration baseline` — отдельный (Family Office Report 0.9.2, триггер `runScheduledMarketDataUpdate_`).

Источник — живой проект, скачанный `clasp clone` 19.11.2026 (код v0.9, после 06.09.2026 не менялся). Файлы лежат с расширением `.js`, как их скачивает и отправляет clasp; в редакторе Apps Script они называются так же, без расширения.

> Ранний снимок из docx (`*.gs`, коммит `8c55bad`) был неполным: в `PromptTemplates` не хватало промпта `VOICE_NER` и функций работы с промптами. Источник истины — эта папка.

| Модуль | Ответственность |
|---|---|
| Config.js | Настройки проекта; секреты — только имена свойств (`SCRIPT_PROPS`) |
| Main.js | Публичные точки входа: меню, триггеры, тестовые функции |
| Menu.js | Меню «Family Budget» |
| Reports.js | Создание отчёта: новый блок в «Расчеты» |
| Export.js | Выгрузка `report_data_N.json` для агента |
| ReportAgentManager.js | Запуск агента, проверка доставки, повторная отправка, предупреждения в Telegram |
| DriveManager.js | Папки и файлы Google Drive |
| VoiceInputManager.js | Голосовой ввод (Voice Transaction Batch Schema v2.0) |
| Utils.js | Общие функции: листы, сообщения |
| Validation.js | Проверки входных данных |

В v1.0 удалены модули старого конвейера: PipelineManager, Import, PromptBuilder, PromptTemplates, HtmlReportRenderer, TelegramManager. Неиспользуемые функции и настройки голосового ввода сознательно оставлены: голосовой контур в v1.0 не меняется.

**Точки входа.** Меню: `runReportAgentPipeline`, `showReportAgentStatus`, `resendLastReport`, `retryReportAgent`, `checkReportAgentSetup`. Триггеры: `runProcessVoiceCallbacks` (каждые 2 минуты), `checkReportDelivered` (создаётся при запуске отчёта). Тесты из редактора: `runTestTelegramAlert`, `runTestReportDataExport`, `runTestReportAgentPilot` (только в тестовом режиме).

Рабочий промпт голосового ввода — только файл `AI Workspace/Voice/Prompts/voice_ner_prompt.txt`; его устаревшая копия в коде удалена вместе с PromptTemplates.

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

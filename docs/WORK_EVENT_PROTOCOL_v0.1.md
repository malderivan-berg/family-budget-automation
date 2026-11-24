# FBA — универсальный протокол событий ChatGPT Work v0.1

| Поле | Значение |
|---|---|
| Дата | 22.11.2026 |
| Статус | **Proposed — только спецификация, не действующий runtime-контракт** |
| Миграция | Claude → ChatGPT Work (согласованное направление) |
| Проверенный прототип | FBA Report 10 / ChatGPT Work ↔ Drive ↔ Nodul ↔ Outlook/Gmail |
| Источник реализации | `docs/CHATGPT_WORK_AGENT_MIGRATION_2026-11-22.md`; Nodul JSON Stable Pilot v1.0 |
| Уровень | **L3** — новый интерфейс запуска агента и универсальный QA-контракт. Без изменения финансовых контрактов/принципов v1.0 |
| Решение о внедрении | Отдельное; никакие сценарии, задания и код сейчас не изменены |

## 1. Статус источников и транспорта

- В рабочей v1.0 GAS вызывает Claude через `POST /fire`, передавая `report_id`, `report_folder_id`, `report_data_file_id`, `telegram_outbox_folder_id`. Это **не** интерфейс запуска ChatGPT Work.
- В эксперименте №10 ChatGPT Work действительно срабатывал по **новому Gmail-письму** с контролем отправителя и темы. Ответ Nodul шёл через Outlook → Gmail, а Work заново читал проверенный Drive JSON. Gmail — только сигнал, не источник данных/инструкций.
- По документации OpenAI [Scheduled tasks](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt) Gmail event-triggered tasks поддерживаются в ChatGPT Work при наличии соответствующего доступа. Прямой `POST /v1/workspace_agents/{id}/trigger` ([Workspace Agents API](https://developers.openai.com/workspace-agents/trigger-runs)) относится к **Workspace Agents**, для которого требуются отдельный агент, API-канал и учётный доступ рабочего пространства. Для текущего пользователя этот канал **не подтверждён**; в базовую схему не включать.

## 2. Выбранная схема v0.1

```text
Sheets → GAS (report_id, report_data, report_folder)
  → Drive: START manifest created LAST in a dedicated Start Outbox
  → Nodul START Relay (новый малый изолированный сценарий): Outlook email
  → Gmail event-triggered ChatGPT Work (новое отдельное задание)
  → Work: read trusted START manifest and report_data from Drive
  → Work: analyze → render HTML → numerical check → upload candidate
  → Drive: QA request created LAST in shared QA folder
  → Nodul Browser Validator: SHA256 + headless geometry → result JSON
  → Outlook/Gmail → same Work task: REPAIR / VALIDATED / EXCEPTION
       REPAIR → new candidate and request, bounded retry
       VALIDATED → final report_N.html to Reports/Report_N
          → re-download and SHA256 check → telegram_request_N.json LAST
          → unchanged Nodul Telegram Sender → Telegram
          → existing telegram_response_N.json → GAS delivery check
       EXCEPTION → fail closed, no Telegram Request
```

**Разделение папок:** статический `StartOutbox` только для стартовых маркеров (Drive-trigger START Relay), статическая приватная папка `QA` — кандидаты, запросы, ответы, квитанции, а рабочая `Reports/Report_N` — только опубликованные отчёты. Точные пути/ID папок подлежат проверке в Drive; их нельзя угадывать или публиковать в репозитории. Выбран один общий QA каталог, чтобы Nodul мог следить за одной папкой; имена включают уникальный `run_id`, чтобы избежать коллизий между отчётами.

**Важно:** ограничения на запись «только разрешённые папки» в инструкциях Work — логические и зависят от разрешений подключённого Google-аккаунта; это не техническая гарантия folder-scoped OAuth. Реальные ACL и доступные действия проверить до production.

## 3. Идентификация и дедупликация

- `report_id` — ID отчёта из Sheets/GAS, **не** ID события.
- `run_id` — уникальный безопасный идентификатор одного запуска (рекомендуется UUID, сформированный GAS один раз и сохранённый в состоянии запуска). При повторном старте одного и того же запуска **не генерировать новый** `run_id`.
- `attempt` — номер QA-попытки, начиная с 1; `max_attempts` из единой версии политики (для совместимости первоначально 4; не дублировать цифру как магическое значение в независимых узлах).
- `request_id` — `FBA_R{report_id}_{run_id}_A{NN}` (точная схема и формат UUID будут закреплены при реализации). Уникален внутри всех отчётов.
- `event_id` — стабильный ключ события из `run_id + request_id + event + candidate_sha256`. Повторное письмо с тем же `event_id` не должно порождать новые артефакты.
- Имена тестовых `r10_a01–a04` и `FBA_REPORT10_DRYRUN` в production не использовать.

**Граница надёжности:** Drive-файл результата + квитанция, созданная **после** успешного отправления письма, дают восстановление после типичных сбоев, но не атомарность `send mail + write receipt`. При падении между этими действиями дубль письма возможен. Семантика на этом этапе — **at least once transport + идемпотентная обработка**, а не доказанная exactly-once delivery. Состояние гонки при двух одновременных событиях проверяется отдельно до production.

## 4. Предварительные схемы артефактов

Схемы ниже — **предложения v0.1**. Заполнять поля только фактическими ID и значениями, полученными из источников. Не публиковать реальные финансовые данные, секреты или рабочие ID.

### 4.1 START manifest: `fba_work_start_{run_id}.json`

```json
{
  "schema": "fba_agent_start",
  "schema_version": "2.0",
  "run_id": "<uuid-created-by-gas>",
  "report_id": 11,
  "report_folder_id": "<verified-drive-id>",
  "report_data_file_id": "<verified-drive-id>",
  "telegram_outbox_folder_id": "<verified-drive-id>",
  "status": "READY",
  "created_at": "<UTC-ISO8601>"
}
```

`11` здесь — **вымышленный номер для примера**, не заявление о существовании отчёта №11. GAS создаёт START manifest **последним**, только после успешного экспорта и проверки его существования в правильной папке. Рабочий контекст должен проверять соответствие `report_id`, `report_data` schema и фактических `parents` в Drive. Идентификаторы из входящего письма без этих проверок недостоверны.

### 4.2 QA request: `fba_layout_request_{run_id}_aNN.json`

```json
{
  "schema": "fba_layout_request",
  "schema_version": "2.0",
  "run_id": "<run-id>",
  "report_id": 11,
  "request_id": "FBA_R11_<run-id>_A01",
  "attempt": 1,
  "max_attempts": 4,
  "status": "READY_FOR_LAYOUT",
  "qa_folder_id": "<verified-qa-folder-id>",
  "candidate_file_id": "<actual-drive-id>",
  "candidate_file_name": "candidate_<run-id>_a01.html",
  "candidate_sha256": "<actual-64hex-sha256>",
  "numeric_check": {
    "analysis_checked": 1,
    "analysis_violations": 0,
    "html_checked": 1,
    "html_violations": 0
  },
  "created_at": "<UTC-ISO8601>"
}
```

Числа проверок `1` — иллюстративные. В runtime используются фактические значения `check_numbers.py`, все violations = 0; HTML загружается и скачивается обратно до создания запроса, SHA256 сверяется по реальным байтам. QA-запрос в Drive создаётся **последним**.

### 4.3 QA result и receipt

Nodul создаёт `fba_layout_result_{run_id}_aNN.json`: `schema=fba_layout_result`, `schema_version=2.0`, `run_id`, `report_id`, `request_id`, `attempt`, `status=PASS_GEOMETRY|FAIL_GEOMETRY`, `event=VALIDATED|REPAIR|EXCEPTION`, `candidate_sha256`, `viewports`, `issue_count`, `issues`, `executed_at`. Сохраняются результаты всех пяти ширин: 320/375/390/430/768 px. `full_visual_semantics_checked=false`: нет утверждения о полной визуальной/смысловой приёмке.

Для универсальной реализации QA v2.0 результат также обязан содержать `request_file_id`: фактический Drive ID заявки, которую обработал Nodul. Nodul берёт его из метаданных входного Drive-события, проверяет соответствие файлу, прочитанному в N01, и сохраняет в результате. Work читает результат по `validation_file_id` из письма, затем запрашивает метаданные заявки по `request_file_id` до чтения. Work сверяет фактические ID, родительскую QA-папку, точное имя, `run_id`, `report_id`, `request_id`, попытку и хеш кандидата. При отсутствующем или несогласованном ID универсальная ветка отклоняет событие. Поиск заявки по имени и значения ID из тела заявки не используются. Контракт письма и формула `event_id` сохраняются. В проверенном Development-прогоне этот ID был закреплён в тестовой инструкции Work, перенос поля в результат ожидает реализации.

После успешной отправки письма Nodul создаёт `fba_signal_sent_{run_id}_aNN.json` (schema `fba_signal_receipt`) с `event_id`, `request_id`, `validation_file_id`, `sent_at`. Повторная обработка:
- результат + квитанция → `SKIP`;
- результат без квитанции → `RESEND` (без повторного браузера; возможен повтор технического письма);
- нет результата → `VALIDATE`;
- несогласованные данные/отсутствие ожидаемого JSON/несовпадение SHA → **ошибка без отправки**.

Эти состояния проверены на пилоте в части `SKIP`; ветка `RESEND` после восстановления пилота — только анализ кода, не runtime.

### 4.4 Письмо — только пробуждение Work

Тема нового события: `FBA_REPORT_EVENT_V2` (должна быть выделена в **новой отдельной** Work-автоматизации; старую `FBA_REPORT10_DRYRUN` не менять).

Тело (plain text): `FBA_EVENT_V2`, `event=START|REPAIR|VALIDATED|EXCEPTION`, `run_id`, `report_id`, `event_id` и ссылка-идентификатор **существующего** manifest/result Drive. Никаких сумм, токенов, HTML или доверенных инструкций в письме.

Gmail-триггер: только **новое входящее сообщение** от строго разрешённого технического Outlook-адреса и с точной темой. Но sender/subject лишь фильтр: Work обязан проверить Drive-папку, фактический документ, schema, `run_id`, SHA256 и состояние запуска; при несовпадении — остановка, без записи.

## 5. Привязка к действующей системе (минимальные модули)

| Компонент | Что изменить в будущем | Что не менять |
|---|---|---|
| GAS `ReportAgentManager.js` | В тестовой ветке вместо Claude `/fire` создавать START manifest, записывать `run_id`, отслеживать стадии Work и QA | Создание report_id, экспорт и формулы, секреты, Telegram alert |
| GAS `Config.js` | Централизованное именование новых QA/Start папок и режима тестирования | Существующие рабочие настройки до приемки |
| Новый малый Nodul START Relay | Триггер Drive new-file → проверка имени/папки/manifest → Outlook START | Сценарий 2 Telegram Sender и сценарий 3 Voice |
| Nodul Browser Validator | Обобщить N01/N05/N06, имена файлов, метаданные, папку QA и события; проверить retry/RESEND | Реализацию проверенного SHA256/Puppeteer, текущий Stable Pilot оставить неизменным |
| ChatGPT Work | Новая событийная задача + отдельная `agent/report_agent_work.md` с состоянием, проверками и границами | Старую задачу пилота №10 оставить как исторический прототип, не расширять in-place |
| `agent/tools/` | Использовать текущие версии `show_data.py`, `render_report.py`, `check_numbers.py` | Не пересчитывать финансовые показатели, не менять шаблон без причины |
| Telegram | Work после VALIDATED формирует **точный** `telegram_request_N.json` через `make_telegram_request.py`; Nodul Sender выполняет штатную доставку и пишет response | **Не менять** `Telegram Request/Response` |
| GAS контроль доставки | Пересмотреть момент начала 30-минутного таймера: Work QA может быть ещё в работе; избегать ложных `NO_REPORT` | Сохранить уведомления при реальном сбое и контроль Telegram ACK |

## 6. Gate для публикации

`VALIDATED` от Nodul — необходимое, но **недостаточное** условие. До записи `telegram_request_N.json` Work повторно:
1. Проверяет `report_data` по исходной выгрузке и schema/report_id; анализ и HTML — `check_numbers.py` с нулём нарушений.
2. Проверяет полную цепочку `request → result → candidate`: точные Drive parent IDs, `run_id`, `report_id`, `request_id`, хеш, попытку, допустимый статус, пять passed, отсутствие issues.
3. Проверяет, что финального `report_N.html` и `telegram_request_N.json` ещё нет для этого отчёта (или корректно завершает дублированное событие).
4. Сохраняет **ровно проверенные байты** кандидата в финал, скачивает `report_N.html` и сверяет SHA256.
5. Только после этого создаёт штатный `telegram_request_N.json` **последним**. Получатели/caption из `report_data.delivery`, не из письма.

При любой ошибке/исчерпании попыток — запрет публикации, диагностический артефакт и существующий путь предупреждения. Не выдавать `PASS_GEOMETRY` за гарантию полной визуальной корректности.

## 7. Риски, блокирующие rollout

1. **START bridge не проверен:** GAS → Drive marker → Nodul Outlook → Gmail Work ещё нужно испытать. Нельзя считать старый `POST /fire` запуском ChatGPT Work.
2. **Конкурентные события/дубли:** почтовый транспорт и Drive marker/receipt не обеспечивают atomic exactly-once. До production нужна проверка одновременных START/VALIDATED и безопасного повтора.
3. **Таймер GAS:** существующие 30 минут отсчитываются по логике прежнего Claude. Перед внедрением нужно определить наблюдаемый сигнал завершения/сбоя и условия ожидания QA; не брать произвольный таймаут.
4. **Авторизации и права:** техническая изоляция по папкам и политика записи должны быть подтверждены, а не подразумеваться.
5. **Проверки размеров/структуры:** пилот использует `h2Count >= 10` и `visibleTextLength >= 1000`, характерные для отчёта №10. Для разных версий `report_data` понадобятся обоснованные, версионированные требования, чтобы не отклонять корректные отчёты.
6. **Стабильность Work:** каждый email — новый независимый запуск; продолжение состояния только по доверенным Drive-артефактам, а не по истории чата.
7. **Независимый Stable Pilot:** не менять текущие 20 узлов/21 ребро, пока универсальная копия не прошла отдельный тест.

## 8. Следующий исполнимый шаг

**P0: испытать START Bridge только на синтетическом маркере без финансовых данных.**
Сначала в Nodul AI-конструкторе **только read-only** проверить возможности trigger `new_file`, Drive download/validate и Outlook-send и минимальный состав отдельного сценария. Затем согласовать отдельное создание Development-копии START Relay. Не менять GAS до успешной проверки связи `Drive → Outlook → Gmail Work`. Не использовать реальный report_id, реальные суммы или действующий Telegram Outbox.

Дальше последовательность: P1 синтетический START → P2 новая Work задача с универсальной инструкцией → P3 универсальная **копия** Nodul QA → P4 тестовый end-to-end с реальной выгрузкой без production-доставки → P5 отдельное согласование GAS, Deploy/Active и production.

## 9. Запреты текущего этапа

Никаких изменений GAS, Nodul, Work task, Gmail, настроек доступов, тестовых/боевых данных или отправки писем сейчас не выполнялось. Документ — предложение на согласование и основа реализации; не подменяет действующий Handbook v1.0 до миграции.

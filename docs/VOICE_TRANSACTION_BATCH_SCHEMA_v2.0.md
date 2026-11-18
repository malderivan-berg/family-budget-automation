**VOICE TRANSACTION  
BATCH SCHEMA**

**Specification v2.0**

| **Project**         | Family Budget Automation                  |
|---------------------|-------------------------------------------|
| **Status**          | Stable                                    |
| **Document type**   | Official Technical Specification          |
| **Runtime target**  | Voice Operation Sender v1.1 + Apps Script |
| **Schema version**  | 2.0                                       |
| **Last validation** | 06.09.2026                                |

| **Ключевое изменение v2.0.** Voice pipeline теперь работает только с фактическими операциями. Плановые операции, update_planned, fuzzy matching, confidence_score и warnings удалены из live-контракта. LLM возвращает только date / amount / type / comment; owner и operation_id назначает Apps Script. |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# Содержание

1.  Назначение и статус контракта

2.  Архитектурная граница и ответственность компонентов

3.  Контракт LLM NER

4.  Canonical Voice Transaction Batch v2.0

5.  Поля batch и operation

6.  Нормализация и валидация

7.  Подтверждение и жизненный цикл файлов

8.  Идемпотентность и повторные confirm

9.  Outbox / notification ACK

10. Запись в лист «Календарь»

11. Ошибки и recovery

12. Совместимость v1.0 → v2.0

13. Примеры

14. Требования к Nodul и Apps Script

15. Change log v2.0

# Что изменилось относительно v1.0

| **Область**            | **v1.0**                                                  | **v2.0**                                                 |
|------------------------|-----------------------------------------------------------|----------------------------------------------------------|
| Режим записи           | create_new / update_planned                               | Только новые фактические операции                        |
| LLM operation          | owner, intent, target_hint, confidence, warnings + данные | Только date, amount, type, comment                       |
| owner                  | Определяет LLM                                            | Определяет Apps Script по telegram_user_id               |
| operation_id           | Передаётся в operation                                    | Генерируется Apps Script: {telegram_message_id}\_{index} |
| Планы / fuzzy matching | Часть runtime                                             | Удалены из voice pipeline                                |
| Cancel                 | Поддерживается                                            | Не используется                                          |
| Confirm UX             | Confirm / cancel                                          | Одна кнопка Confirm; кнопка может оставаться видимой     |
| Повторный confirm      | Не определён детально                                     | Idempotent success, без дубля и без второго уведомления  |
| Delivery ACK           | Outbox удаляет Nodul                                      | Nodul создаёт notification_sent ACK; Outbox удаляет GAS  |

# 1. Назначение и статус контракта

Voice Transaction Batch Schema v2.0 — официальный контракт хранения и передачи валидного результата голосового ввода между Nodul и Apps Script. Он описывает уже структурированную финансовую операцию после STT и LLM NER, но до записи в Google Sheets.

- Google Sheets остаётся единственным источником финансовых данных и расчётов.

- Nodul отвечает за Telegram/STT/LLM и сборку batch.

- Apps Script отвечает за нормализацию, owner, operation_id, валидацию, идемпотентность, запись, архив и Outbox.

- LLM не принимает решение о плане, обновлении существующей строки или записи в Sheets.

- Пользователь подтверждает распознанный batch до записи.

| **Граница документа.** Schema v2.0 описывает runtime voice contract. Она не является схемой аналитического отчёта, не определяет расчёты бюджета и не заменяет Project Handbook. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 2. Архитектурная граница и ответственность компонентов

```text
Telegram Voice
↓
Whisper / STT
↓ transcript
LLM NER → { operations: [...] }
↓
Nodul Assemble Full Batch
↓
Voice/Drafts/{batch_id}.json
↓ user confirms
Voice/Callbacks/{batch_id}_confirm.json
↓
Apps Script
↓
Calendar → Archive → Voice/Outbox
↓
Nodul sends final Telegram message
↓
Voice/Callbacks/{batch_id}_notification_sent.json
```

| **Компонент** | **Отвечает за**                                                                              | **Не отвечает за**                                 |
|---------------|----------------------------------------------------------------------------------------------|----------------------------------------------------|
| STT           | Транскрипция аудио                                                                           | Финансовая семантика и запись                      |
| LLM NER       | date, amount, type, comment; 0–5 операций                                                    | owner, operation_id, планы, fuzzy matching, запись |
| Nodul         | Авторизация, STT, prompt, LLM, batch, Draft, Confirm signal, Telegram delivery, ACK          | Расчёты бюджета и запись в Sheets                  |
| Apps Script   | Normalize, owner, operation_id, validate, idempotency, Calendar, Archive, Outbox/ACK cleanup | STT и NER                                          |
| Google Sheets | Данные и расчёты                                                                             | Оркестрация Telegram/LLM                           |

# 3. Контракт LLM NER

LLM не создаёт полный Voice Transaction Batch. Его structured output ограничен одним объектом:

```json
{
  "operations": [
    {
      "date": "06.09.2026",
      "amount": 3200,
      "type": "Расход",
      "comment": "Тестовый ресторан"
    }
  ]
}
```

| **Поле LLM** | **Тип** | **Правило**                                                                                                   |
|--------------|---------|---------------------------------------------------------------------------------------------------------------|
| date         | string  | DD.MM.YYYY. Относительные даты приводятся к абсолютным. Период назначения платежа не подменяет дату операции. |
| amount       | number  | Положительное число \> 0. Разговорная форма суммы нормализуется.                                              |
| type         | enum    | Только «Доход» или «Расход». Направление денег должно быть явно понятно из transcript.                        |
| comment      | string  | Непустое краткое описание. Не должно содержать сумму как часть описания.                                      |

- Если направление денег нельзя определить однозначно — operation не создаётся.

- Если нет ни одной валидной операции — LLM возвращает {"operations":\[\]}.

- Если в одном сообщении распознано более 5 операций — возвращается {"operations":\[\]}; частичный batch запрещён.

- LLM не создаёт owner, operation_id, intent, target_hint, confidence_score, warnings.

# 4. Canonical Voice Transaction Batch v2.0

```json
{
  "schema_version": "2.0",
  "batch_id": "vtb_489_1788646884491_tm1kpf",
  "telegram_message_id": "489",
  "telegram_user_id": "562502816",
  "received_at": "2026-09-05T22:21:24.491Z",
  "stt_result": {
    "provider": "whisper",
    "transcript": "Потратил 888 рублей на тестовый магазин"
  },
  "operations": [
    {
      "date": "06.09.2026",
      "amount": 888,
      "type": "Расход",
      "comment": "Тестовый магазин"
    }
  ]
}
```

| **Canonical storage.** Draft / Confirmed / Archive хранят именно batch v2.0. Поля owner и operation_id не являются частью persisted operation JSON; Apps Script добавляет их в оперативной памяти перед валидацией и записью в Calendar. |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 5. Поля batch и operation

## 5.1. Верхний уровень batch

| **Поле**            | **Тип**         | **Обяз.** | **Назначение**                                          |
|---------------------|-----------------|-----------|---------------------------------------------------------|
| schema_version      | string          | Да        | Для live pipeline: "2.0".                               |
| batch_id            | string          | Да        | Уникальный ID batch. Формируется Nodul.                 |
| telegram_message_id | string          | Да        | ID исходного voice message. Основа operation_id.        |
| telegram_user_id    | string          | Да        | Telegram user_id; Apps Script определяет по нему owner. |
| received_at         | ISO 8601 string | Да        | Момент сборки batch.                                    |
| stt_result          | object          | Да        | STT provider + полный transcript.                       |
| operations          | array           | Да        | Для сохранённого Draft: от 1 до 5 валидных операций.    |

## 5.2. stt_result

| **Поле**   | **Тип** | **Обяз.** | **Правило**                                                                     |
|------------|---------|-----------|---------------------------------------------------------------------------------|
| provider   | string  | Да        | Технический идентификатор STT provider.                                         |
| transcript | string  | Да        | Исходный текст распознавания; используется для confirmation card и диагностики. |

## 5.3. operation в persisted batch

| **Поле** | **Тип** | **Обяз.** | **Правило**                  |
|----------|---------|-----------|------------------------------|
| date     | string  | Да        | Canonical: DD.MM.YYYY.       |
| amount   | number  | Да        | Положительное значение \> 0. |
| type     | enum    | Да        | «Доход» или «Расход».        |
| comment  | string  | Да        | Trimmed, непустой.           |

## 5.4. Поля, которые назначает Apps Script

| **Поле**     | **Источник**                      | **Правило**                                                                                                |
|--------------|-----------------------------------|------------------------------------------------------------------------------------------------------------|
| owner        | telegram_user_id → TELEGRAM.USERS | Строго «Муж» / «Жена». Поле LLM owner, если присутствует в legacy batch, игнорируется и перезаписывается.  |
| operation_id | telegram_message_id + index       | Формат {telegram_message_id}\_{index}, index 0-based. Legacy operation_id игнорируется и перезаписывается. |

# 6. Нормализация и валидация

| **Проверка**     | **Runtime правило**                                                                            |
|------------------|------------------------------------------------------------------------------------------------|
| schema_version   | Apps Script принимает 1.0 и 2.0 в переходный период; live Nodul должен создавать 2.0.          |
| Дата             | DD.MM.YYYY обязателен как canonical. Apps Script также принимает YYYY-MM-DD и нормализует его. |
| Реальная дата    | Проверяется календарная валидность, а не только regex.                                         |
| Amount           | Число или числовая строка; пробелы и запятая нормализуются; abs(amount); 0 и NaN запрещены.    |
| Type             | Регистронезависимо нормализуется только «доход»/«расход»; иные значения запрещены.             |
| Comment          | Непустая строка после trim.                                                                    |
| Operations count | 1–VOICE.MAX_OPERATIONS_PER_BATCH; текущий контракт и Nodul ограничивают максимум 5.            |

| **Знаковая конвенция.** В batch amount всегда положительный. При записи в Calendar Apps Script применяет знак: Расход → отрицательное значение, Доход → положительное. |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 7. Подтверждение и жизненный цикл файлов

## 7.1. Voice workspace

```text
Family Budget Automation/
└── AI Workspace/
└── Voice/
├── Drafts/ {batch_id}.json
├── Confirmed/ {batch_id}.json
├── Callbacks/ {batch_id}_confirm.json
│ {batch_id}_notification_sent.json
├── Prompts/ voice_ner_prompt.txt
├── Outbox/ voice_notification_{batch_id}.json
└── Archive/ {batch_id}.json
```

## 7.2. Confirm signal

```json
{
  "batch_id": "vtb_...",
  "action": "confirm",
  "telegram_user_id": "562502816",
  "confirmed_at": "2026-09-05T22:32:20.000Z"
}
```

- Имя файла: {batch_id}\_confirm.json.

- Cancel signal не используется в v2.0.

- Callback branch Nodul заканчивается после создания confirm-файла.

- Кнопка «✅ Подтвердить» может оставаться в старой Telegram-карточке; это допустимое UX-поведение v2.0.

## 7.3. State machine

```text
Draft
└─ confirm → Confirmed
├─ success → Calendar + Archive + Outbox
└─ failure → остаётся Confirmed + error Outbox

Repeat confirm:
Archive exists → idempotent success → no write → no new notification
```

# 8. Идемпотентность и повторные confirm

| **Уровень**      | **Ключ**                                   | **Поведение**                                                                                                 |
|------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| Batch            | batch_id + наличие Archive/{batch_id}.json | Повторный confirm архивированного batch считается успешным и завершается без записи и без нового уведомления. |
| Operation        | voice_operation_id                         | Перед записью Apps Script проверяет, что {telegram_message_id}\_{index} отсутствует в Calendar.               |
| Partial recovery | Confirmed/{batch_id}.json                  | Если Draft уже перемещён, но прошлый запуск оборвался, новый confirm продолжает обработку из Confirmed.       |
| Already recorded | Все operation_id уже в Calendar            | Batch считается успешно обработанным и может быть архивирован без повторной записи.                           |

| **Проверено runtime-тестом.** Повторное нажатие одной и той же кнопки Confirm оставило одну строку в Calendar и одно итоговое Telegram-уведомление; второй confirm завершился как idempotent success. |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 9. Outbox / notification ACK

## 9.1. Outbox request

```json
{
  "requestId": "voice_notify_{batch_id}_{timestamp}",
  "type": "voice_notification",
  "chatId": "562502816",
  "textMessage": "✅ Операция записана",
  "batchId": "vtb_...",
  "timestamp": "2026-09-05T22:32:54.000Z"
}
```

## 9.2. ACK после успешной Telegram-доставки

```json
{
  "action": "notification_sent",
  "batch_id": "vtb_...",
  "notification_file_name": "voice_notification_vtb_....json"
}
```

- Nodul сначала проверяет наличие ACK; при существующем ACK повторная отправка не выполняется.

- ACK создаётся только после успешного Telegram send.

- Apps Script валидирует action и batch_id, затем удаляет соответствующий Outbox-файл.

- Если Outbox-файл уже отсутствует, ACK считается идемпотентно успешным.

- После успешной обработки ACK сам callback-файл отправляется в Trash.

# 10. Запись в лист «Календарь»

VoiceInputManager v2.0 не зависит от физического порядка колонок и определяет их по заголовкам.

| **Заголовок**      | **Значение для voice operation**                              |
|--------------------|---------------------------------------------------------------|
| date               | Дата операции как Date, полученная из DD.MM.YYYY.             |
| owner              | «Муж» / «Жена», определённый Apps Script по telegram_user_id. |
| actual_value_RUR   | Расход \< 0; Доход \> 0.                                      |
| type               | «Расход» / «Доход».                                           |
| comment            | Комментарий LLM после trim.                                   |
| voice_operation_id | {telegram_message_id}\_{index}.                               |

| **Actual-only.** Voice pipeline не требует plan_value_RUR и никогда не выполняет update существующего плана. Каждая подтверждённая новая операция записывается отдельной фактической строкой. |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 11. Ошибки и recovery

| **Ситуация**                                 | **Поведение**                                                            |
|----------------------------------------------|--------------------------------------------------------------------------|
| LLM вернул 0 операций                        | Draft не создаётся; Nodul отправляет recognition error.                  |
| LLM определил \>5 операций                   | Batch отклоняется целиком; partial write запрещён.                       |
| Невалидный batch в Apps Script               | Запись не выполняется; processConfirmedVoiceBatch возвращает errors.     |
| Ошибка при записи нескольких строк           | Выполняется best-effort rollback уже созданных строк в обратном порядке. |
| Batch уже Archive                            | Idempotent success.                                                      |
| Batch отсутствует в Drafts/Confirmed/Archive | Реальная callback error; confirm-файл остаётся для retry.                |
| Ошибка Telegram delivery                     | ACK не создаётся; Outbox остаётся и может быть обработан повторно.       |
| ACK повторяется после удаления Outbox        | Idempotent success; отсутствие файла не считается ошибкой.               |

# 12. Совместимость v1.0 → v2.0

| **Важно.** Совместимость v1.0 в текущем Apps Script является parser compatibility, а не сохранением старой семантики плановых операций. |
|-----------------------------------------------------------------------------------------------------------------------------------------|

| **Legacy элемент v1.0**                           | **Статус в v2.0**                                                                                         |
|---------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| schema_version = "1.0"                            | Временно принимается Apps Script вместе с 2.0.                                                            |
| intent                                            | Deprecated / ignored. Не влияет на запись.                                                                |
| target_hint                                       | Deprecated / ignored. Fuzzy matching удалён.                                                              |
| owner в operation                                 | Ignored; Apps Script вычисляет owner заново.                                                              |
| operation_id в operation                          | Ignored; Apps Script формирует заново.                                                                    |
| confidence_score                                  | Deprecated / ignored.                                                                                     |
| warnings                                          | Deprecated / ignored.                                                                                     |
| audio_metadata                                    | Не требуется live v2.0.                                                                                   |
| stt_result.confidence/language/processing_time_ms | Не требуются live v2.0; могут присутствовать как дополнительные metadata, но runtime на них не опирается. |
| update_planned                                    | Больше не поддерживается как voice behavior; live Nodul v2.0 не должен генерировать v1 plan semantics.    |

# 13. Примеры

## 13.1. Один расход

```text
TRANSCRIPT: Заплатил 123 рубля за тестовый кофе

operations:
[
{"date":"06.09.2026","amount":123,"type":"Расход","comment":"Тестовый кофе"}
]

Calendar actual_value_RUR: -123
```

## 13.2. Две операции

```text
TRANSCRIPT: Получил тестовый доход 100 тысяч рублей и потратил 3 тысячи рублей на тестовый ресторан

operations:
[
{"date":"06.09.2026","amount":100000,"type":"Доход","comment":"Тестовый доход"},
{"date":"06.09.2026","amount":3000,"type":"Расход","comment":"Тестовый ресторан"}
]

operation_id после Apps Script: 474_0, 474_1
```

## 13.3. Относительная дата

```text
CURRENT_DATE: 06.09.2026
TRANSCRIPT: Вчера потратил 3200 рублей на тестовый ресторан

→ date = 05.09.2026
```

## 13.4. Период платежа не является датой

```text
CURRENT_DATE: 06.09.2026
TRANSCRIPT: Заплатил няне 40 тысяч рублей за август

→ date = 06.09.2026
→ amount = 40000
→ type = Расход
→ comment = "Оплата няне за август"
```

## 13.5. Неоднозначное направление денег

```text
TRANSCRIPT: Тестовая операция на 555 рублей

→ {"operations":[]}
```

# 14. Требования к Nodul и Apps Script

## 14.1. Nodul

- Использовать runtime prompt voice_ner_prompt.txt, соответствующий актуальной версии NER-контракта.

- Передавать в LLM CURRENT_DATE и transcript; prompt должен быть декодирован из Base64 в UTF-8.

- Structured output LLM: только operations\[{date, amount, type, comment}\].

- Собирать schema_version 2.0 batch и сохранять Draft только при is_valid = yes.

- Для confirm создавать только {batch_id}\_confirm.json; cancel и удаление inline keyboard не требуются.

- Для Outbox соблюдать ACK-before-resend: если notification_sent ACK уже существует, не отправлять сообщение повторно.

- Создавать notification_sent ACK только после успешного Telegram send.

## 14.2. Apps Script

- Не доверять owner и operation_id из внешнего batch; всегда формировать их локально.

- Проверять реальные даты, amount \> 0, type enum, непустой comment и лимит операций.

- Перед записью проверять voice_operation_id в Calendar.

- Повторный confirm archived batch считать idempotent success.

- При успешной обработке перемещать Confirmed → Archive и создавать одно итоговое уведомление в Voice/Outbox.

- Удалять Outbox только после валидного notification_sent ACK.

- Не выполнять прямые Telegram HTTP-вызовы из VoiceInputManager v2.0.

# 15. Change log v2.0

| **Изменение**                      | **Причина / результат**                                                                     |
|------------------------------------|---------------------------------------------------------------------------------------------|
| Voice стал actual-only             | Удалена неоднозначность между create_new и update_planned; планы вынесены из voice runtime. |
| Минимальный LLM operation          | Снижена ответственность LLM и риск некорректных решений.                                    |
| Owner и operation_id в Apps Script | Детерминированность и защита от hallucination.                                              |
| Prompt v2.2: strict type           | Неоднозначная сумма без направления денег теперь возвращает operations: \[\].               |
| \>5 операций → reject all          | Нет частичных batch и скрытой потери операций.                                              |
| Repeat confirm idempotency         | Оставшаяся кнопка Confirm безопасна; повторный клик не создаёт дубль/уведомление.           |
| Notification ACK                   | Outbox delivery стала идемпотентной без удаления GAS-файлов со стороны Nodul.               |
| Удалён Telegram keyboard cleanup   | Упрощён pipeline; устранена ненадёжная UX-зависимость.                                      |

| **Документационный follow-up.** После принятия v2.0 рекомендуется синхронизировать Project Handbook, Roadmap и CHANGELOG, чтобы они ссылались на actual-only voice architecture и текущий ACK protocol. |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

**КОНЕЦ ДОКУМЕНТА**

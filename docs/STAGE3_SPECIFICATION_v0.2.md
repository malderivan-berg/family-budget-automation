# Family Budget Automation

## Stage 3 — Family Office Analytics & Financial Planning Specification

**Версия документа:** v0.2 — Consolidated Proposed Specification  
**Статус:** Proposed for Implementation  
**Объект изменений:** рабочая Google Sheets / data + отчетный AI pipeline  
**Текущий стабильный проект:** v0.9 Stable, Voice Transaction Batch Schema v2.0  
**Цель:** одна структурная миграция data и единый аналитический Stage 3 без повторной переработки workbook  
**Заменяет:** Stage 3.0 — Data Model & Semantic Integrity Specification (предыдущая редакция)

```text
Ключевой принцип Stage 3
Сначала создается надежная числовая модель в Google Sheets, затем AI получает полный контекст и выполняет интерпретацию. AI owns meaning. Sheets own numbers.
```

# Содержание

> • 1. Статус, нормативная база и границы документа
>
> • 2. Цель Stage 3 и целевой пользовательский результат
>
> • 3. Решения, уже принятые к началу реализации
>
> • 4. Целевая архитектура Stage 3
>
> • 5. Целевая структура workbook data
>
> • 6. Семантическая модель метрик и лист «Расчеты»
>
> • 7. Stage 3.1 — Capital & Cash Flow Reconciliation
>
> • 8. Stage 3.2 — Monthly Financial Plan
>
> • 9. Stage 3.3 — 84-Day Historical Analytics
>
> • 10. Stage 3.4 — User Context
>
> • 11. Stage 3.5 — Market Context
>
> • 12. Stage 3.6 — AI Job Package & Analysis Upgrade
>
> • 13. Stage 3.7 — Report UX
>
> • 14. Stage 3.8 — Regression, Freeze & Documentation
>
> • 15. Последовательность реализации и зависимости
>
> • 16. Acceptance Criteria
>
> • 17. Migration & Compatibility Rules
>
> • 18. Что не входит в Stage 3
>
> • 19. Architecture Governance & Versioning
>
> • 20. Definition of Done
>
> • Приложение A. Канонические metric_key
>
> • Приложение B. Целевые поля новых листов

# 1. Статус, нормативная база и границы документа

Настоящая спецификация консолидирует решения, принятые после аудита текущего data, анализа существующих отчетов, стабилизации actual-only voice pipeline и проектирования следующего аналитического этапа. Она заменяет предыдущую спецификацию Stage 3.0, которая намеренно откладывала историю, USER CONTEXT и market data на последующие подэтапы.

Документ описывает целевой Stage 3 внутри действующей архитектурной философии проекта. Google Sheets остается единственным источником финансовых данных и расчетов; Apps Script остается оркестратором; AI выполняет интерпретацию и генерацию пользовательского отчета. Переход на ReportBuilder / Report Model не является обязательной частью настоящего этапа.

| **Источник**                                    | **Статус**                                            | **Как используется в Stage 3**                                                                                                                       |
|-------------------------------------------------|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Project Handbook v0.9 — Voice Architecture v2.0 | Official Stable                                       | Источник архитектурных правил, Single Source of Truth, governance и границ ответственности компонентов.                                              |
| Voice Transaction Batch Schema v2.0             | Stable                                                | Подтверждает actual-only voice architecture: voice пишет только фактические операции; планы исключены из live-runtime.                               |
| Source Code v0.9 — Voice pipeline update        | Current code snapshot                                 | Определяет текущий HTML-first pipeline, структуру экспорта и точки изменения PromptBuilder/Export/Reports.                                           |
| data 02092026.xlsx                              | Рабочий data snapshot                                 | Источник фактической структуры листов и исторических расчетов. Содержит legacy plan_value_RUR; target Stage 3 исходит из actual-only Calendar.       |
| LLM Analysis Contract v1.0                      | Proposed Draft — Target Architecture, Not Implemented | Используются принципы Grounded Analysis, No Repeat, USER CONTEXT, HISTORICAL DATA и Numerical Authority; сам контракт не активируется автоматически. |
| Report Model Specification v1.0                 | Proposed Draft — Target Architecture, Not Implemented | Используется как ориентир по будущим визуальным сущностям; Stage 3 не требует внедрения ReportBuilder/Report Model.                                  |
| AI Report Schema v1.2                           | Legacy / Superseded Design                            | Только историческая справка; не является новым runtime-контрактом Stage 3.                                                                           |

```text
Статус предыдущей Stage 3.0 Specification
Предыдущая редакция считается superseded после утверждения настоящего документа. Ее полезные решения по boundary dates, metric_key, Net Debt, balance bridge и FX metadata перенесены и расширены здесь.
```

# 2. Цель Stage 3 и целевой пользовательский результат

Stage 3 должен превратить текущий отчет о состоянии капитала в регулярный Family Office отчет, который одновременно объясняет изменение капитала, показывает исполнение финансового плана, сравнивает текущую картину с недавней историей и учитывает пользовательский и рыночный контекст.

После завершения Stage 3 система должна надежно отвечать на пять пользовательских вопросов:

> 1\. Почему изменился семейный капитал и как изменились его основные компоненты?
>
> 2\. Какая часть денежных движений зарегистрирована в Календаре, а какая остается в Unrecorded Net Flow?
>
> 3\. Как семья, муж и жена движутся относительно месячного плана доходов и расходов?
>
> 4\. Насколько текущие значения необычны относительно rolling 84-day history?
>
> 5\. Какие изменения объясняются пользовательским контекстом и внешним рыночным фоном, а какие требуют внимания?

Важный UX-принцип: отчетный период и месячный бюджет существуют параллельно. Отчетный период отвечает на вопрос «что произошло с прошлого snapshot», а month-to-date блок — «как идет текущий календарный месяц относительно плана».

# 3. Решения, уже принятые к началу реализации

| **Область**           | **Принятое решение**                                                                                                                                     |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Voice runtime         | Actual-only. Плановые операции и update_planned не возвращаются в Voice Transaction Batch.                                                               |
| Календарь             | Источник сознательно зарегистрированных фактических доходов и расходов. Мелкие траты могут отсутствовать.                                                |
| Процентные доходы     | Не вносятся в Календарь. Наблюдаются через прирост остатков по депозитам/накопительным счетам и остаются частью анализа финансовых активов.              |
| Планирование          | Отдельный месячный финансовый план, а не plan_value на каждой транзакции.                                                                                |
| Income budget actual  | Только положительные зарегистрированные операции Календаря. Положительный UNF не добавляется в бюджетный доход автоматически.                            |
| Expense budget actual | Зарегистрированные расходы + надежная отрицательная часть Unrecorded Net Flow.                                                                           |
| Investment snapshots  | Для каждого инвестиционного счета добавляется unrealized_pnl_RUR вместе с remaining_value_RUR.                                                           |
| Internal transfers    | Не являются доходом/расходом семьи; не должны искажать UNF. Перевод между ликвидностью и инвестициями отражается только как изменение структуры активов. |
| Capital Flow Gap      | Сохраняется как внутренний промежуточный reconciliation показатель, но не заменяет конечный Unrecorded Net Flow.                                         |
| 84-day history        | Входит в Stage 3 как rolling operational context; долгосрочная история/сезонность остаются за Stage 4.                                                   |
| USER CONTEXT          | Отдельный report-commentary поток, не Voice Transaction Batch.                                                                                           |
| Market data           | Входит в data как raw + calculated context; рынок не заменяет фактический P&L портфеля.                                                                  |

# 4. Целевая архитектура Stage 3

> PRIMARY DATA → Google Sheets calculations → Stage 3 analytical context → AI Job Package → LLM analysis/HTML → Telegram
>
> Primary data: Остатки + Календарь + Финансовый план + Контекст отчетов + Рынки
>
> Calculated data: Расчеты + Сверка капитала + История + Исполнение плана + Рыночный контекст

Apps Script получает новые обязанности только как оркестратор: загрузка raw market data, привязка USER CONTEXT к report_id, чтение рассчитанных листов и сериализация AI Job Package. Финансовые показатели не дублируются в Apps Script.

Stage 3 не требует одновременно менять outbound architecture на ReportBuilder / Report Model. Целевые документы v1.0 остаются Proposed Draft до отдельного решения. Это позволяет сосредоточиться на пользовательской ценности и не смешивать аналитический этап с полной заменой runtime.

# 5. Целевая структура workbook data

После структурной миграции workbook должен иметь следующую целевую модель. Это является Data Foundation для всего Stage 3; после Stage 3.8 структура замораживается.

| **Лист**          | **Класс**       | **Ответственность**                                                                   |
|-------------------|-----------------|---------------------------------------------------------------------------------------|
| Остатки           | Primary         | Snapshot-остатки счетов/активов/обязательств; investment unrealized P&L; FX metadata. |
| Календарь         | Primary         | Только фактические сознательно зарегистрированные доходы/расходы.                     |
| Финансовый план   | Primary         | Версионируемый месячный план доходов и расходов мужа и жены.                          |
| Контекст отчетов  | Primary context | Пояснения пользователя, привязываемые к report_id.                                    |
| Рынки             | External raw    | Сырые внешние рыночные наблюдения.                                                    |
| Показатели        | Metadata        | Словарь metric_key, семантика, scope, unit, history/budget/report roles.              |
| Расчеты           | Calculated      | Нормализованная report-level fact table текущих KPI без legacy plan/fact overloading. |
| Сверка капитала   | Calculated      | Balance bridge, cash-flow reconciliation, Capital Flow Gap, UNF и quality.            |
| История           | Calculated      | 84-day comparable values, statistics and time-series source.                          |
| Исполнение плана  | Calculated      | Month-to-date план/факт, progress, elapsed month, allocated UNF.                      |
| Рыночный контекст | Calculated      | Report-period и 84-day market context.                                                |

```text
Data Freeze principle
Новые metric_key, market_key, report context и планы после Stage 3 должны добавляться преимущественно строками. Добавление новых колонок/листов требует отдельного обоснования, чтобы не возвращаться к структурной переработке data.
```

## 5.1. Лист «Календарь» — целевая модель

Target Calendar является actual-only. Legacy plan_value_RUR из старого snapshot не является частью целевой модели Stage 3.

| **Поле**           | **Назначение**                                                      |
|--------------------|---------------------------------------------------------------------|
| date               | Дата фактической операции.                                          |
| owner              | Муж / Жена. Для voice определяется Apps Script по telegram_user_id. |
| actual_value_RUR   | Доход \> 0; расход \< 0.                                            |
| type               | Доход / Расход.                                                     |
| comment            | Краткое описание операции.                                          |
| voice_operation_id | Идемпотентность voice operation; пусто для обычных ручных строк.    |

Все flow-расчеты report period используют полуоткрытый интервал (period_start ; period_end\], чтобы операции на общей boundary date не попадали одновременно в два отчета.

> date \> period_start AND date \<= period_end

## 5.2. Лист «Остатки» — обязательные расширения

Существующая account snapshot модель сохраняется. Добавляются только поля, которые позволяют устранить неоднозначность инвестиций и FX.

| **Поле**           | **Назначение**                                                          | **Правило**                                                                              |
|--------------------|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| unrealized_pnl_RUR | Текущая нереализованная прибыль/убыток открытых инвестиционных позиций. | Заполняется для инвестиционных счетов на snapshot date; blank, если источник недоступен. |
| currency           | Валюта счета/позиции.                                                   | RUB / USD / EUR / другие фактические валюты.                                             |
| fx_rate_RUB        | FX quote в RUB.                                                         | Не использовать interest_rate как FX после миграции.                                     |
| fx_nominal         | Номинал котировки.                                                      | Нужен для валют вроде AMD и иных котировок не за 1 единицу.                              |
| quantity_native    | Количество единиц валюты.                                               | Позволяет восстанавливать RUB value и при возможности FX effect.                         |

Исторический unrealized_pnl_RUR не восстанавливается предположением. История по этому полю начинается с первого snapshot, для которого пользователь может надежно зафиксировать значение.

# 6. Семантическая модель метрик и лист «Расчеты»

Поскольку Stage 3 включает контролируемое изменение AI Job Package, больше нет необходимости сохранять legacy-overloading start_value_RUR/end_value_RUR для flows. Целевой лист «Расчеты» должен стать нормализованной report-level fact table.

| **Поле**         | **Назначение**                                                                  |
|------------------|---------------------------------------------------------------------------------|
| report_id        | Уникальный report id.                                                           |
| ref_period_id    | Snapshot/period начала.                                                         |
| report_period_id | Snapshot/period конца.                                                          |
| period_start     | Начальная snapshot date.                                                        |
| period_end       | Конечная snapshot date.                                                         |
| duration_days    | Фактическая длительность интервала.                                             |
| metric_key       | Стабильный машинный ключ из Показатели.                                         |
| scope            | family / husband / wife / common.                                               |
| metric_type      | stock / flow / rate / derived_rate / diagnostic.                                |
| unit             | RUR / % / RUR/day / другие утвержденные единицы.                                |
| value_start      | Значение на period_start для stock/rate.                                        |
| value_end        | Значение на period_end для stock/rate.                                          |
| value_period     | Фактическое значение за interval для flow/diagnostic.                           |
| change_abs       | Детерминированное изменение, где оно имеет смысл.                               |
| change_pct       | Процентное изменение только для метрик, где знаменатель экономически корректен. |
| quality_status   | high / medium / review / no_data для метрик с оценочной надежностью.            |

Display name, description, favorable direction, history method и report role принадлежат листу «Показатели». Они не должны быть хардкодированы в формулах и PromptBuilder.

Legacy conclusion_text выводится из расчетного слоя. Во время разработки допускается временный compatibility bridge для текущего HTML-first prompt, но в final Stage 3 schema conclusion_text не является авторитетной метрикой.

## 6.1. Лист «Показатели»

| **Поле**            | **Назначение**                                              |
|---------------------|-------------------------------------------------------------|
| metric_key          | Стабильный идентификатор.                                   |
| legacy_id           | Старый conclusion_id, если метрика имеет legacy-эквивалент. |
| display_name        | Пользовательское название.                                  |
| description         | Точное экономическое определение.                           |
| metric_type         | stock / flow / rate / derived_rate / diagnostic.            |
| scope               | family / husband / wife / common / configurable.            |
| unit                | Единица измерения.                                          |
| history_method      | level / weekly_normalized / end_value / none.               |
| history_enabled     | TRUE/FALSE.                                                 |
| budget_role         | income / expense / none.                                    |
| report_role         | kpi / structure / cashflow / watch / context / internal.    |
| favorable_direction | up / down / contextual.                                     |
| active              | TRUE/FALSE.                                                 |

# 7. Stage 3.1 — Capital & Cash Flow Reconciliation

Stage 3.1 создает два разных, но связанных объяснения периода: balance-sheet bridge показывает, какие классы активов/обязательств изменились; cash-flow reconciliation оценивает, какая часть изменения капитала объясняется зарегистрированными потоками и известными эффектами стоимости.

## 7.1. Канонический balance-sheet bridge

> Net Worth = Gross Real Estate - Gross Mortgage Debt + Investments + Deposits + Liquid Assets
>
> ΔNet Worth = ΔGross Real Estate - ΔGross Mortgage Debt + ΔInvestments + ΔDeposits + ΔLiquid Assets

Этот bridge является математической идентичностью для будущего waterfall. Внутренний перевод, например из накопительного счета в брокерский, должен проявляться как минус в Liquidity и плюс в Investments при нулевом прямом эффекте на Net Worth.

Для каждого report_id и scope рассчитывается bridge_error. Допуск final Stage 3: ABS(bridge_error) \<= 1 RUB.

## 7.2. Gross Mortgage Debt и Net Debt

> gross_mortgage_debt = ABS(SUM(mortgage liabilities))
>
> net_debt = gross_mortgage_debt - liquid_assets - deposits - investments

Gross Mortgage Debt хранится положительным числом. Net Debt \> 0 означает чистый долг; Net Debt \< 0 означает net cash. Описание «совокупная ипотечная задолженность» не используется для Net Debt.

## 7.3. Investment valuation signal

Для каждого инвестиционного счета Stage 3 использует пару snapshot-фактов: remaining_value_RUR и unrealized_pnl_RUR. Это дает достаточный сигнал, чтобы не трактовать любое изменение стоимости брокерского счета как инвестиционную доходность.

| **Паттерн**                                                                                                            | **Интерпретация для AI / quality**                                                               |
|------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| Investment balance резко вырос; unrealized P&L почти не изменился; liquidity снизилась сопоставимо                     | Вероятное пополнение/внутренний перевод. Не считать рост investment balance рыночным доходом.    |
| Investment balance и unrealized P&L выросли в сходном направлении без сопоставимого снижения других финансовых активов | Вероятно значимая рыночная переоценка.                                                           |
| Unrealized P&L заметно снизился, а investment balance почти не снизился                                                | Вероятна фиксация ранее нереализованной прибыли; automated valuation decomposition неоднозначна. |
| Unrealized P&L снизился и investment balance снизился сходно                                                           | Вероятна отрицательная рыночная переоценка, если нет USER CONTEXT о выводе/продаже.              |

AI имеет право интерпретировать такие паттерны как гипотезы. AI не создает авторитетный realized P&L. Если паттерн закрытия позиций делает Δunrealized_pnl неоднозначным, UNF получает quality_status = review и не используется автоматически в monthly budget adjustment.

## 7.4. Capital Flow Gap — только промежуточный показатель

> recorded_net_flow = recorded_income + recorded_expense
>
> capital_flow_gap = ΔNetWorth - recorded_net_flow

Расходы в recorded_expense хранятся со знаком минус. Capital Flow Gap показывает разрыв между изменением капитала и зарегистрированным net flow, но сам по себе не является «неучтенными транзакциями».

## 7.5. Unrecorded Net Flow — конечный residual KPI

Целевой показатель Stage 3 — Unrecorded Net Flow (UNF). Он восстанавливается в Sheets как residual после вычитания известных эффектов, которые меняют Net Worth, но не являются незарегистрированным потребительским денежным потоком.

> unrecorded_net_flow = capital_flow_gap
>
> \- property_valuation_effect
>
> \- investment_valuation_effect
>
> \- debt_principal_effect
>
> \- fx_valuation_effect
>
> \- other_known_effects

Обязательный debt principal effect нужен потому, что Calendar может содержать полный ипотечный платеж как расход. Погашение тела кредита уменьшает cash и одновременно уменьшает liability, поэтому повышает Net Worth относительно recorded expense и иначе выглядело бы как ложный положительный residual.

> debt_principal_effect = -ΔGrossMortgageDebt

Property valuation effect в обычном периоде равен изменению gross real estate valuation. При покупке/продаже объекта или ином структурном событии quality должен быть понижен и USER CONTEXT становится обязательным аналитическим сигналом.

Investment valuation effect в обычном периоде использует изменение unrealized_pnl_RUR как расчетный proxy рыночной переоценки. Если snapshots указывают на вероятную реализацию/закрытие позиции, proxy остается диагностическим, а quality_status понижается.

FX valuation effect рассчитывается только там, где quantity_native и FX metadata позволяют сделать это детерминированно. Если надежная декомпозиция невозможна, эффект остается внутри residual и при материальности снижает quality.

## 7.6. Quality model

| **quality_status** | **Смысл**                                                                                                                        | **Использование**                                                                              |
|--------------------|----------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| high               | Основные non-cash effects определены; нет значимых признаков неоднозначной реализации позиций/структурных событий.               | UNF можно использовать в отчете и monthly expense adjustment.                                  |
| medium             | Есть небольшие потенциальные искажения, но residual полезен как рабочая оценка.                                                  | UNF можно использовать с явной пометкой.                                                       |
| review             | Есть материальная неоднозначность: вероятная фиксация позиции, крупное необъясненное FX/ownership движение, структурное событие. | UNF показывается как диагностический, но не входит автоматически в progress месячных расходов. |
| no_data            | Недостаточно данных для расчета.                                                                                                 | UNF не используется.                                                                           |

Family UNF является основным residual. Personal UNF дополнительно чувствителен к переводам между мужем и женой. Если противоположно направленные персональные residual взаимно компенсируются на family scope, personal quality понижается до review, если нет надежного объяснения.

# 8. Stage 3.2 — Monthly Financial Plan

Месячный план отделяется от операций Календаря. Пользователь задает план доходов и расходов мужа и жены на календарный месяц; семейный план рассчитывается как сумма персональных планов.

## 8.1. Лист «Финансовый план»

| **Поле**       | **Назначение**                                |
|----------------|-----------------------------------------------|
| plan_month     | Календарный месяц YYYY-MM.                    |
| scope          | husband / wife. Family не вводится вручную.   |
| metric_key     | budget_income_plan / budget_expense_plan.     |
| plan_value_RUR | Положительная сумма месячного плана.          |
| version        | Версия плана внутри месяца.                   |
| valid_from     | Дата, с которой версия считается действующей. |
| status         | active / superseded.                          |
| comment        | Опциональное пояснение.                       |

Изменение плана не переписывает историю. Новая версия получает новый valid_from; отчет выбирает версию, действующую на period_end. Это сохраняет аудируемость старых отчетов.

## 8.2. Две временные оси

Weekly/report-period analytics и monthly plan не должны искусственно делить один и тот же период. Для отчета 29.08–05.09 основная аналитика остается 29.08–05.09, а бюджетный блок считает September MTD = 01.09–05.09.

> month_start = DATE(YEAR(period_end), MONTH(period_end), 1)
>
> month_cutoff = period_end

## 8.3. Budget income actual

Доходы месяца определяются только положительными фактическими операциями Календаря. В них могут входить зарплата, премия, налоговый вычет, помощь родителей и другие сознательно зарегистрированные поступления.

> budget_income_actual_mtd = SUM(Calendar actual_value_RUR \> 0, month_start..period_end)

Положительный UNF не добавляется к бюджетному доходу автоматически. Проценты по депозитам/накопительным счетам сознательно не заносятся в Календарь и анализируются через изменение финансовых активов.

## 8.4. Budget expense actual

Расходы Календаря намеренно неполные, поэтому monthly expense progress корректируется надежной отрицательной частью UNF.

> recorded_expense_mtd = ABS(SUM(Calendar expenses, month_start..period_end))
>
> unrecorded_spending = MAX(0, -unrecorded_net_flow)
>
> effective_expense_mtd = recorded_expense_mtd + allocated_unrecorded_spending_mtd

Если UNF quality_status = review или no_data, соответствующая residual-часть не включается в progress и отображается отдельное предупреждение о неполноте оценки.

## 8.5. Как обрабатывать report interval, пересекающий границу месяца

Recorded Calendar operations агрегируются точно по фактическим датам. UNF известен только на уровне report interval, поэтому для monthly budget используется минимальная прозрачная аппроксимация: отрицательный UNF распределяется по календарным дням пересечения интервала с месяцем пропорционально количеству дней.

> overlap_start = MAX(period_start + 1 day, month_start)
>
> overlap_end = MIN(period_end, month_end)
>
> overlap_days = MAX(0, overlap_end - overlap_start + 1)
>
> allocated_unrecorded_spending = MAX(0, -UNF) × overlap_days / duration_days

Эта аппроксимация допустима именно потому, что UNF предназначен прежде всего для мелких незарегистрированных трат без известных дат. Крупные операции по правилам проекта должны попадать в Календарь. Исходный report-period UNF не изменяется; распределение существует только в «Исполнение плана».

## 8.6. Лист «Исполнение плана»

| **Поле**                      | **Назначение**                                                                                         |
|-------------------------------|--------------------------------------------------------------------------------------------------------|
| report_id                     | Отчет, на дату которого считается MTD.                                                                 |
| plan_month                    | Месяц period_end.                                                                                      |
| scope                         | family / husband / wife.                                                                               |
| metric_key                    | budget_income / budget_expense.                                                                        |
| plan_value_RUR                | Действующая версия месячного плана.                                                                    |
| recorded_actual_mtd_RUR       | Точный факт из Календаря.                                                                              |
| unrecorded_adjustment_mtd_RUR | Только отрицательный UNF, распределенный по месяцу; 0 при review/no_data.                              |
| effective_actual_mtd_RUR      | Факт, используемый в progress.                                                                         |
| progress_pct                  | effective_actual / plan.                                                                               |
| month_elapsed_pct             | Доля прошедших календарных дней месяца на period_end.                                                  |
| variance_RUR                  | plan - effective actual для расходов; actual - plan для доходов — семантика фиксируется по metric_key. |
| quality_status                | Качество бюджетного факта.                                                                             |

Для семьи plan_value_RUR рассчитывается как сумма husband + wife. Дублирующие family input rows не создаются.

## 8.7. UX progress bar

В отчете доходы и расходы визуально трактуются по-разному. Доходы показывают степень достижения месячного плана. Расходы показывают долю использованного бюджета и должны сопоставляться с month_elapsed_pct.

Для расходов рекомендуется stacked progress: основная часть — зарегистрированные расходы, дополнительный сегмент — estimated unrecorded spending. Это делает residual прозрачным и не смешивает расчетную оценку с фактическими Calendar rows.

# 9. Stage 3.3 — 84-Day Historical Analytics

Stage 3 получает rolling 84-day operational history. Это переносит в текущий этап только краткосрочный исторический контекст; долгосрочная сезонность, многомесячные и годовые паттерны остаются Stage 4.

## 9.1. Window semantics

> history_window_start = current_period_end - 84 calendar days
>
> historical comparator: period_end \< current_period_end
>
> include observations where period_end \>= history_window_start

Окно определяется календарными днями, а не количеством отчетов. 12 reports не эквивалентны 12 неделям, поскольку фактическая длительность отчетов может быть 7, 9, 23 дня и иной.

## 9.2. Comparable values

| **metric_type**         | **Comparable value**                                                                    |
|-------------------------|-----------------------------------------------------------------------------------------|
| stock                   | value_end.                                                                              |
| flow                    | 7-day normalized value = value_period × 7 / duration_days.                              |
| rate                    | value_end.                                                                              |
| UNF                     | 7-day normalized only for high/medium quality; review/no_data исключаются из агрегатов. |
| monthly budget progress | Не смешивается с weekly 84-day flow history; анализируется в отдельном budget context.  |

Net-worth change percentage не нормализуется как псевдо-доходность. Для капитала используются уровни, абсолютные изменения и фактическая длительность периода.

## 9.3. Лист «История»

| **Поле**                       | **Назначение**                                      |
|--------------------------------|-----------------------------------------------------|
| report_id                      | Observation/report.                                 |
| metric_key                     | Стабильный ключ.                                    |
| scope                          | Scope.                                              |
| period_start / period_end      | Фактический interval.                               |
| duration_days                  | Длительность.                                       |
| raw_value                      | Исходное значение метрики.                          |
| comparable_value               | Нормализованное/level значение по history_method.   |
| hist_count                     | Количество предыдущих observations в 84-day window. |
| hist_min / hist_avg / hist_max | Статистики предыдущих comparable values.            |
| history_start_date             | Первая реально доступная дата comparator window.    |
| quality_status                 | Качество observation.                               |

AI Job Package должен явно передавать hist_count и неполную историю. Формулировка отчета должна быть вида «84-day historical context · 7 previous observations», а не создавать впечатление полного 12-week sample.

# 10. Stage 3.4 — User Context

USER CONTEXT нужен для объяснения событий, которые нельзя надежно вывести только из чисел: ручная переоценка недвижимости, внутренний перевод, открытие/закрытие счета, фиксация инвестиционной позиции, административное изменение.

Этот поток принципиально не использует Voice Transaction Batch Schema v2.0, потому что не является финансовой операцией для записи в Календарь.

## 10.1. Лист «Контекст отчетов»

| **Поле**         | **Назначение**                                                        |
|------------------|-----------------------------------------------------------------------|
| context_id       | Уникальный id.                                                        |
| created_at       | Время получения.                                                      |
| telegram_user_id | Источник Telegram, если применимо.                                    |
| owner            | Муж / Жена / family, если известно.                                   |
| source           | telegram_voice / telegram_text / manual.                              |
| text             | Исходное пользовательское пояснение без финансовой NER-трансформации. |
| status           | pending / bound / archived.                                           |
| report_id        | Назначается после привязки.                                           |
| bound_at         | Время привязки к отчету.                                              |

## 10.2. Поток

> Telegram text → store pending context
>
> Telegram voice → STT only → store transcript as pending context
>
> createNewReport\_() → bind pending context to new report_id → export AI Job Package

Свободный USER CONTEXT не меняет авторитетные числовые расчеты Sheets и не используется как скрытая числовая корректировка. Он влияет только на интерпретацию AI и объяснение quality/аномалий.

# 11. Stage 3.5 — Market Context

Market data добавляется как внешний аналитический контекст. Apps Script получает raw observations из утвержденных источников и записывает их в «Рынки»; все report-level показатели рассчитываются в Sheets.

## 11.1. Raw sheet «Рынки»

| **Поле**       | **Назначение**                       |
|----------------|--------------------------------------|
| market_key     | Стабильный ключ ряда.                |
| date           | Дата observation.                    |
| value          | Сырое значение.                      |
| unit           | Index points / RUB / другие единицы. |
| source         | Источник.                            |
| fetched_at     | Время получения.                     |
| quality_status | ok / stale / missing / error.        |

Начальный набор: IMOEX, RGBI, USD_RUB, EUR_RUB. Индекс недвижимости добавляется после выбора географии и корректного источника. Добавление нового market_key должно требовать новых строк, а не новой колонки.

## 11.2. Лист «Рыночный контекст»

| **Поле**                                    | **Назначение**                                                         |
|---------------------------------------------|------------------------------------------------------------------------|
| report_id                                   | Отчет.                                                                 |
| market_key                                  | Ряд.                                                                   |
| period_start_value                          | Ближайшее допустимое значение к period_start по утвержденному правилу. |
| period_end_value                            | Значение на period_end/последнее доступное.                            |
| period_change_abs / period_change_pct       | Детерминированные Sheets calculations.                                 |
| hist_count / hist_min / hist_avg / hist_max | 84-day market context.                                                 |
| quality_status                              | Качество данных.                                                       |

Market indices не используются для расчета фактического P&L конкретного брокерского счета. Их задача — дать AI внешний фон. Ошибка внешнего источника не должна останавливать отчетный pipeline.

# 12. Stage 3.6 — AI Job Package & Analysis Upgrade

После стабилизации Sheets выполняется одна контролируемая L3-миграция AI Job Package. Цель — не менять контракт несколько раз по мере добавления history/context/market/budget.

> \# SYSTEM INSTRUCTIONS
>
> \# USER CONTEXT
>
> \# BUDGET CONTEXT
>
> \# HISTORICAL DATA
>
> \# MARKET CONTEXT
>
> \# DATASET

USER CONTEXT и HISTORICAL DATA соответствуют направлениям, уже предусмотренным Proposed LLM Analysis Contract. BUDGET CONTEXT и MARKET CONTEXT являются расширениями текущего HTML-first AI Job Package и должны быть формально зафиксированы при Stage 3.6.

## 12.1. Что передается AI

| **Секция**          | **Содержимое**                                                                                                        |
|---------------------|-----------------------------------------------------------------------------------------------------------------------|
| SYSTEM INSTRUCTIONS | Grounded Analysis, Numerical Authority, No Repeat, duration-aware rules, quality handling, запрет новых числовых KPI. |
| USER CONTEXT        | Связанные с report_id пользовательские пояснения.                                                                     |
| BUDGET CONTEXT      | План, recorded actual, UNF adjustment, effective MTD, progress, month elapsed, quality для family/husband/wife.       |
| HISTORICAL DATA     | 84-day stats + previous comparable observations; sample count.                                                        |
| MARKET CONTEXT      | Report-period и 84-day market data с quality.                                                                         |
| DATASET             | Нормализованные текущие report metrics, reconciliation metrics и metric metadata, необходимые для анализа.            |

## 12.2. Правила AI

> • AI может сопоставлять investment balance, unrealized P&L, liquidity, Net Worth, USER CONTEXT и market context для причинных гипотез.
>
> • AI должна формулировать неоднозначные причины как вероятные/возможные, а не как подтвержденный факт.
>
> • AI не должна создавать realized P&L, ROI, новые доли, проценты, forecast или другие числа, отсутствующие в AI Job Package.
>
> • AI обязана учитывать quality_status: review не может подаваться как точный факт.
>
> • AI обязана учитывать фактическую duration_days и не называть 9/23-day interval «неделей».
>
> • AI должна минимизировать повторение одного и того же тезиса между summary, insights, recommendations и watch items.

## 12.3. Runtime boundary

Stage 3.6 изменяет текущий HTML-first AI Job Package и PromptBuilder, но не активирует автоматически LLM Analysis Contract v1.0 / ReportBuilder / Report Model. Это отдельное архитектурное решение и отдельный deployment.

# 13. Stage 3.7 — Report UX

После стабилизации data и AI context формируется единый канонический HTML-report UX. Визуальная аналитика имеет приоритет над длинным пересказом чисел.

| **Порядок** | **Блок**                 | **Основная пользовательская задача**                                        |
|-------------|--------------------------|-----------------------------------------------------------------------------|
| 1           | Executive Summary        | Что главное произошло и где внимание.                                       |
| 2           | Family KPI               | Net Worth, liquidity, debt, ключевые changes.                               |
| 3           | Capital Change Waterfall | Из чего математически сложилось изменение Net Worth.                        |
| 4           | Monthly Financial Plan   | Доходы/расходы MTD vs plan; recorded + estimated unrecorded spending.       |
| 5           | 84-Day Context           | Текущий уровень относительно недавней истории.                              |
| 6           | Capital Structure        | Распределение активов и концентрации.                                       |
| 7           | Liquidity & Idle Cash    | Ликвидность, idle cash, missed interest.                                    |
| 8           | Investments              | Balance + unrealized P&L dynamics; вероятные transfers/market/realizations. |
| 9           | Debt                     | Gross mortgage debt и Net Debt dynamics.                                    |
| 10          | Watch Items              | Только действительно значимые зоны внимания.                                |
| 11          | Husband / Wife           | Персональная аналитика без дублирования family view.                        |
| 12          | Recommendations          | Конкретные действия, основанные на данных/context.                          |

Waterfall использует deterministic balance bridge, а не AI-вычисления. Паттерн визуального waterfall из ранее удачных отчетов может быть использован как UX reference, но арифметика полностью берется из Sheets.

Budget progress расходов должен визуально разделять recorded и estimated unrecorded segment. При quality=review estimated segment не рисуется как часть progress; вместо этого показывается warning.

Historical block обязан показывать sample count. Market block должен быть компактным и не вытеснять семейную финансовую аналитику.

# 14. Stage 3.8 — Regression, Freeze & Documentation

Stage 3.8 является обязательным самостоятельным подэтапом. Data freeze допускается только после регрессии расчетов, AI pipeline, Voice v2.0 и отчета.

## 14.1. Regression cases

> • обычный 7-day interval;
>
> • 9-day interval;
>
> • 23-day interval;
>
> • report interval, пересекающий календарный месяц;
>
> • крупная переоценка недвижимости;
>
> • перевод liquidity → brokerage (контрольный кейс около 1,2 млн ₽ из последнего исторического периода);
>
> • сильное изменение unrealized P&L;
>
> • вероятное закрытие инвестиционной позиции;
>
> • ипотечный платеж с изменением principal;
>
> • период без Calendar operations;
>
> • неполный 84-day sample;
>
> • USER CONTEXT присутствует / отсутствует;
>
> • market source missing/stale;
>
> • UNF high/medium/review/no_data;
>
> • повторная voice confirmation и обычная actual-only voice запись.

## 14.2. Data freeze

После прохождения acceptance tests текущая структура workbook фиксируется как Stage 3 Data Contract. Новые аналитические возможности должны по возможности добавляться через новые строки/metric_key/market_key/context records, а не структурные изменения листов.

После стабилизации обновляются Project Handbook, Roadmap и CHANGELOG. Это особенно важно из-за L3-изменения AI Job Package и переноса rolling history в Stage 3.

# 15. Последовательность реализации и зависимости

| **Подэтап** | **Работа**                           | **Зависит от**                         | **Production switch**                            |
|-------------|--------------------------------------|----------------------------------------|--------------------------------------------------|
| 3.0         | Data Foundation & Semantic Integrity | Baseline audit                         | Нет; работа в копии data.                        |
| 3.1         | Capital & Cash Flow Reconciliation   | 3.0                                    | Нет; сначала regression.                         |
| 3.2         | Monthly Financial Plan               | 3.1 UNF + 3.0 Calendar                 | Можно тестировать в Sheets.                      |
| 3.3         | 84-Day Historical Analytics          | 3.0 metric_key + 3.1 quality           | Можно тестировать в Sheets.                      |
| 3.4         | User Context                         | 3.0 target sheet + Apps Script binding | После теста Telegram flow.                       |
| 3.5         | Market Context                       | 3.0 target sheets                      | Non-blocking, fallback обязателен.               |
| 3.6         | AI Job Package & Prompt Upgrade      | 3.0–3.5 stable                         | L3 production switch; atomic with target export. |
| 3.7         | Report UX                            | 3.6                                    | После стабильного AI input/output.               |
| 3.8         | Regression, Freeze, Docs             | Все выше                               | Финальный release gate.                          |

Ключевая deployment стратегия: target data model разрабатывается в рабочей копии. Production pipeline не переключается на новый «Расчеты» до готовности Stage 3.6. Временные compatibility columns допустимы только как миграционный мост и не входят в final schema.

# 16. Acceptance Criteria

| **Критерий**                | **Условие**                                                                                                                                   |
|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| A. Reporting boundaries     | Каждая Calendar operation относится максимум к одному report interval; используется (start; end\].                                            |
| B. Balance bridge           | Для каждого report_id/scope ABS(bridge_error) \<= 1 RUB.                                                                                      |
| C. Ownership reconciliation | Family = Husband + Wife + Common с допуском \<= 1 RUB там, где scopes определены.                                                             |
| D. Internal transfer        | Перевод между собственными счетами не становится семейным income/expense и не создает ложный UNF.                                             |
| E. Investment semantics     | ΔInvestments нигде не называется инвестиционной доходностью; учитывается unrealized_pnl_RUR.                                                  |
| F. Debt principal           | Погашение тела ипотеки не становится ложным положительным UNF.                                                                                |
| G. UNF quality              | Каждый UNF имеет high/medium/review/no_data; review/no_data не корректируют monthly expense progress.                                         |
| H. Monthly boundary         | Отчет через границу месяца считает Calendar MTD точно по датам; UNF allocation прозрачно пропорциональна overlap days.                        |
| I. Income plan              | Budget income содержит зарегистрированные положительные Calendar operations; positive UNF и банковские проценты не добавляются автоматически. |
| J. Expense plan             | Budget expense = recorded expenses + допустимый отрицательный UNF adjustment.                                                                 |
| K. Plan versioning          | Изменение plan не переписывает исторические reports; используется valid_from/version.                                                         |
| L. 84-day window            | История основана на календарных 84 днях, исключает current report и показывает hist_count.                                                    |
| M. Duration awareness       | 9/23-day interval нигде не маркируется как «week»; flow history нормализуется в Sheets.                                                       |
| N. USER CONTEXT             | Объясненное событие не вызывает ложный AI alert; context не меняет финансовые числа.                                                          |
| O. Market fallback          | Ошибка market data не останавливает отчет.                                                                                                    |
| P. Numerical Authority      | Все пользовательские финансовые числа трассируются к Sheets; AI не рассчитывает новые KPI.                                                    |
| Q. Voice regression         | Voice Transaction Batch v2.0 actual-only, idempotency и ACK pipeline работают без регрессии.                                                  |
| R. Formula integrity        | Нет \#REF!, \#DIV/0!, \#VALUE!, циклических ссылок в target workbook.                                                                         |

# 17. Migration & Compatibility Rules

> • Создать неизменяемую baseline-копию текущего data и зафиксировать значения всех существующих report_id до миграции.
>
> • Legacy plan_value_RUR не переносится как транзакционный план в target Calendar. Исторические actual_value_RUR сохраняются.
>
> • Старые процентные доходы, уже внесенные в Calendar, остаются историческими фактами; новое правило «не вводить проценты» действует вперед, без переписывания истории.
>
> • Исторический unrealized_pnl_RUR не заполняется предположениями. Для недоступных дат используется blank/no_data.
>
> • Metric history привязывается к metric_key, а не display_name; rename метрики не разрывает time series.
>
> • Current production HTML pipeline сохраняется до atomic Stage 3.6 switch. Не допускается промежуточное состояние, где новый «Расчеты» уже production, а PromptBuilder ожидает legacy columns.
>
> • Rollback должен позволять вернуть production на baseline data + Source Code v0.9 до финального freeze.

# 18. Что не входит в Stage 3

> • полный брокерский ledger, восстановление каждой сделки и realized P&L до рубля;
>
> • IRR/portfolio accounting и полноценный tax lot accounting;
>
> • числовые прогнозы капитала/доходов/расходов через LLM;
>
> • долгосрочная многолетняя история, сезонность и годовые паттерны — это Stage 4;
>
> • обязательная активация ReportBuilder / Report Model / LLM Analysis Contract v1.0;
>
> • возврат SCHEMA mode как основной runtime;
>
> • категоризация каждой мелкой траты;
>
> • возврат plan_value_RUR в voice runtime;
>
> • использование рыночных индексов как proxy фактической доходности конкретного портфеля.

# 19. Architecture Governance & Versioning

Внутренние изменения Google Sheets до изменения официального AI Job Package являются L1/L2 в зависимости от характера. Stage 3.6 изменяет официальный AI Job Package и является L3; Project Handbook должен быть обновлен до production switch.

Текущие Proposed LLM Analysis Contract v1.0 и Report Model Specification v1.0 уже используют обозначение target project version v1.0, но Stage 3 не обязан активировать эту целевую архитектуру. До Stage 3.6 необходимо один раз разрешить versioning collision: определить release version для HTML-first Stage 3 и при необходимости переименовать target architecture version в документации.

```text
Governance checkpoint
Не следует внедрять ReportBuilder только ради совпадения номера версии. Версионирование должно отражать фактические контракты, а не диктовать архитектурный рефакторинг.
```

# 20. Definition of Done

Stage 3 считается завершенным, когда одновременно выполнены следующие условия:

> 1\. target workbook мигрирован и стабилен;
>
> 2\. metric_key и target Расчеты используются production pipeline;
>
> 3\. balance bridge и UNF проходят regression;
>
> 4\. monthly plan и progress работают для family/husband/wife, включая month boundary;
>
> 5\. 84-day history работает с корректной duration normalization и sample count;
>
> 6\. USER CONTEXT передается в AI Job Package;
>
> 7\. market context работает с non-blocking fallback;
>
> 8\. AI Job Package изменен один раз и задокументирован;
>
> 9\. HTML report использует новые KPI/visual patterns и не нарушает Numerical Authority;
>
> 10\. все regression cases и acceptance criteria пройдены;
>
> 11\. Voice v2.0 не имеет регрессий;
>
> 12\. структура data объявлена frozen для дальнейшего Stage 3;
>
> 13\. обновлены Project Handbook, Roadmap и CHANGELOG.

# Приложение A. Канонические metric_key

Ниже приведен минимальный required registry. Final workbook может расширять список строками, но код не должен предполагать фиксированное количество метрик.

| **metric_key**                    | **display_name**                           | **type**        | **scope** | **history**         | **report_role**    |
|-----------------------------------|--------------------------------------------|-----------------|-----------|---------------------|--------------------|
| net_worth_family                  | Чистый капитал семьи                       | stock           | family    | level               | kpi                |
| net_worth_husband                 | Чистый капитал мужа                        | stock           | husband   | level               | person             |
| net_worth_wife                    | Чистый капитал жены                        | stock           | wife      | level               | person             |
| net_worth_common                  | Общий капитал                              | stock           | common    | level               | internal/context   |
| deposits_family                   | Депозиты семьи                             | stock           | family    | level               | structure          |
| deposits_husband                  | Депозиты мужа                              | stock           | husband   | level               | person             |
| deposits_wife                     | Депозиты жены                              | stock           | wife      | level               | person             |
| investments_family                | Инвестиции семьи                           | stock           | family    | level               | structure          |
| investments_husband               | Инвестиции мужа                            | stock           | husband   | level               | person             |
| investments_wife                  | Инвестиции жены                            | stock           | wife      | level               | person             |
| investment_unrealized_pnl_family  | Нереализованный результат инвестиций семьи | stock           | family    | level               | investment         |
| investment_unrealized_pnl_husband | Нереализованный результат инвестиций мужа  | stock           | husband   | level               | investment         |
| investment_unrealized_pnl_wife    | Нереализованный результат инвестиций жены  | stock           | wife      | level               | investment         |
| gross_real_estate_family          | Валовая стоимость недвижимости семьи       | stock           | family    | level               | internal/structure |
| gross_real_estate_husband         | Валовая стоимость недвижимости мужа        | stock           | husband   | level               | person             |
| gross_real_estate_wife            | Валовая стоимость недвижимости жены        | stock           | wife      | level               | person             |
| gross_mortgage_debt_family        | Валовый ипотечный долг семьи               | stock           | family    | level               | debt               |
| gross_mortgage_debt_husband       | Валовый ипотечный долг мужа                | stock           | husband   | level               | debt               |
| gross_mortgage_debt_wife          | Валовый ипотечный долг жены                | stock           | wife      | level               | debt               |
| net_real_estate_family            | Чистая стоимость недвижимости семьи        | stock           | family    | level               | structure          |
| net_real_estate_husband           | Чистая стоимость недвижимости мужа         | stock           | husband   | level               | person             |
| net_real_estate_wife              | Чистая стоимость недвижимости жены         | stock           | wife      | level               | person             |
| liquid_assets_family              | Ликвидные активы семьи                     | stock           | family    | level               | liquidity          |
| liquid_assets_husband             | Ликвидные активы мужа                      | stock           | husband   | level               | person             |
| liquid_assets_wife                | Ликвидные активы жены                      | stock           | wife      | level               | person             |
| common_cash                       | Общие наличные сбережения                  | stock           | common    | level               | context            |
| net_debt_family                   | Чистый долг семьи                          | stock           | family    | level               | debt               |
| recorded_income_family            | Учтенные доходы семьи                      | flow            | family    | weekly_normalized   | cashflow           |
| recorded_income_husband           | Учтенные доходы мужа                       | flow            | husband   | weekly_normalized   | person             |
| recorded_income_wife              | Учтенные доходы жены                       | flow            | wife      | weekly_normalized   | person             |
| recorded_expense_family           | Учтенные расходы семьи                     | flow            | family    | weekly_normalized   | cashflow           |
| recorded_expense_husband          | Учтенные расходы мужа                      | flow            | husband   | weekly_normalized   | person             |
| recorded_expense_wife             | Учтенные расходы жены                      | flow            | wife      | weekly_normalized   | person             |
| unrecorded_net_flow_family        | Неучтенный чистый денежный поток семьи     | flow/diagnostic | family    | weekly_normalized\* | watch              |
| unrecorded_net_flow_husband       | Неучтенный чистый денежный поток мужа      | flow/diagnostic | husband   | weekly_normalized\* | person/watch       |
| unrecorded_net_flow_wife          | Неучтенный чистый денежный поток жены      | flow/diagnostic | wife      | weekly_normalized\* | person/watch       |
| idle_cash_family                  | Бездействующие деньги семьи                | stock           | family    | level               | watch              |
| idle_cash_husband                 | Бездействующие деньги мужа                 | stock           | husband   | level               | person             |
| idle_cash_wife                    | Бездействующие деньги жены                 | stock           | wife      | level               | person             |
| min_savings_rate                  | Минимальная ставка по накопительным счетам | rate            | family    | end_value           | liquidity          |
| missed_interest_daily_family      | Ежедневный упущенный процентный доход      | derived_rate    | family    | end_value           | watch              |

\* UNF включается в history aggregates только при quality_status high/medium.

# Приложение B. Целевые поля новых листов

## Показатели

> metric_key, legacy_id, display_name, description, metric_type, scope, unit, history_method, history_enabled, budget_role, report_role, favorable_direction, active

## Сверка капитала

> report_id, scope, period_start, period_end, duration_days, net_worth_start, net_worth_end, net_worth_change, gross_real_estate_start, gross_real_estate_end, gross_real_estate_change, gross_mortgage_debt_start, gross_mortgage_debt_end, gross_mortgage_debt_change, investments_start, investments_end, investments_change, unrealized_pnl_start, unrealized_pnl_end, unrealized_pnl_change, deposits_start, deposits_end, deposits_change, liquid_assets_start, liquid_assets_end, liquid_assets_change, bridge_change, bridge_error, recorded_income, recorded_expense, recorded_net_flow, capital_flow_gap, property_valuation_effect, investment_valuation_effect, debt_principal_effect, fx_valuation_effect, other_known_effects, unrecorded_net_flow, quality_status, note

## Финансовый план

> plan_month, scope, metric_key, plan_value_RUR, version, valid_from, status, comment

## Исполнение плана

> report_id, plan_month, scope, metric_key, plan_value_RUR, recorded_actual_mtd_RUR, unrecorded_adjustment_mtd_RUR, effective_actual_mtd_RUR, progress_pct, month_elapsed_pct, variance_RUR, quality_status, note

## История

> report_id, metric_key, scope, period_start, period_end, duration_days, raw_value, comparable_value, hist_count, hist_min, hist_avg, hist_max, history_start_date, quality_status

## Контекст отчетов

> context_id, created_at, telegram_user_id, owner, source, text, status, report_id, bound_at

## Рынки

> market_key, date, value, unit, source, fetched_at, quality_status

## Рыночный контекст

> report_id, market_key, period_start_value, period_end_value, period_change_abs, period_change_pct, hist_count, hist_min, hist_avg, hist_max, quality_status

# Change log v0.2

| **Изменение**                     | **Причина / результат**                                                                                                                 |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Stage 3 scope consolidated        | History, USER CONTEXT, market data и monthly plan больше не откладываются на отдельные структурные миграции data.                       |
| Monthly Financial Plan added      | Планы вынесены из Calendar; MTD progress работает независимо от weekly report boundaries.                                               |
| UNF restored as target KPI        | Capital Flow Gap остается промежуточным; unrealized_pnl_RUR и debt principal correction позволяют получить practically useful residual. |
| Investment snapshot enriched      | Добавлен unrealized_pnl_RUR; internal transfer не трактуется как market P&L.                                                            |
| Budget residual allocation        | Cross-month negative UNF распределяется по overlap days только для monthly expense estimate.                                            |
| 84-day history moved into Stage 3 | Операционный historical context нужен AI уже на текущем аналитическом этапе.                                                            |
| AI Job Package expanded once      | USER / BUDGET / HISTORICAL / MARKET / DATASET вводятся одной L3-миграцией.                                                              |
| Target Расчеты normalized         | Убрано legacy plan/fact overloading; metric_key становится частью report fact table.                                                    |

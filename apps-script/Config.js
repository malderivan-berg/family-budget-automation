/**
 * ============================================================================
 * Family Budget Automation
 * Config.gs
 * ----------------------------------------------------------------------------
 * Централизованное хранение всех настроек проекта.
 * Изменение настроек производится только в этом файле.
 * ============================================================================
 */

// -----------------------------------------------------------------------------
// Project
// -----------------------------------------------------------------------------
const PROJECT_NAME = 'Family Budget Automation';
const PROJECT_VERSION = '1.0';

// -----------------------------------------------------------------------------
// Google Sheets
// -----------------------------------------------------------------------------
const SOURCE_SHEET_NAME = 'Расчеты';
const START_ROW = 2;
const START_COL = 1;

// -----------------------------------------------------------------------------
// Calendar Sheet (Лист "Календарь") — v0.9+
// -----------------------------------------------------------------------------
const CALENDAR_SHEET_NAME = 'Календарь';
const CALENDAR_COLUMNS = {
  DATE: 1,              // Колонка A: date
  OWNER: 2,             // Колонка B: owner
  PLAN_VALUE: 3,        // Колонка C: plan_value_RUR
  ACTUAL_VALUE: 4,      // Колонка D: actual_value_RUR
  TYPE: 5,              // Колонка E: type
  COMMENT: 6,           // Колонка F: comment
  VOICE_OPERATION_ID: 7 // Колонка G: voice_operation_id (v0.9+)
};

// -----------------------------------------------------------------------------
// Market Data — Stage 3.5
// -----------------------------------------------------------------------------
const MARKET_DATA = {
  SHEET_NAME: 'Рынки',

  // 84-day report history + небольшой запас.
  LOOKBACK_DAYS: 100,

  QUALITY_OK: 'ok',

  TRIGGER: {
    HOUR: 8
  },

  SOURCES: {
    MOEX: 'MOEX ISS',
    CBR_FX: 'CBR XML',
    CBR_KEY_RATE: 'CBR DailyInfo',
    ROSSTAT_HOUSING: 'Rosstat'
  },

  MOEX: {
    BASE_URL:
      'https://iss.moex.com/iss/history/engines/stock/markets/index/securities/',

    SECURITIES: {
      IMOEX: 'IMOEX',
      RGBI: 'RGBI',
      MREDC: 'MREDC'
    }
  },

  CBR: {
    FX_URL:
      'https://www.cbr.ru/scripts/XML_dynamic.asp',

    SOAP_URL:
      'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx',

    // Ключевая ставка существует как официальный ряд с 17.09.2013.
    KEY_RATE_START: '2013-09-17',

    CURRENCIES: {
      USD_RUB: {
        code: 'R01235',
        unit: 'RUB_per_USD'
      },

      CNY_RUB: {
        code: 'R01375',
        unit: 'RUB_per_CNY'
      }
    }
  },

  // Quarterly official housing benchmarks.
  //
  // Источник значений: официальный Росстат.
  // Получение значений controlled manual, потому что автоматический
  // UrlFetchApp access к Rosstat сейчас не является надежным.
  //
  // ВАЖНО:
  // - market_key не менять;
  // - date observation = последний календарный день квартала;
  // - published_at = фактическая дата официальной публикации Росстата;
  // - fetched_at назначает Apps Script при первом успешном импорте.
  ROSSTAT: {
    HOUSING_UNIT: 'RUB_per_m2',

    HOUSING_BENCHMARKS: {
      MOSCOW: {
        marketKey: 'MOSCOW_HOUSING_PRICE_SQM',
        label: 'Москва'
      },

      SPB: {
        marketKey: 'SPB_HOUSING_PRICE_SQM',
        label: 'Санкт-Петербург'
      }
    }
  },

  FRESHNESS_DAYS: {
    IMOEX: 7,
    RGBI: 7,
    USD_RUB: 7,
    CNY_RUB: 7,

    // MREDC публикуется еженедельно.
    MOSCOW_HOUSING_MREDC: 14
  }
};

// -----------------------------------------------------------------------------
// Menu
// -----------------------------------------------------------------------------
const MENU_NAME = 'Family Budget';

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------
const REPORT_ID_COLUMN = 1; // Колонка A

// -----------------------------------------------------------------------------
// Листы с блоком строк на каждый отчёт (data v1.2, Stage 3)
// Новый отчёт копирует последний блок «Расчетов»; эти листы достраиваются
// до последнего отчёта — см. syncReportSheets_() в Reports.gs
// -----------------------------------------------------------------------------
const REPORT_SHEETS = {
  // Строка N повторяет строку N листа SOURCE_SHEET_NAME
  MIRROR: ['История'],

  // Блок строк на каждый report_id; колонка A — report_id
  PER_REPORT: ['Сверка капитала', 'Исполнение плана', 'Рыночный контекст']
};

// -----------------------------------------------------------------------------
// Перенос данных data v1.1 → data v1.2 (Stage 3, шаг 5.4).
// Удаляется вместе с MigrationManager.gs после переключения на v1.2.
// -----------------------------------------------------------------------------
const MIGRATION_V11 = {
  // ID таблицы data v1.1 — идентификатор, не секрет
  SOURCE_SPREADSHEET_ID: '15x5pS4fRFb-gQZaxtrPlc9SZvFPyaBE_xKsfaHDBhsY',

  BALANCES_SHEET: 'Остатки',
  CALENDAR_SHEET: 'Календарь',

  // Периоды v1.1 начиная с этого переносятся; более ранние в v1.2 выверены
  FIRST_PERIOD_ID: 10,

  // Календарь v1.2 выверен по эту дату включительно
  CALENDAR_BASELINE_END: '2026-09-08',

  DEFAULT_CURRENCY: 'RUB',
  VALUE_ROLE_BALANCE: 'balance',
  VALUE_ROLE_UNREALIZED: 'unrealized_pnl',

  // Счета, которых нет в v1.2: «владелец|счёт» → account_key
  NEW_ACCOUNT_KEYS: {
    'Жена|АБ_депозит_3': 'wife_ab_deposit_3',
    'Муж|ТБ_ТТФ': 'husband_tb_ttf'
  },

  BALANCE_COLUMNS: {
    PERIOD: 'period_id',
    ACCOUNT_KEY: 'account_key',
    DATE: 'date',
    OWNER: 'owner',
    ACCOUNT_NAME: 'account_name',
    VALUE_NATIVE: 'value_native',
    VALUE_RUR: 'remaining_value_RUR',
    CURRENCY: 'currency',
    FX_RATE: 'fx_rate_RUR',
    VALUE_ROLE: 'value_role'
  },

  // Колонки «Остатков», которые переносятся из v1.1 как есть
  COPIED_COLUMNS: ['interest_rate', 'bank_name', 'account_type',
    'account_category1', 'account_category2', 'comment'],

  CALENDAR_COLUMNS: {
    DATE: 'date',
    OWNER: 'owner',
    AMOUNT: 'actual_value_RUR',
    TYPE: 'type',
    COMMENT: 'comment',
    VOICE_ID: 'voice_operation_id'
  }
};

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------
const MSG_NO_DATA = 'Нет данных для обработки.';
const MSG_REPORT_NOT_FOUND = 'Отчет не найден.';
const MSG_SHEET_NOT_FOUND = 'Лист не найден.';

// -----------------------------------------------------------------------------
// Google Drive
// -----------------------------------------------------------------------------
const DRIVE = {
  // Корневая папка проекта
  ROOT_FOLDER: 'Family Budget Automation',
  // Рабочая папка: Telegram, Voice
  AI_WORKSPACE_FOLDER: 'AI Workspace',
  // Отчёты: Reports/YYYY/YYYY-MM/Report_N_YYYY-MM-DD/
  REPORTS_FOLDER: 'Reports',
  // Telegram интеграция
  TELEGRAM_FOLDER: 'Telegram',
  TELEGRAM_OUTBOX_FOLDER: 'Outbox',
  TELEGRAM_INBOX_FOLDER: 'Inbox',
  // Voice интеграция (v0.9+)
  VOICE_FOLDER: 'Voice',
  VOICE_DRAFTS_FOLDER: 'Drafts',
  VOICE_CONFIRMED_FOLDER: 'Confirmed',
  VOICE_CALLBACKS_FOLDER: 'Callbacks',
  VOICE_ARCHIVE_FOLDER: 'Archive',
  VOICE_OUTBOX_FOLDER: 'Outbox'
};

// -----------------------------------------------------------------------------
// Telegram Configuration
// -----------------------------------------------------------------------------
const TELEGRAM = {

  // Пользователи для отправки отчетов
  USERS: [
    {
      userId: '562502816',
      chatId: '562502816',
      name: 'Husband'
    },
    
    {
      userId: '262678128',
      chatId: '262678128',
      name: 'Wife'
    }
  ],
  
  // Настройки отправки
  SEND_TIMEOUT_MS: 30000, // 30 секунд
  MAX_RETRY_ATTEMPTS: 3
};

// -----------------------------------------------------------------------------
// Voice Input Configuration (v0.9+)
// -----------------------------------------------------------------------------
const VOICE = {
  // Лимиты
  MAX_OPERATIONS_PER_BATCH: 5,
  MAX_AUDIO_DURATION_SECONDS: 60,
  
  // Пороги
  CONFIDENCE_THRESHOLD: 0.85,
  
  // Fuzzy matching
  FUZZY_DATE_RANGE_DAYS: 7,
  
  // Форматы
  OPERATION_ID_FORMAT: '{message_id}_{index}',
  BATCH_ID_FORMAT: 'vtb_{timestamp}_{random}',
  
  // Статусы
  STATUS_DRAFT: 'draft',
  STATUS_CONFIRMED: 'confirmed',
  STATUS_ARCHIVED: 'archived',
  STATUS_FAILED: 'failed'
};

// -----------------------------------------------------------------------------
// Voice Messages (v0.9+)
// -----------------------------------------------------------------------------
const VOICE_MESSAGES = {
  INVALID_BATCH: 'Некорректный формат Voice Transaction Batch',
  DUPLICATE_OPERATION: 'Операция уже существует (идемпотентность)',
  PLAN_NOT_FOUND: 'План не найден для обновления',
  MULTIPLE_PLANS_FOUND: 'Найдено несколько кандидатов для обновления',
  ACTUAL_ALREADY_FILLED: 'Фактическое значение уже заполнено',
  INVALID_DATE: 'Некорректный формат даты',
  INVALID_OWNER: 'Некорректный владелец операции',
  INVALID_TYPE: 'Некорректный тип операции',
  INVALID_AMOUNT: 'Сумма должна быть положительным числом',
  LOW_CONFIDENCE: 'Низкая уверенность распознавания'
};

// -----------------------------------------------------------------------------
// Report Agent — отчёт строит агент Claude по API-триггеру
// См. docs/TARGET_ARCHITECTURE_v1.0.md
// -----------------------------------------------------------------------------
const REPORT_AGENT = {
  // true — отчёт доставляется только пользователю ALERT_USER_NAME (пилот)
  TEST_MODE: false,

  // Через сколько минут после запуска проверять доставку
  DELIVERY_CHECK_MINUTES: 30,

  // Пользователь из TELEGRAM.USERS, которому приходят предупреждения
  ALERT_USER_NAME: 'Husband',

  // Контракт выгрузки report_data
  DATA_SCHEMA_VERSION: '1.0',

  // Имена файлов; {id} заменяется на report_id
  FILES: {
    DATA: 'report_data_{id}.json',
    HTML: 'report_{id}.html',
    ERROR: 'report_{id}_error.md',
    TELEGRAM_REQUEST: 'telegram_request_{id}.json',
    TELEGRAM_RESPONSE: 'telegram_response_{id}.json'
  },

  // Заголовки вызова /fire (research preview — см. документацию Claude Code)
  ANTHROPIC_BETA: 'experimental-cc-routine-2026-04-01',
  ANTHROPIC_VERSION: '2023-06-01',
  FIRE_URL_PREFIX: 'https://api.anthropic.com/v1/claude_code/routines/',

  // Telegram Bot API — только для предупреждений о сбое
  TELEGRAM_API_URL: 'https://api.telegram.org/bot',

  // Состояние последнего запуска (Script Properties)
  STATE_PROPERTY: 'report_agent_state',

  // Публичная функция для отложенной проверки доставки
  CHECK_HANDLER: 'checkReportDelivered',

  LOCK_TIMEOUT_MS: 10000,

  STATUS: {
    CREATED: 'created',
    EXPORTED: 'exported',
    FIRED: 'fired',
    FIRE_FAILED: 'fire_failed',
    DELIVERED: 'delivered',
    DELIVERY_FAILED: 'delivery_failed',
    NOT_DELIVERED: 'not_delivered',
    AGENT_FAILED: 'agent_failed',
    NO_REPORT: 'no_report',
    RESENT: 'resent'
  },

  STATUS_TEXT: {
    created: 'отчёт создан в таблице, выгрузки ещё нет',
    exported: 'выгрузка создана, агент не запущен',
    fired: 'агент запущен, ждём отчёт',
    fire_failed: 'не удалось запустить агента',
    delivered: 'отчёт доставлен в Telegram',
    delivery_failed: 'Nodul сообщил об ошибке доставки',
    not_delivered: 'отчёт создан, но не доставлен',
    agent_failed: 'агент не смог построить отчёт',
    no_report: 'агент не создал отчёт вовремя',
    resent: 'отчёт отправлен повторно, ждём доставку'
  },

  MENU: {
    RUN: 'Сформировать отчёт',
    STATUS: 'Статус отчёта',
    RESEND: 'Отправить отчёт повторно',
    RETRY: 'Повторить запуск агента',
    SETUP: 'Проверить настройку агента'
  }
};

// Имена Script Properties с секретами. Значения задаются только в
// «Настройки проекта → Свойства скрипта» и никогда не пишутся в код.
const SCRIPT_PROPS = {
  FIRE_URL: 'REPORT_AGENT_FIRE_URL',
  FIRE_TOKEN: 'REPORT_AGENT_TOKEN',
  BOT_TOKEN: 'TELEGRAM_BOT_TOKEN'
};

// ============================================================================
// ПУБЛИЧНАЯ ТОЧКА ВХОДА ДЛЯ ТРИГГЕРА (v0.9+)
// ============================================================================

/**
 * Публичная функция для запуска обработки callback-сигналов.
 * 
 * Вызывается time-driven триггером каждые 2 минуты.
 * Делегирует работу приватной функции processVoiceCallbacks_().
 * 
 * ВАЖНО: Имя функции НЕ должно начинаться с "_" — иначе она не появится
 * в списке триггеров Apps Script UI.
 */
function runProcessVoiceCallbacks() {
  processVoiceCallbacks_();
}
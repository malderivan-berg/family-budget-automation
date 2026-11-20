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
const PROJECT_VERSION = '0.9';

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
const MENU_EXPORT = 'Экспорт report_id';
const MENU_CREATE_REPORT = 'Создать новый отчет';

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------
const EXPORT_SHEET_NAME = 'Экспорт';
const EXPORT_FILE_PREFIX = 'Экспорт_report_id_';
const DATE_TIME_FORMAT = 'yyyy-MM-dd_HH-mm-ss';

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------
const REPORT_ID_COLUMN = 1; // Колонка A
var HTML_REPORT_FOLDER_ID = '';
var ENABLE_HTML_REPORT_LOG = true;

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------
const MSG_NO_DATA = 'Нет данных для обработки.';
const MSG_NOTHING_ENTERED = 'Ничего не введено.';
const MSG_REPORT_NOT_FOUND = 'Отчет не найден.';
const MSG_SHEET_NOT_FOUND = 'Лист не найден.';

// -----------------------------------------------------------------------------
// Google Drive
// -----------------------------------------------------------------------------
const DRIVE = {
  // Корневая папка проекта
  ROOT_FOLDER: 'Family Budget Automation',
  // Папка с рабочей Google Sheets
  DATA_FOLDER: 'Data',
  // Рабочая папка конвейера (используется ИИ-оркестратором)
  AI_WORKSPACE_FOLDER: 'AI Workspace',
  // Подпапка для AI Job Package
  AI_JOB_FOLDER: 'Job',
  // Архив отчетов
  REPORTS_FOLDER: 'Reports',
  // Архив временных файлов
  ARCHIVE_FOLDER: 'Archive',
  // Входящие файлы (на будущее)
  INBOX_FOLDER: 'Inbox',
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
// Project Files
// -----------------------------------------------------------------------------
const PROJECT_FILES = {
  AI_JOB_PACKAGE: 'AI Job Package.txt',
  AI_RESPONSE: 'AI Response.json',
  AI_REPORT_HTML: 'AI_Report.html',
  HTML_REPORT: 'Family Budget Report.html',
  DATASET: 'Financial Data.xlsx',
  METADATA: 'report_metadata.json',
  TELEGRAM_REQUEST: 'telegram_request.json',
  TELEGRAM_RESPONSE: 'telegram_response.json',
  VOICE_NER_PROMPT: 'voice_ner_prompt.txt'
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
// Archive File Prefixes
// -----------------------------------------------------------------------------
const ARCHIVE_FILES = {
  AI_JOB_PACKAGE: 'AI Job Package',
  AI_RESPONSE: 'AI Response',
  AI_REPORT_HTML: 'AI Report',
  HTML_REPORT: 'Family Budget Report',
  DATASET: 'Financial Data'
};

// -----------------------------------------------------------------------------
// REPORT MODE
// -----------------------------------------------------------------------------
// Current stable v0.9 mode.
const AI_PIPELINE_MODE = 'HTML';

// Legacy SCHEMA compatibility path.
// Not current runtime and not target v1.0 architecture.
// const AI_PIPELINE_MODE = 'SCHEMA';

// -----------------------------------------------------------------------------
// Pipeline Settings
// -----------------------------------------------------------------------------
const PIPELINE = {
  POLL_INTERVAL_MINUTES: 1,
  TIMEOUT_MINUTES: 10,
  STATUS_PENDING: 'pending',
  STATUS_COMPLETED: 'completed',
  STATUS_FAILED: 'failed',
  STATUS_TIMEOUT: 'timeout'
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
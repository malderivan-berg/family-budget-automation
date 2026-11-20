/**
 * ============================================================================
 * Family Budget Automation
 * VoiceInputManager.gs
 * ----------------------------------------------------------------------------
 * Модуль обработки голосового ввода фактических финансовых операций.
 *
 * Целевая логика:
 * Telegram Voice
 *   → STT
 *   → LLM: date / amount / type / comment
 *   → Draft
 *   → Confirm
 *   → Apps Script: normalize / validate / idempotency / append
 *   → Calendar
 *   → Archive
 *   → Voice/Outbox
 *   → Nodul
 *   → одно итоговое уведомление Telegram
 *   → notification_sent ACK
 *
 * Ключевые принципы:
 * 1. Голосовой ввод создаёт только фактические операции.
 * 2. Плановые операции и fuzzy matching не используются.
 * 3. owner определяется только по telegram_user_id.
 * 4. operation_id формируется только Apps Script:
 *      {telegram_message_id}_{index}
 * 5. amount нормализуется в положительное число;
 *    знак при записи определяется только по type.
 * 6. confidence_score не используется для принятия решения.
 * 7. Колонки листа "Календарь" определяются по заголовкам.
 * 8. Повторный confirm идемпотентен:
 *    если batch уже в Archive, повторная запись и уведомление не создаются.
 * 9. Telegram confirmation keyboard намеренно не удаляется.
 *
 * Переходная совместимость:
 * - принимается schema_version 1.0 и 2.0;
 * - старые поля intent / target_hint / owner / operation_id /
 *   confidence_score / warnings могут присутствовать, но не являются
 *   источником истины и не влияют на запись.
 * ============================================================================
 */

// ============================================================================
// ЛОКАЛЬНЫЕ КОНСТАНТЫ МОДУЛЯ
// ============================================================================

const VOICE_INPUT_SCHEMA_VERSIONS = ['1.0', '2.0'];

const VOICE_CALENDAR_HEADERS = Object.freeze({
  DATE: 'date',
  OWNER: 'owner',
  ACTUAL_VALUE: 'actual_value_RUR',
  TYPE: 'type',
  COMMENT: 'comment',
  VOICE_OPERATION_ID: 'voice_operation_id'
});

const VOICE_CALLBACK_CONFIG = Object.freeze({
  MAX_FILES_PER_RUN: 10,
  LOCK_TIMEOUT_MS: 5000
});

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ЛИСТОМ "КАЛЕНДАРЬ"
// ============================================================================

/**
 * Возвращает объект листа "Календарь".
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getCalendarSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CALENDAR_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Лист "' + CALENDAR_SHEET_NAME + '" не найден в Google Sheets'
    );
  }

  return sheet;
}

/**
 * Возвращает карту колонок листа "Календарь" по заголовкам.
 * Физический порядок колонок не имеет значения.
 *
 * Обязательные заголовки:
 * date
 * owner
 * actual_value_RUR
 * type
 * comment
 * voice_operation_id
 *
 * @returns {Object<string, number>} 1-based номера колонок
 */
function getCalendarColumns_() {
  const sheet = getCalendarSheet_();
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error(
      'Лист "' + CALENDAR_SHEET_NAME + '" не содержит заголовков'
    );
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(value) {
      return String(value || '').trim();
    });

  const columns = {};

  Object.keys(VOICE_CALENDAR_HEADERS).forEach(function(key) {
    const headerName = VOICE_CALENDAR_HEADERS[key];
    const index = headers.indexOf(headerName);

    if (index === -1) {
      throw new Error(
        'В листе "' + CALENDAR_SHEET_NAME +
        '" отсутствует обязательная колонка "' + headerName + '"'
      );
    }

    columns[key] = index + 1;
  });

  return columns;
}

/**
 * Читает все строки данных листа "Календарь" без заголовка.
 *
 * @returns {Array<Array>}
 */
function readCalendarData_() {
  const sheet = getCalendarSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < START_ROW) {
    return [];
  }

  const lastColumn = sheet.getLastColumn();

  return sheet
    .getRange(
      START_ROW,
      START_COL,
      lastRow - START_ROW + 1,
      lastColumn
    )
    .getValues();
}

/**
 * Возвращает последнюю заполненную строку "Календаря".
 *
 * @returns {number}
 */
function getCalendarLastRow_() {
  return getCalendarSheet_().getLastRow();
}

/**
 * Возвращает Set всех voice_operation_id.
 *
 * @returns {Set<string>}
 */
function getExistingOperationIdsSet_() {
  const data = readCalendarData_();
  const columns = getCalendarColumns_();
  const index = columns.VOICE_OPERATION_ID - 1;
  const ids = new Set();

  data.forEach(function(row) {
    const value = row[index];

    if (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ''
    ) {
      ids.add(String(value).trim());
    }
  });

  return ids;
}

/**
 * Совместимый helper: возвращает массив operation_id.
 *
 * @returns {Array<string>}
 */
function getExistingOperationIds_() {
  return Array.from(getExistingOperationIdsSet_());
}

// ============================================================================
// НОРМАЛИЗАЦИЯ BATCH / OPERATION
// ============================================================================

/**
 * Находит пользователя Telegram по user_id.
 *
 * @param {string|number} telegramUserId
 * @returns {Object|null}
 */
function getTelegramUserById_(telegramUserId) {
  const userId = String(telegramUserId || '').trim();
  const users =
    TELEGRAM && Array.isArray(TELEGRAM.USERS)
      ? TELEGRAM.USERS
      : [];

  for (let i = 0; i < users.length; i++) {
    if (String(users[i].userId) === userId) {
      return users[i];
    }
  }

  return null;
}

/**
 * Детерминированно определяет owner по telegram_user_id.
 *
 * Предпочтительный новый Config:
 *   { userId: '...', name: 'Husband', owner: 'Муж' }
 *
 * Для обратной совместимости с v0.9 поддерживается:
 *   name = Husband / Wife
 *
 * @param {string|number} telegramUserId
 * @returns {string} "Муж" | "Жена"
 */
function getOwnerByTelegramUserId_(telegramUserId) {
  const user = getTelegramUserById_(telegramUserId);

  if (!user) {
    throw new Error(
      'Неизвестный telegram_user_id: ' +
      String(telegramUserId)
    );
  }

  if (validateOwner_(user.owner)) {
    return user.owner;
  }

  const normalizedName =
    String(user.name || '').trim().toLowerCase();

  if (normalizedName === 'husband') {
    return 'Муж';
  }

  if (normalizedName === 'wife') {
    return 'Жена';
  }

  throw new Error(
    'Для Telegram-пользователя ' +
    String(telegramUserId) +
    ' не задан owner ("Муж"/"Жена")'
  );
}

/**
 * Нормализует type без семантического угадывания.
 * Разрешается только регистронезависимый вариант "Доход"/"Расход".
 *
 * @param {*} value
 * @returns {*}
 */
function normalizeOperationType_(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'доход') {
    return 'Доход';
  }

  if (normalized === 'расход') {
    return 'Расход';
  }

  return value.trim();
}

/**
 * Нормализует сумму.
 *
 * Допустимы:
 *  5000
 * -5000
 * "5000"
 * "5 000"
 * "5000,50"
 *
 * Возвращает абсолютное значение.
 * Ноль и нечисловые значения → null.
 *
 * @param {*} value
 * @returns {number|null}
 */
function normalizeAmount_(value) {
  let normalizedValue = value;

  if (typeof normalizedValue === 'string') {
    normalizedValue = normalizedValue
      .replace(/\s/g, '')
      .replace(',', '.')
      .trim();
  }

  const amount = Number(normalizedValue);

  if (!Number.isFinite(amount) || amount === 0) {
    return null;
  }

  return Math.abs(amount);
}

/**
 * Нормализует дату в DD.MM.YYYY.
 *
 * Поддерживает:
 * DD.MM.YYYY
 * YYYY-MM-DD
 *
 * @param {*} date
 * @returns {*}
 */
function normalizeDateToDMY_(date) {
  if (typeof date !== 'string') {
    return date;
  }

  const value = date.trim();
  const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = value.match(isoRegex);

  if (match) {
    return match[3] + '.' + match[2] + '.' + match[1];
  }

  return value;
}

/**
 * Нормализует batch перед валидацией.
 *
 * ВАЖНО:
 * owner и operation_id всегда перезаписываются Apps Script,
 * даже если LLM/Nodul уже передали эти поля.
 *
 * @param {Object} batch
 * @returns {Object}
 */
function normalizeVoiceBatch_(batch) {
  if (!batch || typeof batch !== 'object') {
    return batch;
  }

  if (
    batch.telegram_message_id !== null &&
    batch.telegram_message_id !== undefined
  ) {
    batch.telegram_message_id =
      String(batch.telegram_message_id).trim();
  }

  if (
    batch.telegram_user_id !== null &&
    batch.telegram_user_id !== undefined
  ) {
    batch.telegram_user_id =
      String(batch.telegram_user_id).trim();
  }

  if (!Array.isArray(batch.operations)) {
    return batch;
  }

  let owner = null;

  if (batch.telegram_user_id) {
    owner =
      getOwnerByTelegramUserId_(batch.telegram_user_id);
  }

  batch.operations.forEach(function(operation, index) {
    if (!operation || typeof operation !== 'object') {
      return;
    }

    operation.operation_id =
      batch.telegram_message_id + '_' + index;

    operation.owner = owner;

    operation.date =
      normalizeDateToDMY_(operation.date);

    operation.type =
      normalizeOperationType_(operation.type);

    const normalizedAmount =
      normalizeAmount_(operation.amount);

    if (normalizedAmount !== null) {
      operation.amount = normalizedAmount;
    }

    if (typeof operation.comment === 'string') {
      operation.comment = operation.comment.trim();
    }
  });

  return batch;
}

// ============================================================================
// ВАЛИДАЦИЯ
// ============================================================================

/**
 * Проверяет существование реальной календарной даты.
 *
 * @param {number} day
 * @param {number} month
 * @param {number} year
 * @returns {boolean}
 */
function isValidCalendarDate_(day, month, year) {
  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Проверяет формат и реальность даты.
 *
 * @param {*} date
 * @returns {boolean}
 */
function validateDate_(date) {
  if (!date || typeof date !== 'string') {
    return false;
  }

  const normalized = normalizeDateToDMY_(date);
  const match =
    normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!match) {
    return false;
  }

  return isValidCalendarDate_(
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10)
  );
}

/**
 * @param {*} owner
 * @returns {boolean}
 */
function validateOwner_(owner) {
  return owner === 'Муж' || owner === 'Жена';
}

/**
 * @param {*} type
 * @returns {boolean}
 */
function validateType_(type) {
  return type === 'Доход' || type === 'Расход';
}

/**
 * Совместимый валидатор суммы.
 * Перед проверкой сумма нормализуется.
 *
 * @param {*} amount
 * @returns {boolean}
 */
function validateAmount_(amount) {
  return normalizeAmount_(amount) !== null;
}

/**
 * Проверяет отдельную операцию.
 *
 * Поля intent, target_hint и confidence_score не валидируются:
 * они больше не участвуют в runtime-логике.
 *
 * @param {Object} operation
 * @returns {{valid:boolean, errors:Array<string>}}
 */
function validateOperation_(operation) {
  const errors = [];

  if (!operation || typeof operation !== 'object') {
    return {
      valid: false,
      errors: ['Операция не является объектом']
    };
  }

  if (
    !operation.operation_id ||
    typeof operation.operation_id !== 'string'
  ) {
    errors.push('Отсутствует operation_id');
  }

  if (!validateDate_(operation.date)) {
    errors.push(
      'Некорректный формат даты: ' +
      String(operation.date)
    );
  }

  if (!validateOwner_(operation.owner)) {
    errors.push(
      'Некорректный owner: ' +
      String(operation.owner)
    );
  }

  const normalizedAmount =
    normalizeAmount_(operation.amount);

  if (normalizedAmount === null) {
    errors.push(
      'Некорректная сумма: ' +
      String(operation.amount)
    );
  } else {
    operation.amount = normalizedAmount;
  }

  if (!validateType_(operation.type)) {
    errors.push(
      'Некорректный type: ' +
      String(operation.type)
    );
  }

  if (
    typeof operation.comment !== 'string' ||
    operation.comment.trim() === ''
  ) {
    errors.push('Отсутствует comment');
  } else {
    operation.comment = operation.comment.trim();
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Проверяет batch.
 *
 * @param {Object} batch
 * @returns {{valid:boolean, errors:Array<string>}}
 */
function validateVoiceBatch_(batch) {
  const errors = [];

  if (!batch || typeof batch !== 'object') {
    return {
      valid: false,
      errors: ['Voice batch отсутствует или имеет неверный тип']
    };
  }

  if (
    !batch.schema_version ||
    VOICE_INPUT_SCHEMA_VERSIONS.indexOf(
      String(batch.schema_version)
    ) === -1
  ) {
    errors.push(
      'Неподдерживаемый schema_version: ' +
      String(batch.schema_version)
    );
  }

  if (
    !batch.batch_id ||
    typeof batch.batch_id !== 'string'
  ) {
    errors.push(
      'Отсутствует или некорректный batch_id'
    );
  }

  if (!batch.telegram_message_id) {
    errors.push('Отсутствует telegram_message_id');
  }

  if (!batch.telegram_user_id) {
    errors.push('Отсутствует telegram_user_id');
  }

  if (!Array.isArray(batch.operations)) {
    errors.push(
      'Отсутствует или некорректный массив operations'
    );

    return {
      valid: false,
      errors: errors
    };
  }

  if (batch.operations.length === 0) {
    errors.push('Массив operations пуст');
  }

  if (
    batch.operations.length >
    VOICE.MAX_OPERATIONS_PER_BATCH
  ) {
    errors.push(
      'Превышен лимит операций: ' +
      batch.operations.length +
      ' (максимум ' +
      VOICE.MAX_OPERATIONS_PER_BATCH +
      ')'
    );
  }

  batch.operations.forEach(function(operation, index) {
    const validation =
      validateOperation_(operation);

    if (!validation.valid) {
      errors.push(
        'Операция #' +
        (index + 1) +
        ': ' +
        validation.errors.join(', ')
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// ============================================================================
// ИДЕМПОТЕНТНОСТЬ
// ============================================================================

/**
 * Проверяет существование operation_id.
 *
 * @param {string} operationId
 * @returns {boolean}
 */
function checkIdempotency_(operationId) {
  return getExistingOperationIdsSet_()
    .has(String(operationId));
}

/**
 * Делит операции на новые и уже записанные.
 *
 * Дополнительно защищает от дубликатов operation_id внутри одного batch.
 *
 * @param {Array<Object>} operations
 * @returns {{valid:Array<Object>, duplicates:Array<Object>}}
 */
function checkBatchIdempotency_(operations) {
  const existingIds =
    getExistingOperationIdsSet_();

  const seenInBatch = new Set();
  const valid = [];
  const duplicates = [];

  operations.forEach(function(operation) {
    const operationId =
      String(operation.operation_id);

    if (
      existingIds.has(operationId) ||
      seenInBatch.has(operationId)
    ) {
      duplicates.push(operation);
      return;
    }

    seenInBatch.add(operationId);
    valid.push(operation);
  });

  return {
    valid: valid,
    duplicates: duplicates
  };
}

// ============================================================================
// ОБРАБОТКА BATCH
// ============================================================================

/**
 * Нормализация → валидация → идемпотентность.
 *
 * Все валидные новые операции создаются как новые строки.
 *
 * @param {Object} batch
 * @returns {Object}
 */
function processVoiceBatch_(batch) {
  const result = {
    success: false,
    errors: [],
    validOperations: [],
    duplicates: [],
    operationsToCreate: [],
    alreadyRecorded: false
  };

  try {
    normalizeVoiceBatch_(batch);
  } catch (error) {
    result.errors.push(
      'Ошибка нормализации: ' + error.message
    );
    return result;
  }

  const validation =
    validateVoiceBatch_(batch);

  if (!validation.valid) {
    result.errors =
      validation.errors.slice();

    return result;
  }

  const idempotency =
    checkBatchIdempotency_(batch.operations);

  result.duplicates =
    idempotency.duplicates;

  result.operationsToCreate =
    idempotency.valid;

  result.validOperations =
    idempotency.valid;

  if (
    result.operationsToCreate.length === 0 &&
    result.duplicates.length === batch.operations.length &&
    batch.operations.length > 0
  ) {
    // Идемпотентный retry: все операции уже находятся в Calendar.
    // Считаем batch успешно обработанным, чтобы его можно было архивировать.
    result.alreadyRecorded = true;
    result.success = true;
    return result;
  }

  result.success =
    result.operationsToCreate.length > 0;

  return result;
}

// ============================================================================
// ЗАПИСЬ В SHEETS
// ============================================================================

/**
 * Применяет единственную знаковую конвенцию проекта.
 *
 * Расход → отрицательное число.
 * Доход → положительное число.
 *
 * @param {Object} operation
 * @returns {number}
 */
function applySignToAmount_(operation) {
  const amount =
    normalizeAmount_(operation.amount);

  if (amount === null) {
    throw new Error(
      'Некорректная сумма: ' +
      String(operation.amount)
    );
  }

  return operation.type === 'Расход'
    ? -amount
    : amount;
}

/**
 * Преобразует DD.MM.YYYY в Date.
 *
 * @param {string} dateString
 * @returns {Date}
 */
function convertStringToDate_(dateString) {
  const normalized =
    normalizeDateToDMY_(dateString);

  if (!validateDate_(normalized)) {
    throw new Error(
      'Неподдерживаемая дата: ' +
      String(dateString)
    );
  }

  return Utilities.parseDate(
    normalized,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}

/**
 * Записывает новую фактическую операцию.
 *
 * Плановой колонки модуль не требует и не заполняет.
 * Остальные неизвестные колонки листа остаются пустыми.
 *
 * @param {Object} operation
 * @returns {number} rowNumber
 */
function writeNewOperationToCalendar_(operation) {
  const sheet = getCalendarSheet_();
  const columns = getCalendarColumns_();

  const rowData =
    new Array(sheet.getLastColumn()).fill('');

  rowData[columns.DATE - 1] =
    convertStringToDate_(operation.date);

  rowData[columns.OWNER - 1] =
    operation.owner;

  rowData[columns.ACTUAL_VALUE - 1] =
    applySignToAmount_(operation);

  rowData[columns.TYPE - 1] =
    operation.type;

  rowData[columns.COMMENT - 1] =
    operation.comment;

  rowData[columns.VOICE_OPERATION_ID - 1] =
    operation.operation_id;

  sheet.appendRow(rowData);

  return sheet.getLastRow();
}

/**
 * Записывает массив операций как новые строки.
 *
 * Второй параметр сохранён только для временной совместимости со старым
 * вызовом writeOperationsToCalendar_(create, update) и игнорируется.
 *
 * При ошибке выполняется best-effort rollback созданных строк.
 *
 * @param {Array<Object>} operationsToCreate
 * @param {Array<Object>=} legacyOperationsToUpdate
 * @returns {Object}
 */
function writeOperationsToCalendar_(
  operationsToCreate,
  legacyOperationsToUpdate
) {
  const result = {
    success: false,
    createdRows: [],
    errors: []
  };

  const createdRowNumbers = [];

  try {
    operationsToCreate.forEach(function(operation) {
      const rowNumber =
        writeNewOperationToCalendar_(operation);

      createdRowNumbers.push(rowNumber);

      result.createdRows.push({
        operationId: operation.operation_id,
        rowNumber: rowNumber
      });
    });

    result.success = true;
    return result;

  } catch (error) {
    result.errors.push(
      'Ошибка записи: ' + error.message
    );

    Logger.log(
      'Voice write failed; rollback started: ' +
      error.message
    );

    const sheet = getCalendarSheet_();

    createdRowNumbers
      .slice()
      .sort(function(a, b) {
        return b - a;
      })
      .forEach(function(rowNumber) {
        try {
          sheet.deleteRow(rowNumber);
        } catch (rollbackError) {
          Logger.log(
            'Rollback error for row ' +
            rowNumber +
            ': ' +
            rollbackError.message
          );
        }
      });

    return result;
  }
}

// ============================================================================
// ОБРАБОТКА ПОДТВЕРЖДЁННОГО BATCH
// ============================================================================

/**
 * Полный цикл подтверждённого batch:
 * Confirmed → normalize/validate/idempotency → Calendar → Archive.
 *
 * @param {string} batchId
 * @returns {Object}
 */
function processConfirmedVoiceBatch(batchId) {
  Logger.log(
    '=== processConfirmedVoiceBatch START: ' +
    batchId +
    ' ==='
  );

  const result = {
    success: false,
    batchId: batchId,
    errors: [],
    createdRows: [],
    duplicates: []
  };

  try {
    const batchJson =
      readVoiceConfirmed_(batchId);

    const batch =
      JSON.parse(batchJson);

    const processResult =
      processVoiceBatch_(batch);

    result.duplicates =
      processResult.duplicates;

    if (!processResult.success) {
      result.errors =
        processResult.errors.slice();

      Logger.log(
        'Batch validation/idempotency failed: ' +
        result.errors.join('; ')
      );

      return result;
    }

    if (!processResult.alreadyRecorded) {
      const writeResult =
        writeOperationsToCalendar_(
          processResult.operationsToCreate
        );

      result.createdRows =
        writeResult.createdRows;

      if (!writeResult.success) {
        result.errors =
          writeResult.errors.slice();

        return result;
      }
    }

    // Архивируем и после обычной записи, и после идемпотентного retry,
    // когда все операции уже присутствуют в Calendar.
    moveVoiceConfirmedToArchive_(batchId);

    result.success = true;

    Logger.log(
      '=== processConfirmedVoiceBatch SUCCESS: ' +
      batchId +
      ' ==='
    );

  } catch (error) {
    result.errors.push(
      'Критическая ошибка: ' + error.message
    );

    Logger.log(
      'processConfirmedVoiceBatch ERROR: ' +
      error.message
    );

    Logger.log(
      'Stack: ' +
      (error.stack || '')
    );
  }

  return result;
}

// ============================================================================
// ПАКЕТНАЯ ОБРАБОТКА CONFIRMED
// ============================================================================

/**
 * Обрабатывает все файлы из Voice/Confirmed/.
 *
 * @returns {Object}
 */
function processVoiceTransactions() {
  Logger.log(
    '=== Voice Transactions Processing Started ==='
  );

  try {
    const batches =
      listVoiceConfirmedBatches_();

    if (batches.length === 0) {
      return {
        success: true,
        message: 'Нет батчей для обработки',
        totalBatches: 0,
        processedBatches: 0,
        failedBatches: 0,
        results: [],
        report: ''
      };
    }

    const results =
      processAllConfirmedBatches_(batches);

    const report =
      buildProcessingReport_(results);

    return {
      success: true,
      message: 'Обработка завершена',
      totalBatches: batches.length,
      processedBatches:
        results.filter(function(item) {
          return item.success;
        }).length,
      failedBatches:
        results.filter(function(item) {
          return !item.success;
        }).length,
      results: results,
      report: report
    };

  } catch (error) {
    Logger.log(
      'Voice processing critical error: ' +
      error.message
    );

    return {
      success: false,
      message:
        'Критическая ошибка: ' +
        error.message,
      totalBatches: 0,
      processedBatches: 0,
      failedBatches: 0,
      results: [],
      report: '',
      error: error.message
    };
  }
}

/**
 * @param {Array<Object>} batches
 * @returns {Array<Object>}
 */
function processAllConfirmedBatches_(batches) {
  const results = [];

  batches.forEach(function(batch) {
    try {
      const result =
        processConfirmedVoiceBatch(
          batch.batchId
        );

      result.fileName =
        batch.fileName;

      results.push(result);

    } catch (error) {
      results.push({
        batchId: batch.batchId,
        fileName: batch.fileName,
        success: false,
        errors: [
          'Критическая ошибка: ' +
          error.message
        ],
        createdRows: [],
        duplicates: []
      });
    }
  });

  return results;
}

/**
 * Формирует технический отчёт для логов / ручного запуска.
 *
 * @param {Array<Object>} results
 * @returns {string}
 */
function buildProcessingReport_(results) {
  const lines = [];

  const successful =
    results.filter(function(item) {
      return item.success;
    });

  const failed =
    results.filter(function(item) {
      return !item.success;
    });

  let totalCreated = 0;
  let totalDuplicates = 0;

  results.forEach(function(result) {
    totalCreated +=
      result.createdRows
        ? result.createdRows.length
        : 0;

    totalDuplicates +=
      result.duplicates
        ? result.duplicates.length
        : 0;
  });

  lines.push(
    '=== VOICE TRANSACTIONS REPORT ==='
  );

  lines.push(
    'Всего батчей: ' + results.length
  );

  lines.push(
    'Успешно: ' + successful.length
  );

  lines.push(
    'С ошибками: ' + failed.length
  );

  lines.push(
    'Создано операций: ' + totalCreated
  );

  lines.push(
    'Дубликатов: ' + totalDuplicates
  );

  failed.forEach(function(result) {
    lines.push('');
    lines.push(
      'Ошибка batch ' +
      result.batchId +
      ': ' +
      (result.errors || []).join('; ')
    );
  });

  return lines.join('\n');
}

/**
 * Ручной запуск из Apps Script / меню.
 */
function runProcessVoiceTransactions() {
  try {
    const result =
      processVoiceTransactions();

    if (result.totalBatches === 0) {
      showInfo_(
        'Нет подтверждённых голосовых операций для обработки.'
      );
      return;
    }

    let totalCreated = 0;

    result.results.forEach(function(item) {
      totalCreated +=
        item.createdRows
          ? item.createdRows.length
          : 0;
    });

    showInfo_(
      'Обработка завершена.\n\n' +
      'Батчей: ' +
      result.totalBatches +
      '\n' +
      'Успешно: ' +
      result.processedBatches +
      '\n' +
      'С ошибками: ' +
      result.failedBatches +
      '\n' +
      'Создано операций: ' +
      totalCreated
    );

  } catch (error) {
    showError_(
      'Ошибка обработки голосовых транзакций: ' +
      error.message
    );

    Logger.log(
      'Stack: ' +
      (error.stack || '')
    );
  }
}

// ============================================================================
// CALLBACK: CONFIRM + NOTIFICATION ACK
// ============================================================================

/**
 * Обрабатывает callback-файлы Voice с защитой от параллельных запусков.
 *
 * Вызывается публичным trigger-wrapper:
 * runProcessVoiceCallbacks()
 */
function processVoiceCallbacks_() {
  const lock = LockService.getScriptLock();

  try {
    const acquired = lock.tryLock(
      VOICE_CALLBACK_CONFIG.LOCK_TIMEOUT_MS
    );

    if (!acquired) {
      Logger.log(
        'Skipping: another instance of processVoiceCallbacks_ is running'
      );
      return;
    }

    _processVoiceCallbacksCore_();

  } catch (error) {
    Logger.log(
      'Error in processVoiceCallbacks_: ' +
      error.message
    );

    Logger.log(
      'Stack: ' +
      (error.stack || '')
    );

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Lock мог не быть получен — это нормально.
    }
  }
}

/**
 * Внутренняя функция обработки callback-сигналов.
 *
 * Поддерживаемые файлы:
 * - {batch_id}_confirm.json
 * - {batch_id}_notification_sent.json
 *
 * Callback/ACK файл удаляется только после успешного handler.
 * При исключении файл остаётся для повторной попытки.
 */
function _processVoiceCallbacksCore_() {
  Logger.log(
    '=== Voice Callbacks Processing Started ==='
  );

  const callbacksFolder =
    getVoiceCallbacksFolder_();

  const files =
    callbacksFolder.getFiles();

  if (!files.hasNext()) {
    Logger.log(
      'No callback signals found. Exiting.'
    );
    return;
  }

  let processedCount = 0;
  let errorCount = 0;

  while (
    files.hasNext() &&
    processedCount <
      VOICE_CALLBACK_CONFIG.MAX_FILES_PER_RUN
  ) {
    const file = files.next();
    const fileName = file.getName();

    const confirmMatch =
      fileName.match(/^(.+)_confirm\.json$/);

    const notificationSentMatch =
      fileName.match(/^(.+)_notification_sent\.json$/);

    if (!confirmMatch && !notificationSentMatch) {
      Logger.log(
        'Skipping unsupported callback file: ' +
        fileName
      );
      continue;
    }

    try {
      if (confirmMatch) {
        const batchId = confirmMatch[1];

        Logger.log(
          'Processing CONFIRM signal: ' +
          batchId
        );

        _handleConfirmAction_(batchId);

      } else {
        const batchId =
          notificationSentMatch[1];

        Logger.log(
          'Processing NOTIFICATION_SENT ACK: ' +
          batchId
        );

        _handleNotificationSentAction_(
          batchId,
          file
        );
      }

      file.setTrashed(true);
      processedCount++;

      Logger.log(
        '✅ Callback processed successfully: ' +
        fileName
      );

    } catch (error) {
      errorCount++;

      Logger.log(
        '❌ Error processing callback ' +
        fileName +
        ': ' +
        error.message
      );

      Logger.log(
        'Stack: ' +
        (error.stack || '')
      );

      // Файл намеренно НЕ удаляем:
      // следующий запуск сможет повторить обработку.
    }
  }

  if (
    processedCount >=
      VOICE_CALLBACK_CONFIG.MAX_FILES_PER_RUN &&
    files.hasNext()
  ) {
    Logger.log(
      '⚠️ Reached max files per run (' +
      VOICE_CALLBACK_CONFIG.MAX_FILES_PER_RUN +
      '). Remaining files will be processed next trigger.'
    );
  }

  Logger.log(
    '=== Voice Callbacks Processing Completed ==='
  );

  Logger.log(
    'Processed: ' +
    processedCount +
    ', Errors: ' +
    errorCount
  );
}

/**
 * Обрабатывает подтверждение голосового batch.
 *
 * Логика:
 * 1. Если batch уже в Archive -> повторный confirm считается успешным
 *    и ничего повторно не записывается.
 * 2. Если batch в Drafts -> переносим его в Confirmed.
 * 3. Если batch уже в Confirmed -> продолжаем обработку с него.
 * 4. Если batch отсутствует во всех трёх папках -> это реальная ошибка.
 * 5. После успешной записи создаётся одно финальное уведомление.
 *
 * Повторный confirm НЕ создаёт:
 * - повторную строку в Calendar;
 * - повторное финальное уведомление;
 * - ошибку "Voice Draft не найден".
 *
 * @param {string} batchId ID voice batch
 * @returns {Object}
 */
function _handleConfirmAction_(batchId) {
  Logger.log(
    '=== _handleConfirmAction_ START: ' +
    batchId +
    ' ==='
  );

  const fileName =
    batchId + '.json';

  // ------------------------------------------------------------------------
  // 1. Определяем текущее состояние batch
  // ------------------------------------------------------------------------

  const draftsFolder =
    getVoiceDraftsFolder_();

  const confirmedFolder =
    getVoiceConfirmedFolder_();

  const archiveFolder =
    getVoiceArchiveFolder_();

  const draftExists =
    draftsFolder
      .getFilesByName(fileName)
      .hasNext();

  const confirmedExists =
    confirmedFolder
      .getFilesByName(fileName)
      .hasNext();

  const archivedExists =
    archiveFolder
      .getFilesByName(fileName)
      .hasNext();

  Logger.log(
    'Batch state: ' +
    'draft=' + draftExists +
    ', confirmed=' + confirmedExists +
    ', archived=' + archivedExists
  );

  // ------------------------------------------------------------------------
  // 2. Уже обработан -> idempotent success
  // ------------------------------------------------------------------------

  if (archivedExists) {
    Logger.log(
      '✅ Batch already archived. ' +
      'Repeat confirm treated as idempotent success: ' +
      batchId
    );

    Logger.log(
      'No Calendar write and no notification will be repeated.'
    );

    Logger.log(
      '=== _handleConfirmAction_ END: IDEMPOTENT ==='
    );

    return {
      success: true,
      idempotent: true,
      batchId: batchId,
      status: 'already_processed'
    };
  }

  // ------------------------------------------------------------------------
  // 3. Draft -> Confirmed
  // ------------------------------------------------------------------------

  if (draftExists) {
    Logger.log(
      'Moving batch from Drafts to Confirmed...'
    );

    moveVoiceDraftToConfirmed_(batchId);

    Logger.log(
      'Batch moved to Confirmed: ' +
      batchId
    );

  } else if (confirmedExists) {
    Logger.log(
      'Batch already in Confirmed. ' +
      'Continuing processing without moving Draft.'
    );

  } else {
    throw new Error(
      'Voice batch not found in Drafts, Confirmed or Archive: ' +
      fileName
    );
  }

  // ------------------------------------------------------------------------
  // 4. Читаем metadata batch до основной обработки
  //
  // processConfirmedVoiceBatch() при успехе переместит файл в Archive.
  // ------------------------------------------------------------------------

  let notificationChatId = null;
  let operationCount = 0;

  try {
    const batchJson =
      readVoiceConfirmed_(batchId);

    const batch =
      JSON.parse(batchJson);

    if (batch.telegram_user_id) {
      notificationChatId =
        String(batch.telegram_user_id);
    }

    if (Array.isArray(batch.operations)) {
      operationCount =
        batch.operations.length;
    }

    Logger.log(
      'Notification chat ID: ' +
      notificationChatId
    );

    Logger.log(
      'Operations in batch: ' +
      operationCount
    );

  } catch (error) {
    throw new Error(
      'Failed to read confirmed batch metadata: ' +
      error.message
    );
  }

  // ------------------------------------------------------------------------
  // 5. Основная обработка
  // ------------------------------------------------------------------------

  Logger.log(
    'Calling processConfirmedVoiceBatch...'
  );

  const processResult =
    processConfirmedVoiceBatch(batchId);

  if (!processResult) {
    throw new Error(
      'processConfirmedVoiceBatch returned empty result'
    );
  }

  Logger.log(
    'processConfirmedVoiceBatch result:'
  );

  Logger.log(
    '  - Success: ' +
    processResult.success
  );

  Logger.log(
    '  - Errors: ' +
    (
      Array.isArray(processResult.errors)
        ? processResult.errors.length
        : 0
    )
  );

  Logger.log(
    '  - Created rows: ' +
    (
      Array.isArray(processResult.createdRows)
        ? processResult.createdRows.length
        : 0
    )
  );

  // ------------------------------------------------------------------------
  // 6. Финальное уведомление
  // ------------------------------------------------------------------------

  let notificationText;

  if (processResult.success) {
    const createdCount =
      Array.isArray(processResult.createdRows)
        ? processResult.createdRows.length
        : operationCount;

    if (createdCount > 1) {
      notificationText =
        '✅ Операции записаны: ' +
        createdCount;
    } else {
      notificationText =
        '✅ Операция записана';
    }

  } else {
    notificationText =
      '❌ Ошибка записи операции';

    if (
      Array.isArray(processResult.errors) &&
      processResult.errors.length > 0
    ) {
      Logger.log(
        'Voice processing errors: ' +
        JSON.stringify(processResult.errors)
      );
    }
  }

  // ------------------------------------------------------------------------
  // 7. Outbox -> Nodul -> Telegram
  // ------------------------------------------------------------------------

  if (notificationChatId) {
    Logger.log(
      'Queueing final Telegram notification...'
    );

    _sendVoiceNotification_(
      notificationChatId,
      notificationText,
      batchId
    );

  } else {
    Logger.log(
      '⚠️ Final Telegram notification skipped: ' +
      'chatId not determined'
    );
  }

  Logger.log(
    '=== _handleConfirmAction_ END ==='
  );

  return {
    success:
      processResult.success === true,
    idempotent: false,
    batchId: batchId,
    status:
      processResult.success === true
        ? 'processed'
        : 'processing_failed',
    processResult: processResult
  };
}

/**
 * Подтверждение успешной доставки Telegram notification.
 *
 * Nodul создаёт:
 *   {batch_id}_notification_sent.json
 *
 * только после успешной отправки сообщения пользователю.
 *
 * GAS после этого удаляет соответствующий файл из Voice/Outbox.
 *
 * Handler идемпотентный:
 * если Outbox-файл уже отсутствует, ACK всё равно считается
 * успешно обработанным.
 *
 * @param {string} batchId
 * @param {GoogleAppsScript.Drive.File} ackFile
 */
function _handleNotificationSentAction_(
  batchId,
  ackFile
) {
  Logger.log(
    '=== Voice notification ACK START: ' +
    batchId +
    ' ==='
  );

  // ------------------------------------------------------------------------
  // 1. Читаем и валидируем ACK
  // ------------------------------------------------------------------------

  let ack;

  try {
    const content =
      ackFile
        .getBlob()
        .getDataAsString('UTF-8');

    ack = JSON.parse(content);

  } catch (error) {
    throw new Error(
      'Invalid notification ACK JSON: ' +
      error.message
    );
  }

  if (
    !ack ||
    typeof ack !== 'object'
  ) {
    throw new Error(
      'Notification ACK is not an object'
    );
  }

  if (
    ack.action !== 'notification_sent'
  ) {
    throw new Error(
      'Invalid notification ACK action: ' +
      String(ack.action)
    );
  }

  if (
    String(ack.batch_id || '') !==
    String(batchId)
  ) {
    throw new Error(
      'Notification ACK batch_id mismatch'
    );
  }

  // ------------------------------------------------------------------------
  // 2. Определяем ожидаемый Outbox filename
  // ------------------------------------------------------------------------

  const expectedFileName =
    'voice_notification_' +
    batchId +
    '.json';

  /*
   * Если Nodul передал notification_file_name,
   * используем его только для проверки.
   *
   * Не доверяем ACK выбирать произвольный файл для удаления:
   * фактическое имя всегда строится GAS из batchId.
   */
  if (
    ack.notification_file_name &&
    String(
      ack.notification_file_name
    ).trim() !== expectedFileName
  ) {
    throw new Error(
      'Notification ACK filename mismatch: ' +
      String(ack.notification_file_name)
    );
  }

  // ------------------------------------------------------------------------
  // 3. Удаляем соответствующий Outbox-файл
  // ------------------------------------------------------------------------

  const outboxFolder =
    getVoiceOutboxFolder_();

  const files =
    outboxFolder.getFilesByName(
      expectedFileName
    );

  let deletedCount = 0;

  while (files.hasNext()) {
    const file = files.next();

    file.setTrashed(true);
    deletedCount++;
  }

  if (deletedCount === 0) {
    Logger.log(
      'Outbox notification already absent: ' +
      expectedFileName
    );
  } else {
    Logger.log(
      'Outbox notification deleted: ' +
      expectedFileName +
      ' (' +
      deletedCount +
      ' file(s))'
    );
  }

  Logger.log(
    '=== Voice notification ACK END: ' +
    batchId +
    ' ==='
  );
}

// ============================================================================
// TELEGRAM RESULT OUTBOX
// ============================================================================

/**
 * Создаёт одно итоговое уведомление в Voice/Outbox/.
 *
 * Nodul должен:
 * 1. отправить textMessage;
 * 2. после успешной отправки создать callback:
 *      {batch_id}_notification_sent.json
 *    в Voice/Callbacks.
 *
 * Удаление Outbox-файла выполняет Apps Script
 * после получения notification_sent ACK.
 *
 * @param {string} chatId
 * @param {string} message
 * @param {string} batchId
 */
function _sendVoiceNotification_(
  chatId,
  message,
  batchId
) {
  const request = {
    requestId:
      'voice_notify_' +
      batchId +
      '_' +
      new Date().getTime(),

    type: 'voice_notification',
    chatId: String(chatId),
    textMessage: String(message),
    batchId: batchId,
    timestamp: new Date().toISOString()
  };

  const outboxFolder =
    getVoiceOutboxFolder_();

  const fileName =
    'voice_notification_' +
    batchId +
    '.json';

  const content =
    JSON.stringify(
      request,
      null,
      2
    );

  saveFileWithOverwrite_(
    outboxFolder,
    fileName,
    content,
    MimeType.PLAIN_TEXT
  );

  Logger.log(
    'Voice notification queued: ' +
    fileName
  );
}

// ============================================================================
// HOUSEKEEPING
// ============================================================================

/**
 * Удаляет неподтверждённые Draft старше заданного количества часов.
 *
 * Не вызывается автоматически из processVoiceCallbacks_.
 * Рекомендуется отдельный daily trigger или вызов из существующего
 * housekeeping процесса.
 *
 * @param {number=} maxAgeHours default 24
 * @returns {number} количество удалённых файлов
 */
function cleanupExpiredVoiceDrafts_(maxAgeHours) {
  const ttlHours =
    Number(maxAgeHours) > 0
      ? Number(maxAgeHours)
      : 24;

  const cutoff =
    new Date().getTime() -
    ttlHours * 60 * 60 * 1000;

  const folder =
    getVoiceDraftsFolder_();

  const files =
    folder.getFiles();

  let deleted = 0;

  while (files.hasNext()) {
    const file = files.next();

    if (
      file.getDateCreated().getTime() <
      cutoff
    ) {
      file.setTrashed(true);
      deleted++;
    }
  }

  Logger.log(
    'Expired voice drafts deleted: ' +
    deleted
  );

  return deleted;
}

// ============================================================================
// ДИАГНОСТИКА / ТЕСТЫ
// ============================================================================

/**
 * Публичный запуск теста нормализации суммы из Apps Script UI.
 * Не изменяет данные.
 */
function runTestVoiceAmountNormalization() {
  testVoiceAmountNormalization_();

  showInfo_(
    'Тест нормализации суммы пройден успешно.'
  );
}

/**
 * Публичный запуск проверки структуры листа "Календарь"
 * из Apps Script UI. Не изменяет данные.
 */
function runTestVoiceCalendarHeaders() {
  const columns =
    testVoiceCalendarHeaders_();

  showInfo_(
    'Структура листа "Календарь" корректна.\n\n' +
    JSON.stringify(columns, null, 2)
  );
}

/**
 * Безопасный unit-like тест нормализации суммы.
 * Не пишет данные в Sheets.
 */
function testVoiceAmountNormalization_() {
  const cases = [
    { input: 5000, expected: 5000 },
    { input: -5000, expected: 5000 },
    { input: '5000', expected: 5000 },
    { input: '5 000', expected: 5000 },
    { input: '5000,50', expected: 5000.5 },
    { input: 0, expected: null },
    { input: 'abc', expected: null }
  ];

  cases.forEach(function(testCase) {
    const actual =
      normalizeAmount_(testCase.input);

    if (actual !== testCase.expected) {
      throw new Error(
        'normalizeAmount_ failed for "' +
        testCase.input +
        '": expected ' +
        testCase.expected +
        ', actual ' +
        actual
      );
    }
  });

  Logger.log(
    '✅ testVoiceAmountNormalization_ passed'
  );
}

/**
 * Проверяет наличие обязательных колонок Calendar.
 * Не изменяет данные.
 */
function testVoiceCalendarHeaders_() {
  const columns =
    getCalendarColumns_();

  Logger.log(
    '✅ Calendar headers OK: ' +
    JSON.stringify(columns)
  );

  return columns;
}

/**
 * Диагностика последнего архивированного voice batch.
 */
function checkLastVoiceBatch() {
  const archiveFolder =
    getVoiceArchiveFolder_();

  const files =
    archiveFolder.getFiles();

  let latestFile = null;
  let latestDate = null;

  while (files.hasNext()) {
    const file = files.next();
    const created =
      file.getDateCreated();

    if (
      !latestDate ||
      created > latestDate
    ) {
      latestDate = created;
      latestFile = file;
    }
  }

  if (!latestFile) {
    Logger.log(
      'Voice archive is empty'
    );
    return null;
  }

  const content =
    latestFile
      .getBlob()
      .getDataAsString('UTF-8');

  const batch =
    JSON.parse(content);

  Logger.log(
    'Latest voice batch: ' +
    latestFile.getName()
  );

  Logger.log(
    JSON.stringify(batch, null, 2)
  );

  return batch;
}

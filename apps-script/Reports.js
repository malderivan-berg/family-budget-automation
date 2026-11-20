/**
 * ============================================================================
 * Family Budget Automation
 * Reports.gs
 * ----------------------------------------------------------------------------
 * Создание отчёта: новый блок в листе «Расчеты» с report_id = N + 1.
 * ============================================================================
 */

// ============================================================================
// СОЗДАНИЕ ОТЧЕТОВ
// ============================================================================

/**
 * Создает новый отчет.
 *
 * @returns {Object}
 */
function createNewReport_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SOURCE_SHEET_NAME);

  const reportBlock = getLastReportBlock_(sheet);

  duplicateReportBlock_(sheet, reportBlock);
  syncReportSheets_();

  return {
    id: reportBlock.reportId + 1,
    createdAt: getCurrentReportDate_(),
    period: getCurrentReportPeriod_()
  };
}

/**
 * Находит последний блок отчета в таблице.
 *
 * @param {SpreadsheetApp.Sheet} sheet
 * @returns {Object}
 */
function getLastReportBlock_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('Лист "Расчеты" не содержит данных.');
  }

  const reportIds = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .flat();

  const currentReportId = reportIds[reportIds.length - 1];

  let firstIndex = reportIds.length - 1;

  while (
    firstIndex > 0 &&
    reportIds[firstIndex - 1] === currentReportId
  ) {
    firstIndex--;
  }

  return {
    reportId: Number(currentReportId),
    firstRow: firstIndex + 2,
    lastRow: lastRow,
    rowCount: reportIds.length - firstIndex
  };
}

/**
 * Дублирует блок отчета для создания нового отчета.
 *
 * @param {SpreadsheetApp.Sheet} sheet
 * @param {Object} block
 */
function duplicateReportBlock_(sheet, block) {
  sheet.insertRowsAfter(block.lastRow, block.rowCount);

  const sourceRange = sheet.getRange(
    block.firstRow,
    1,
    block.rowCount,
    sheet.getLastColumn()
  );

  const targetRange = sheet.getRange(
    block.lastRow + 1,
    1,
    block.rowCount,
    sheet.getLastColumn()
  );

  sourceRange.copyTo(targetRange);

  const newId = block.reportId + 1;

  const ids = Array.from(
    { length: block.rowCount },
    () => [newId]
  );

  sheet
    .getRange(block.lastRow + 1, 1, block.rowCount, 1)
    .setValues(ids);
}


// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Возвращает текущий отчетный период.
 *
 * @returns {string}
 */
function getCurrentReportPeriod_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM'
  );
}

/**
 * Возвращает текущую дату в формате проекта.
 *
 * @returns {string}
 */
function getCurrentReportDate_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


/**
 * Достраивает листы, зависящие от «Расчетов», до последнего отчёта:
 * MIRROR — до последней строки «Расчетов», PER_REPORT — блоками до последнего
 * report_id. Размер блока берётся из данных. Идемпотентна: повторный вызов
 * ничего не добавляет.
 *
 * @returns {Object<string, number>} число добавленных строк по листам
 */
function syncReportSheets_() {
  const mainBlock = getLastReportBlock_(getSheet_(SOURCE_SHEET_NAME));
  const added = {};

  REPORT_SHEETS.MIRROR.forEach(function(name) {
    added[name] = syncMirrorSheet_(getSheet_(name), mainBlock.lastRow);
  });

  REPORT_SHEETS.PER_REPORT.forEach(function(name) {
    added[name] = syncPerReportSheet_(getSheet_(name), mainBlock.reportId);
  });

  return added;
}

/**
 * Дописывает строки листа-зеркала до targetLastRow копией последней строки:
 * её формулы ссылаются на ту же строку «Расчетов» и сдвигаются при копировании.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} targetLastRow последняя строка «Расчетов»
 * @returns {number} добавлено строк
 */
function syncMirrorSheet_(sheet, targetLastRow) {
  const lastRow = sheet.getLastRow();

  if (lastRow > targetLastRow) {
    throw new Error('Лист «' + sheet.getName() + '» длиннее «' + SOURCE_SHEET_NAME +
      '»: ' + lastRow + ' строк против ' + targetLastRow + '.');
  }

  const missing = targetLastRow - lastRow;
  if (missing === 0) {
    return 0;
  }

  const columns = sheet.getLastColumn();
  sheet.insertRowsAfter(lastRow, missing);
  sheet.getRange(lastRow, 1, 1, columns)
    .copyTo(sheet.getRange(lastRow + 1, 1, missing, columns));

  return missing;
}

/**
 * Дописывает блоки отчётов до lastReportId копией последнего блока.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} lastReportId последний report_id «Расчетов»
 * @returns {number} добавлено строк
 */
function syncPerReportSheet_(sheet, lastReportId) {
  let block = getLastReportBlock_(sheet);

  if (block.reportId > lastReportId) {
    throw new Error('В листе «' + sheet.getName() + '» есть отчёт №' + block.reportId +
      ', которого нет в «' + SOURCE_SHEET_NAME + '».');
  }

  let added = 0;
  while (block.reportId < lastReportId) {
    duplicateReportBlock_(sheet, block);
    added += block.rowCount;
    block = getLastReportBlock_(sheet);
  }

  return added;
}

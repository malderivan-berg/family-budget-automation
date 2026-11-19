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


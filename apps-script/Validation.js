/**
 * ============================================================================
 * Family Budget Automation
 * Validation.gs
 * ----------------------------------------------------------------------------
 * Проверка входных данных и состояния системы.
 * Все функции либо завершаются успешно,
 * либо генерируют понятную ошибку.
 * ============================================================================
 */

/**
 * Проверяет существование листа.
 *
 * @param {SpreadsheetApp.Sheet} sheet
 * @param {string} sheetName
 */
function assertSheetExists_(sheet, sheetName) {
  if (!sheet) {
    throw new Error(`${MSG_SHEET_NOT_FOUND}: "${sheetName}".`);
  }
}

/**
 * Проверяет наличие данных ниже строки заголовков.
 *
 * @param {SpreadsheetApp.Sheet} sheet
 */
function assertSheetHasData_(sheet) {
  if (getLastRow_(sheet) < START_ROW) {
    throw new Error(MSG_NO_DATA);
  }
}

/**
 * Проверяет, что найден хотя бы один отчет.
 *
 * @param {Array} rows
 * @param {string|number} reportId
 */
function assertReportFound_(rows, reportId) {
  if (!rows || rows.length === 0) {
    throw new Error(`${MSG_REPORT_NOT_FOUND} (report_id = ${reportId})`);
  }
}



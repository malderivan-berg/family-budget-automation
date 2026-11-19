/**
 * ============================================================================
 * Family Budget Automation
 * Utils.gs
 * ----------------------------------------------------------------------------
 * Общие вспомогательные функции проекта.
 * Не содержат бизнес-логики.
 * ============================================================================
 */


/**
 * Возвращает активную таблицу.
 *
 * @returns {SpreadsheetApp.Spreadsheet}
 */
function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}


/**
 * Возвращает лист по имени.
 *
 * @param {string} sheetName
 * @returns {SpreadsheetApp.Sheet}
 */
function getSheet_(sheetName) {
  return getSpreadsheet_().getSheetByName(sheetName);
}


/**
 * Возвращает последний заполненный номер строки.
 *
 * @param {SpreadsheetApp.Sheet} sheet
 * @returns {number}
 */
function getLastRow_(sheet) {
  return sheet.getLastRow();
}


/**
 * Показывает информационное сообщение пользователю.
 *
 * Работает и из UI-контекста, и из контекста редактора Apps Script.
 *
 * @param {string} message
 */
function showInfo_(message) {
  showMessage_('Информация', message);
}


/**
 * Показывает сообщение об ошибке пользователю.
 *
 * Работает и из UI-контекста, и из контекста редактора Apps Script.
 *
 * @param {string} message
 */
function showError_(message) {
  showMessage_('Ошибка', message);
}


/**
 * Универсальный показ сообщения.
 *
 * В UI-контексте использует Spreadsheet UI.
 * В серверном контексте пишет в Logger.
 *
 * @param {string} title
 * @param {string} message
 */
function showMessage_(title, message) {
  var text = String(message || '');

  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, text, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(title + ': ' + text);
  }
}


/**
 * Возвращает количество используемых столбцов на листе.
 *
 * @param {SpreadsheetApp.Sheet} sheet
 * @returns {number}
 */
function getLastColumn_(sheet) {
  return sheet.getLastColumn();
}
/**
 * ============================================================================
 * Family Budget Automation
 * Export.gs
 * ----------------------------------------------------------------------------
 * Экспорт выбранного report_id в отдельный Google Spreadsheet.
 * ============================================================================
 */


/**
 * Запрашивает report_id.
 */
function askReportId_() {

  const ui = SpreadsheetApp.getUi();

  const result = ui.prompt(
    'Экспорт report_id',
    'Введите номер report_id:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const reportId = result.getResponseText().trim();

  try {

    assertReportIdEntered_(reportId);

    const exportResult = exportReport_(reportId);

    showInfo_(
      'Экспорт завершён.\n\n' +

      'Dataset:\n' +
      exportResult.dataset.fileName +
      '\n' +
      exportResult.dataset.fileUrl +

      '\n\nAI Job Package:\n' +
      exportResult.jobPackage.fileName +
      '\n' +
      exportResult.jobPackage.fileUrl
      );

  } catch (error) {

    showError_(error.message);

  }

}


/**
 * Выполняет экспорт отчета.
 */
function exportReport_(reportId) {
  const sourceSheet = getSheet_(SOURCE_SHEET_NAME);
  assertSheetExists_(sourceSheet, SOURCE_SHEET_NAME);
  assertSheetHasData_(sourceSheet);
  
  const report = getReportRows_(sourceSheet, reportId);
  assertReportFound_(report.rows, reportId);
  
  const exportFile = createExportSpreadsheet_(reportId);
  fillExportSpreadsheet_(
    sourceSheet,
    exportFile.sheet,
    report
  );
  
  // Экспорт AI Job Package
  const jobPackageFile = exportAIJobPackage_(
    sourceSheet,
    report
  );
  
  return {
    success: true,
    reportId: reportId,
    dataset: {
      fileId: exportFile.fileId,
      fileName: exportFile.fileName,
      fileUrl: exportFile.spreadsheet.getUrl()
    },
    jobPackage: {
      fileName: jobPackageFile.fileName,
      fileUrl: jobPackageFile.fileUrl
    }
  };
}


/**
 * Возвращает строки отчета.
 */
function getReportRows_(sheet, reportId) {

  const lastRow = getLastRow_(sheet);
  const lastColumn = getLastColumn_(sheet);

  const values = sheet
    .getRange(
      START_ROW,
      START_COL,
      lastRow - START_ROW + 1,
      lastColumn
    )
    .getValues();

  const rows = [];
  const sourceRows = [];

  values.forEach(function(row, index) {

    if (String(row[REPORT_ID_COLUMN - 1]).trim() === String(reportId)) {

      rows.push(row);
      sourceRows.push(index + START_ROW);

    }

  });

  return {

    rows: rows,

    sourceRows: sourceRows

  };

}


/**
 * Создает файл экспорта в AI Workspace с фиксированным именем.
 * Перед созданием удаляет старую таблицу Dataset из AI Workspace.
 * 
 * @param {number|string} reportId - ID отчета (не используется для имени файла)
 * @returns {Object} объект с данными о созданной таблице
 */
function createExportSpreadsheet_(reportId) {
  // Удаляем старую таблицу Dataset из AI Workspace (если есть)
  const deleted = deleteFileFromWorkspace_(PROJECT_FILES.DATASET);
  Logger.log('Old dataset deleted: ' + deleted);
  
  // Используем фиксированное имя из PROJECT_FILES
  const fileName = PROJECT_FILES.DATASET;
  
  const spreadsheet = SpreadsheetApp.create(fileName);
  const sheet = spreadsheet.getSheets()[0];
  sheet.setName(EXPORT_SHEET_NAME);
  
  // Перемещаем в AI Workspace
  moveSpreadsheetToWorkspace_(spreadsheet);
  
  return {
    spreadsheet: spreadsheet,
    sheet: sheet,
    fileName: fileName,
    fileId: spreadsheet.getId()
  };
}


/**
 * Заполняет файл экспорта.
 */
function fillExportSpreadsheet_(
  sourceSheet,
  targetSheet,
  report
) {

  copyHeader_(sourceSheet, targetSheet);

  copyReportData_(
    sourceSheet,
    targetSheet,
    report
  );

  targetSheet.setFrozenRows(1);

}


/**
 * Копирует строку заголовков.
 */
function copyHeader_(
  sourceSheet,
  targetSheet
) {

  const lastColumn = getLastColumn_(sourceSheet);

  const sourceHeader = sourceSheet.getRange(
    1,
    1,
    1,
    lastColumn
  );

  const targetHeader = targetSheet.getRange(
    1,
    1,
    1,
    lastColumn
  );

  targetHeader.setValues(
    sourceHeader.getValues()
  );

  copyCellStyle_(
    sourceHeader,
    targetHeader
  );

}


/**
 * Копирует строки отчета.
 */
function copyReportData_(
  sourceSheet,
  targetSheet,
  report
) {

  const lastColumn = getLastColumn_(sourceSheet);

  const destination = targetSheet.getRange(
    2,
    1,
    report.rows.length,
    lastColumn
  );

  destination.setValues(report.rows);

  copyCellStyle_(

    sourceSheet.getRange(
      report.sourceRows[0],
      1,
      1,
      lastColumn
    ),

    targetSheet.getRange(
      2,
      1,
      1,
      lastColumn
    )

  );

  if (report.rows.length > 1) {

    targetSheet
      .getRange(
        2,
        1,
        1,
        lastColumn
      )
      .copyTo(

        targetSheet.getRange(
          3,
          1,
          report.rows.length - 1,
          lastColumn
        ),

        {
          formatOnly: true
        }

      );

  }

}

/**
 * ============================================================================
 * Экспортирует AI Job Package в AI Workspace.
 * ============================================================================
 */
function exportAIJobPackage_(sourceSheet, report) {
  Logger.log('EXPORT AI JOB PACKAGE START');
  
  const content = buildAIJobPackage_(sourceSheet, report);
  
  // Сохраняем в подпапку Job через DriveManager
  const file = saveAIJobPackage_(content);
  
  return {
    success: true,
    file: file,
    fileName: file.getName(),
    fileUrl: file.getUrl()
  };
}
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

// ============================================================================
// ВЫГРУЗКА REPORT_DATA (v1.0)
// Контракт: docs/TARGET_ARCHITECTURE_v1.0.md, раздел 5.1
// ============================================================================

/**
 * Сохраняет выгрузку report_data_{id}.json в папку отчёта.
 *
 * @param {number|string} reportId
 * @param {GoogleAppsScript.Drive.Folder} folder папка отчёта в Reports/
 * @returns {GoogleAppsScript.Drive.File}
 */
function exportReportData_(reportId, folder) {
  const data = buildReportData_(reportId);
  const fileName = reportFileName_(REPORT_AGENT.FILES.DATA, reportId);
  return saveFileWithOverwrite_(
    folder,
    fileName,
    JSON.stringify(data, null, 1),
    'application/json'
  );
}

/**
 * Собирает объект report_data по строкам листа «Расчеты».
 *
 * raw     — getValues(): числа числами, даты строками YYYY-MM-DD;
 * display — getDisplayValues(): строки так, как их форматирует Sheets.
 * В отчёт как числа попадают только display-строки.
 *
 * @param {number|string} reportId
 * @returns {Object}
 */
function buildReportData_(reportId) {
  const sheet = getSheet_(SOURCE_SHEET_NAME);
  assertSheetExists_(sheet, SOURCE_SHEET_NAME);
  assertSheetHasData_(sheet);

  const lastRow = getLastRow_(sheet);
  const lastColumn = getLastColumn_(sheet);
  const tz = Session.getScriptTimeZone();

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(h) { return String(h).trim(); });

  const range = sheet.getRange(
    START_ROW,
    START_COL,
    lastRow - START_ROW + 1,
    lastColumn
  );
  const values = range.getValues();
  const displays = range.getDisplayValues();

  const rows = [];
  values.forEach(function(row, i) {
    if (String(row[REPORT_ID_COLUMN - 1]).trim() !== String(reportId)) {
      return;
    }
    const raw = {};
    const display = {};
    headers.forEach(function(header, c) {
      if (!header) {
        return;
      }
      raw[header] = toJsonValue_(row[c], tz);
      display[header] = String(displays[i][c]);
    });
    rows.push({ raw: raw, display: display });
  });

  assertReportFound_(rows, reportId);

  const first = rows[0].raw;
  if (!isIsoDate_(first.period_start) || !isIsoDate_(first.period_end)) {
    throw new Error(
      'report_data: в отчёте ' + reportId +
      ' не заполнены даты period_start / period_end'
    );
  }
  if (typeof first.duration_days !== 'number') {
    throw new Error('report_data: в отчёте ' + reportId + ' нет duration_days');
  }

  const spreadsheet = getSpreadsheet_();

  return {
    schema: 'report_data',
    schema_version: REPORT_AGENT.DATA_SCHEMA_VERSION,
    report_id: Number(reportId),
    created_at: new Date().toISOString(),
    period_start: first.period_start,
    period_end: first.period_end,
    duration_days: first.duration_days,
    source: {
      spreadsheet_id: spreadsheet.getId(),
      spreadsheet: spreadsheet.getName(),
      sheet: SOURCE_SHEET_NAME
    },
    columns: headers.filter(function(h) { return h; }),
    rows: rows,
    delivery: {
      users: getDeliveryUsers_(),
      caption: buildDeliveryCaption_(reportId, first.period_start, first.period_end)
    }
  };
}

/**
 * Значение ячейки → значение JSON.
 *
 * @param {*} value
 * @param {string} tz
 * @returns {*}
 */
function toJsonValue_(value, tz) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  return value;
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isIsoDate_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Подпись к отчёту в Telegram.
 *
 * @param {number|string} reportId
 * @param {string} periodStart YYYY-MM-DD
 * @param {string} periodEnd YYYY-MM-DD
 * @returns {string}
 */
function buildDeliveryCaption_(reportId, periodStart, periodEnd) {
  function dmy(iso) {
    const p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  return '📊 Отчёт за период ' + dmy(periodStart) + ' — ' + dmy(periodEnd) +
    '\n\nReport ID: ' + reportId;
}

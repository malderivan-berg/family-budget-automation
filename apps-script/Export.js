/**
 * ============================================================================
 * Family Budget Automation
 * Export.gs
 * ----------------------------------------------------------------------------
 * Выгрузка отчёта report_data_N.json для агента отчёта.
 * Контракт: docs/TARGET_ARCHITECTURE_v1.0.md, раздел 5.1.
 * ============================================================================
 */


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

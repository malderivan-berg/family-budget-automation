/**
 * ============================================================================
 * Family Budget Automation
 * Export.gs
 * ----------------------------------------------------------------------------
 * Выгрузка отчёта report_data_N.json для агента отчёта — schema 2.0 (data v1.2).
 * Листы и колонки задаёт REPORT_DATA (Config.gs); колонки читаются по
 * заголовкам, поэтому новая колонка в листе попадает в выгрузку без правки кода.
 * Контракт: docs/REPORT_DATA_2.0.md.
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
 * Собирает объект report_data: таблицы REPORT_DATA.TABLES по отчёту.
 *
 * raw     — getValues(): числа числами, даты строками YYYY-MM-DD;
 * display — getDisplayValues(): строки так, как их форматирует Sheets.
 * В отчёт как числа попадают только display-строки.
 *
 * @param {number|string} reportId
 * @returns {Object}
 */
function buildReportData_(reportId) {
  const spreadsheet = getSpreadsheet_();
  const tz = Session.getScriptTimeZone();

  const tables = {};
  REPORT_DATA.TABLES.forEach(function(spec) {
    tables[spec.key] = readReportTable_(spreadsheet, spec, reportId, tz);
  });

  const first = tables[REPORT_DATA.PERIOD_TABLE].rows[0].raw;
  if (!isIsoDate_(first.period_start) || !isIsoDate_(first.period_end)) {
    throw new Error(
      'report_data: в отчёте ' + reportId +
      ' не заполнены даты period_start / period_end'
    );
  }
  if (typeof first.duration_days !== 'number') {
    throw new Error('report_data: в отчёте ' + reportId + ' нет duration_days');
  }

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
      spreadsheet: spreadsheet.getName()
    },
    tables: tables,
    delivery: {
      users: getDeliveryUsers_(),
      caption: buildDeliveryCaption_(reportId, first.period_start, first.period_end)
    }
  };
}

/**
 * Читает строки одного листа для выгрузки.
 *
 * @param {SpreadsheetApp.Spreadsheet} spreadsheet
 * @param {{key: string, sheet: string, filter: string, required: boolean}} spec
 * @param {number|string} reportId
 * @param {string} tz
 * @returns {{sheet: string, columns: string[], rows: Object[]}}
 */
function readReportTable_(spreadsheet, spec, reportId, tz) {
  const sheet = spreadsheet.getSheetByName(spec.sheet);
  assertSheetExists_(sheet, spec.sheet);

  const lastRow = getLastRow_(sheet);
  const lastColumn = getLastColumn_(sheet);
  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(h) { return String(h).trim(); });

  const filterHeader = spec.filter === 'report'
    ? REPORT_DATA.REPORT_ID_HEADER
    : REPORT_DATA.ACTIVE_HEADER;
  const filterIndex = headers.indexOf(filterHeader);
  if (filterIndex < 0) {
    throw new Error(
      'report_data: на листе «' + spec.sheet + '» нет колонки ' + filterHeader
    );
  }

  const rows = [];
  if (lastRow >= START_ROW) {
    const range = sheet.getRange(START_ROW, 1, lastRow - START_ROW + 1, lastColumn);
    const values = range.getValues();
    const displays = range.getDisplayValues();

    values.forEach(function(row, i) {
      if (!rowMatchesFilter_(row[filterIndex], spec.filter, reportId)) {
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
  }

  if (spec.required) {
    assertReportFound_(rows, reportId + ', лист «' + spec.sheet + '»');
  }

  return {
    sheet: spec.sheet,
    columns: headers.filter(function(h) { return h; }),
    rows: rows
  };
}

/**
 * @param {*} value значение колонки фильтра
 * @param {string} filter 'report' | 'active'
 * @param {number|string} reportId
 * @returns {boolean}
 */
function rowMatchesFilter_(value, filter, reportId) {
  if (filter === 'report') {
    return String(value).trim() === String(reportId);
  }
  return String(value).trim().toUpperCase() === 'TRUE';
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

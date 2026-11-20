/**
 * ============================================================================
 * Family Budget Automation
 * MigrationManager.gs  (Stage 3, шаг 5.4)
 * ----------------------------------------------------------------------------
 * Перенос данных рабочей таблицы data v1.1 в data v1.2 до переключения:
 *  - «Остатки»: периоды v1.1 начиная с FIRST_PERIOD_ID — балансы заменяются
 *    данными v1.1, введённые вручную строки нереализованной прибыли
 *    (с датой) сохраняются;
 *  - «Календарь»: фактические операции v1.1 после CALENDAR_BASELINE_END,
 *    которых ещё нет в v1.2; суммы-тексты v1.2 приводятся к числам;
 *  - блоки отчётов достраиваются до последнего полного периода.
 * Запускается из проекта таблицы v1.2. Повторный запуск безопасен.
 * После переключения на v1.2 модуль удаляется.
 * ============================================================================
 */

/**
 * Перенос данных v1.1 → v1.2.
 *
 * @param {boolean} apply false — только план, без записи
 * @returns {Object} итог: по периодам, Календарь, отчёты, ошибки сопоставления
 */
function migrateFromV11_(apply) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(REPORT_AGENT.LOCK_TIMEOUT_MS)) {
    throw new Error('Скрипт занят. Повторите через минуту.');
  }

  try {
    const source = SpreadsheetApp.openById(MIGRATION_V11.SOURCE_SPREADSHEET_ID);
    const toTargetDate = buildDateConverter_(
      source.getSpreadsheetTimeZone(),
      SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()
    );
    const result = {
      apply: apply,
      balances: migrateBalances_(source, apply, toTargetDate),
      calendar: migrateCalendar_(source, apply, toTargetDate),
      reports: null
    };

    if (apply) {
      SpreadsheetApp.flush();
      result.reports = ensureReportBlocks_();
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// ОСТАТКИ
// ============================================================================

/**
 * Заменяет балансы периодов ≥ FIRST_PERIOD_ID данными v1.1.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} source data v1.1
 * @param {boolean} apply
 * @param {function(Date): Date} toTargetDate
 * @returns {Object} { periods: {id: {removed, added}}, unmapped: [] }
 */
function migrateBalances_(source, apply, toTargetDate) {
  const target = getSheet_(MIGRATION_V11.BALANCES_SHEET);
  const src = readMigrationTable_(source.getSheetByName(MIGRATION_V11.BALANCES_SHEET));
  const dst = readMigrationTable_(target);
  const cols = MIGRATION_V11.BALANCE_COLUMNS;

  const keys = buildAccountKeyMap_(dst.rows);
  const srcRows = src.rows.filter(function(row) {
    return Number(row[cols.PERIOD]) >= MIGRATION_V11.FIRST_PERIOD_ID;
  });

  const unmapped = [];
  srcRows.forEach(function(row) {
    const id = accountKeyId_(row);
    if (!keys[id] && unmapped.indexOf(id) < 0) {
      unmapped.push(id);
    }
  });
  if (unmapped.length > 0) {
    return { periods: {}, unmapped: unmapped };
  }

  const periods = {};
  srcRows.forEach(function(row) {
    const id = Number(row[cols.PERIOD]);
    periods[id] = periods[id] || { removed: 0, added: 0, keptUnrealized: 0 };
    periods[id].added++;
  });

  const removeRows = [];
  dst.rows.forEach(function(row) {
    const id = Number(row[cols.PERIOD]);
    if (!periods[id]) {
      return;
    }
    const keep = row[cols.VALUE_ROLE] === MIGRATION_V11.VALUE_ROLE_UNREALIZED &&
      row[cols.DATE] !== '' && row[cols.DATE] !== null;
    if (keep) {
      periods[id].keptUnrealized++;
    } else {
      periods[id].removed++;
      removeRows.push(row._row);
    }
  });

  if (apply) {
    removeRows.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) {
      target.deleteRow(rowNumber);
    });
    appendBalanceRows_(target, dst.headers, srcRows, keys, toTargetDate);
  }

  return { periods: periods, unmapped: [] };
}

/**
 * Дописывает балансы v1.1 в «Остатки» v1.2. Колонка с формулой
 * (remaining_value_RUR) получает формулу первой строки данных в R1C1 —
 * формат листа задают данные, а не код.
 */
function appendBalanceRows_(sheet, headers, srcRows, keys, toTargetDate) {
  const cols = MIGRATION_V11.BALANCE_COLUMNS;
  const width = headers.length;
  const formulasR1C1 = sheet.getRange(2, 1, 1, width).getFormulasR1C1()[0];

  const values = srcRows.map(function(row) {
    const out = headers.map(function() { return ''; });
    const set = function(name, value) {
      const index = headers.indexOf(name);
      if (index >= 0) {
        out[index] = value;
      }
    };

    set(cols.PERIOD, row[cols.PERIOD]);
    set(cols.ACCOUNT_KEY, keys[accountKeyId_(row)]);
    set(cols.DATE, toTargetDate(row[cols.DATE]));
    set(cols.OWNER, row[cols.OWNER]);
    set(cols.ACCOUNT_NAME, row[cols.ACCOUNT_NAME]);
    set(cols.VALUE_NATIVE, row[cols.VALUE_RUR]);
    set(cols.CURRENCY, MIGRATION_V11.DEFAULT_CURRENCY);
    set(cols.FX_RATE, 1);
    set(cols.VALUE_ROLE, MIGRATION_V11.VALUE_ROLE_BALANCE);
    MIGRATION_V11.COPIED_COLUMNS.forEach(function(name) {
      set(name, row[name] === undefined ? '' : row[name]);
    });
    return out;
  });

  if (values.length === 0) {
    return;
  }

  const firstRow = sheet.getLastRow() + 1;
  sheet.getRange(firstRow, 1, values.length, width).setValues(values);

  formulasR1C1.forEach(function(formula, index) {
    if (formula) {
      sheet.getRange(firstRow, index + 1, values.length, 1)
        .setFormulaR1C1(formula);
    }
  });
}

/**
 * (owner|account_name) → account_key по существующим балансам v1.2
 * плюс MIGRATION_V11.NEW_ACCOUNT_KEYS для новых счетов.
 */
function buildAccountKeyMap_(rows) {
  const cols = MIGRATION_V11.BALANCE_COLUMNS;
  const map = {};
  rows.forEach(function(row) {
    if (row[cols.VALUE_ROLE] === MIGRATION_V11.VALUE_ROLE_BALANCE && row[cols.ACCOUNT_KEY]) {
      map[accountKeyId_(row)] = row[cols.ACCOUNT_KEY];
    }
  });
  Object.keys(MIGRATION_V11.NEW_ACCOUNT_KEYS).forEach(function(id) {
    map[id] = MIGRATION_V11.NEW_ACCOUNT_KEYS[id];
  });
  return map;
}

function accountKeyId_(row) {
  const cols = MIGRATION_V11.BALANCE_COLUMNS;
  return String(row[cols.OWNER]).trim() + '|' + String(row[cols.ACCOUNT_NAME]).trim();
}

// ============================================================================
// КАЛЕНДАРЬ
// ============================================================================

/**
 * Дописывает фактические операции v1.1 после CALENDAR_BASELINE_END, которых
 * нет в v1.2 (по voice_operation_id или по всем полям), и приводит
 * суммы-тексты v1.2 к числам. Плановые строки без суммы не переносятся.
 */
function migrateCalendar_(source, apply, toTargetDate) {
  const cols = MIGRATION_V11.CALENDAR_COLUMNS;
  const target = getSheet_(MIGRATION_V11.CALENDAR_SHEET);
  const src = readMigrationTable_(source.getSheetByName(MIGRATION_V11.CALENDAR_SHEET));
  const dst = readMigrationTable_(target);
  const baselineEnd = new Date(MIGRATION_V11.CALENDAR_BASELINE_END + 'T23:59:59');

  const known = {};
  dst.rows.forEach(function(row) { known[calendarRowId_(row)] = true; });

  const toAdd = src.rows.filter(function(row) {
    const amount = parseMigrationNumber_(row[cols.AMOUNT]);
    return amount !== null &&
      row[cols.DATE] instanceof Date && row[cols.DATE] > baselineEnd &&
      !known[calendarRowId_(row)];
  });

  const toNormalize = dst.rows.filter(function(row) {
    return typeof row[cols.AMOUNT] === 'string' && parseMigrationNumber_(row[cols.AMOUNT]) !== null;
  });

  if (apply) {
    const amountColumn = dst.headers.indexOf(cols.AMOUNT) + 1;
    toNormalize.forEach(function(row) {
      target.getRange(row._row, amountColumn).setValue(parseMigrationNumber_(row[cols.AMOUNT]));
    });

    if (toAdd.length > 0) {
      const values = toAdd.map(function(row) {
        return dst.headers.map(function(name) {
          if (name === cols.AMOUNT) {
            return parseMigrationNumber_(row[name]);
          }
          if (name === cols.DATE) {
            return toTargetDate(row[name]);
          }
          return row[name] === undefined ? '' : row[name];
        });
      });
      target.getRange(target.getLastRow() + 1, 1, values.length, dst.headers.length)
        .setValues(values);
    }
  }

  return { added: toAdd.length, normalizedAmounts: toNormalize.length };
}

function calendarRowId_(row) {
  const cols = MIGRATION_V11.CALENDAR_COLUMNS;
  if (row[cols.VOICE_ID]) {
    return 'voice:' + row[cols.VOICE_ID];
  }
  const date = row[cols.DATE] instanceof Date ? row[cols.DATE].toISOString().slice(0, 10) : String(row[cols.DATE]);
  return [date, row[cols.OWNER], parseMigrationNumber_(row[cols.AMOUNT]), row[cols.TYPE],
    String(row[cols.COMMENT] || '').trim()].join('|');
}

// ============================================================================
// БЛОКИ ОТЧЁТОВ
// ============================================================================

/**
 * Создаёт блоки отчётов до последнего полного периода: отчёт N охватывает
 * периоды N → N + 1, поэтому последний отчёт = последний период «Остатков» − 1.
 *
 * @returns {Object} { created: [report_id…], sync: {...} }
 */
function ensureReportBlocks_() {
  const cols = MIGRATION_V11.BALANCE_COLUMNS;
  const balances = readMigrationTable_(getSheet_(MIGRATION_V11.BALANCES_SHEET));
  const lastPeriod = balances.rows.reduce(function(max, row) {
    const id = Number(row[cols.PERIOD]);
    return row[cols.DATE] instanceof Date && id > max ? id : max;
  }, 0);

  const created = [];
  let lastReport = getLastReportBlock_(getSheet_(SOURCE_SHEET_NAME)).reportId;
  while (lastReport < lastPeriod - 1) {
    lastReport = createNewReport_().id;
    created.push(lastReport);
  }

  return { created: created, sync: syncReportSheets_() };
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================================

/**
 * Лист → { headers, rows }; строка — объект «заголовок → значение» и _row
 * (номер строки листа). Пустые строки пропускаются.
 */
function readMigrationTable_(sheet) {
  if (!sheet) {
    throw new Error('Лист для переноса не найден.');
  }
  const map = getMarketHeaderMap_(sheet);
  const headers = [];
  Object.keys(map).forEach(function(name) { headers[map[name]] = name; });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { headers: headers, rows: [] };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const rows = [];
  values.forEach(function(line, index) {
    if (line.every(function(value) { return value === '' || value === null; })) {
      return;
    }
    const row = { _row: index + 2 };
    headers.forEach(function(name, column) {
      if (name) {
        row[name] = line[column];
      }
    });
    rows.push(row);
  });

  return { headers: headers, rows: rows };
}

/**
 * Дата без времени из таблицы-источника → та же календарная дата в часовом
 * поясе таблицы-приёмника (полночь). Без этого полночь по Москве в таблице
 * с другим поясом превращается в «вчера, 14:00».
 *
 * @param {string} sourceTimeZone
 * @param {string} targetTimeZone
 * @returns {function(*): *}
 */
function buildDateConverter_(sourceTimeZone, targetTimeZone) {
  return function(value) {
    if (!(value instanceof Date)) {
      return value;
    }
    const day = Utilities.formatDate(value, sourceTimeZone, 'yyyy-MM-dd');
    return Utilities.parseDate(day, targetTimeZone, 'yyyy-MM-dd');
  };
}

/**
 * Число из значения ячейки: число как есть; строка «1 234,5» → 1234.5;
 * пусто или не число → null.
 */
function parseMigrationNumber_(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.replace(/[\s ]/g, '').replace(',', '.');
  if (text === '' || !/^[-+]?\d+(\.\d+)?$/.test(text)) {
    return null;
  }
  return Number(text);
}

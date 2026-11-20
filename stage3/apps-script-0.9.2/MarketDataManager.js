/**
 * ============================================================================
 * Family Budget Automation
 * MarketDataManager.gs
 * ----------------------------------------------------------------------------
 * Stage 3.5 Market Data Loader.
 *
 * Ответственность:
 * 1. Получить raw market observations из утвержденных источников.
 * 2. Нормализовать данные в canonical sheet "Рынки".
 * 3. Обеспечить идемпотентность по market_key + date.
 * 4. Не изменять существующее observation молча.
 * 5. Не выполнять report-level или финансовые расчеты.
 *
 * Google Sheets остается владельцем всех вычислений.
 * ============================================================================
 */


/**
 * Загружает market data из всех активных автоматических источников.
 *
 * На текущем этапе:
 * - IMOEX
 * - RGBI
 * - USD_RUB
 * - CNY_RUB
 * - CBR_KEY_RATE
 *
 * Housing rows пока не загружаются автоматически.
 *
 * @returns {Object}
 */
function updateMarketData_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Market data update уже выполняется другим процессом.'
    );
  }

  try {
    const sheet = getSheet_(MARKET_DATA.SHEET_NAME);

    assertSheetExists_(
      sheet,
      MARKET_DATA.SHEET_NAME
    );

    const headerMap =
      getMarketHeaderMap_(sheet);

    assertMarketHeaders_(headerMap);

    const existing =
      readExistingMarketData_(
        sheet,
        headerMap
      );

    const now = new Date();
    const today =
      normalizeMarketDate_(now);

    const fromDate =
      addMarketDays_(
        today,
        -MARKET_DATA.LOOKBACK_DAYS
      );

    const observations = [];
    const errors = [];

    // -----------------------------------------------------------------------
    // MOEX — IMOEX
    // -----------------------------------------------------------------------
    fetchMarketSourceSafely_(
      'IMOEX',
      function() {
        const rows =
          fetchMoexIndexHistory_(
            'IMOEX',
            MARKET_DATA.MOEX.SECURITIES.IMOEX,
            fromDate,
            today
          );

        Array.prototype.push.apply(
          observations,
          rows
        );
      },
      errors
    );

    // -----------------------------------------------------------------------
    // MOEX — RGBI
    // -----------------------------------------------------------------------
    fetchMarketSourceSafely_(
      'RGBI',
      function() {
        const rows =
          fetchMoexIndexHistory_(
            'RGBI',
            MARKET_DATA.MOEX.SECURITIES.RGBI,
            fromDate,
            today
          );

        Array.prototype.push.apply(
          observations,
          rows
        );
      },
      errors
    );

    // -----------------------------------------------------------------------
    // MOEX — Moscow Real Estate DomClick Index
    // -----------------------------------------------------------------------
    fetchMarketSourceSafely_(
      'MOSCOW_HOUSING_MREDC',
      function() {
        const rows =
          fetchMoexIndexHistory_(
            'MOSCOW_HOUSING_MREDC',
            MARKET_DATA.MOEX.SECURITIES.MREDC,
            fromDate,
            today,
            'RUB_per_m2'
          );

        Array.prototype.push.apply(
          observations,
          rows
        );
      },
      errors
    );

    // -----------------------------------------------------------------------
    // CBR — USD
    // -----------------------------------------------------------------------
    fetchMarketSourceSafely_(
      'USD_RUB',
      function() {
        const config =
          MARKET_DATA.CBR.CURRENCIES.USD_RUB;

        const rows =
          fetchCbrFxHistory_(
            'USD_RUB',
            config.code,
            config.unit,
            fromDate,
            today
          );

        Array.prototype.push.apply(
          observations,
          rows
        );
      },
      errors
    );

    // -----------------------------------------------------------------------
    // CBR — CNY
    // -----------------------------------------------------------------------
    fetchMarketSourceSafely_(
      'CNY_RUB',
      function() {
        const config =
          MARKET_DATA.CBR.CURRENCIES.CNY_RUB;

        const rows =
          fetchCbrFxHistory_(
            'CNY_RUB',
            config.code,
            config.unit,
            fromDate,
            today
          );

        Array.prototype.push.apply(
          observations,
          rows
        );
      },
      errors
    );

    // -----------------------------------------------------------------------
    // CBR — Key Rate
    // -----------------------------------------------------------------------
    fetchMarketSourceSafely_(
      'CBR_KEY_RATE',
      function() {
        const rows =
          fetchCbrKeyRateHistory_(
            existing,
            today
          );

        Array.prototype.push.apply(
          observations,
          rows
        );
      },
      errors
    );

    const mergeResult =
      appendMarketObservations_(
        sheet,
        headerMap,
        existing,
        observations,
        now
      );

    SpreadsheetApp.flush();

    Logger.log(
      '=== MARKET DATA UPDATE COMPLETE ==='
    );
    Logger.log(
      'Fetched observations: ' +
      observations.length
    );
    Logger.log(
      'Appended: ' +
      mergeResult.appended
    );
    Logger.log(
      'Skipped existing: ' +
      mergeResult.skipped
    );
    Logger.log(
      'Conflicts: ' +
      mergeResult.conflicts.length
    );
    Logger.log(
      'Source errors: ' +
      errors.length
    );

    return {
      success: errors.length === 0,
      fetched: observations.length,
      appended: mergeResult.appended,
      skipped: mergeResult.skipped,
      conflicts: mergeResult.conflicts,
      errors: errors
    };

  } finally {
    lock.releaseLock();
  }
}


/**
 * Выполняет fetch одного источника без остановки всего market loader.
 *
 * Ошибка внешнего market source является non-blocking.
 *
 * @param {string} sourceName
 * @param {Function} callback
 * @param {Array<Object>} errors
 */
function fetchMarketSourceSafely_(
  sourceName,
  callback,
  errors
) {
  try {
    callback();

  } catch (error) {
    Logger.log(
      'Market source error [' +
      sourceName +
      ']: ' +
      error.message
    );

    errors.push({
      source: sourceName,
      error: error.message
    });
  }
}


// ============================================================================
// MOEX
// ============================================================================

/**
 * Получает history индекса MOEX ISS.
 *
 * @param {string} marketKey
 * @param {string} securityId
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {Array<Object>}
 */
function fetchMoexIndexHistory_(
  marketKey,
  securityId,
  fromDate,
  toDate,
  unit
) {
  const from =
    formatMarketDateIso_(fromDate);

  const till =
    formatMarketDateIso_(toDate);

  const url =
    MARKET_DATA.MOEX.BASE_URL +
    encodeURIComponent(securityId) +
    '.json' +
    '?from=' +
    encodeURIComponent(from) +
    '&till=' +
    encodeURIComponent(till) +
    '&iss.meta=off' +
    '&history.columns=TRADEDATE,CLOSE';

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      }
    );

  assertHttpSuccess_(
    response,
    'MOEX ' + marketKey
  );

  const payload =
    JSON.parse(
      response.getContentText('UTF-8')
    );

  if (
    !payload ||
    !payload.history ||
    !payload.history.columns ||
    !payload.history.data
  ) {
    throw new Error(
      'Некорректный MOEX ISS response для ' +
      marketKey
    );
  }

  const columns =
    payload.history.columns;

  const dateIndex =
    columns.indexOf('TRADEDATE');

  const closeIndex =
    columns.indexOf('CLOSE');

  if (
    dateIndex < 0 ||
    closeIndex < 0
  ) {
    throw new Error(
      'MOEX response не содержит TRADEDATE/CLOSE: ' +
      marketKey
    );
  }

  const result = [];

  payload.history.data.forEach(
    function(row) {
      const dateValue =
        row[dateIndex];

      const closeValue =
        Number(row[closeIndex]);

      if (
        !dateValue ||
        !isFinite(closeValue)
      ) {
        return;
      }

      result.push({
        marketKey: marketKey,
        date:
          parseIsoMarketDate_(
            String(dateValue)
          ),
        value: closeValue,
        unit: unit || 'points',
        source:
          MARKET_DATA.SOURCES.MOEX,
        qualityStatus:
          MARKET_DATA.QUALITY_OK,
        publishedAt: ''
      });
    }
  );

  return result;
}


// ============================================================================
// CBR FX
// ============================================================================

/**
 * Получает историю официального курса валюты Банка России.
 *
 * @param {string} marketKey
 * @param {string} currencyCode
 * @param {string} unit
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {Array<Object>}
 */
function fetchCbrFxHistory_(
  marketKey,
  currencyCode,
  unit,
  fromDate,
  toDate
) {
  const url =
    MARKET_DATA.CBR.FX_URL +
    '?date_req1=' +
    encodeURIComponent(
      formatMarketDateCbr_(fromDate)
    ) +
    '&date_req2=' +
    encodeURIComponent(
      formatMarketDateCbr_(toDate)
    ) +
    '&VAL_NM_RQ=' +
    encodeURIComponent(currencyCode);

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      }
    );

  assertHttpSuccess_(
    response,
    'CBR FX ' + marketKey
  );

  const xml =
    XmlService.parse(
      response.getContentText('UTF-8')
    );

  const root =
    xml.getRootElement();

  const records =
    root.getChildren('Record');

  const result = [];

  records.forEach(
    function(record) {
      const dateAttribute =
        record.getAttribute('Date');

      if (!dateAttribute) {
        return;
      }

      const nominalText =
        getXmlChildText_(
          record,
          'Nominal'
        );

      const valueText =
        getXmlChildText_(
          record,
          'Value'
        );

      const unitRateText =
        getXmlChildText_(
          record,
          'VunitRate'
        );

      const nominal =
        parseMarketNumber_(nominalText);

      const rawValue =
        parseMarketNumber_(valueText);

      const unitRate =
        parseMarketNumber_(unitRateText);

      let value = unitRate;

      if (!isFinite(value)) {
        if (
          !isFinite(rawValue) ||
          !isFinite(nominal) ||
          nominal === 0
        ) {
          return;
        }

        value =
          rawValue / nominal;
      }

      result.push({
        marketKey: marketKey,
        date:
          parseCbrMarketDate_(
            dateAttribute.getValue()
          ),
        value: value,
        unit: unit,
        source:
          MARKET_DATA.SOURCES.CBR_FX,
        qualityStatus:
          MARKET_DATA.QUALITY_OK,
        publishedAt: ''
      });
    }
  );

  return result;
}


// ============================================================================
// CBR KEY RATE
// ============================================================================

/**
 * Получает динамику ключевой ставки.
 *
 * В "Рынки" сохраняются только изменения ставки,
 * а не ежедневное повторение одного и того же значения.
 *
 * @param {Object} existing
 * @param {Date} toDate
 * @returns {Array<Object>}
 */
function fetchCbrKeyRateHistory_(
  existing,
  toDate
) {
  const latest =
    findLatestExistingObservation_(
      existing,
      'CBR_KEY_RATE'
    );

  const fromDate =
    latest
      ? latest.date
      : parseIsoMarketDate_(
          MARKET_DATA.CBR.KEY_RATE_START
        );

  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body>' +
    '<KeyRateXML xmlns="http://web.cbr.ru/">' +
    '<fromDate>' +
    formatMarketDateIso_(fromDate) +
    '</fromDate>' +
    '<ToDate>' +
    formatMarketDateIso_(toDate) +
    '</ToDate>' +
    '</KeyRateXML>' +
    '</soap:Body>' +
    '</soap:Envelope>';

  const response =
    UrlFetchApp.fetch(
      MARKET_DATA.CBR.SOAP_URL,
      {
        method: 'post',
        contentType:
          'text/xml; charset=utf-8',
        headers: {
          SOAPAction:
            '"http://web.cbr.ru/KeyRateXML"'
        },
        payload: envelope,
        muteHttpExceptions: true,
        followRedirects: true
      }
    );

  assertHttpSuccess_(
    response,
    'CBR KeyRateXML'
  );

  const xml =
    XmlService.parse(
      response.getContentText('UTF-8')
    );

  const krElements = [];

  collectXmlElementsByName_(
    xml.getRootElement(),
    'KR',
    krElements
  );

  const dailyRates = [];

  krElements.forEach(
    function(element) {
      const dateText =
        getXmlChildText_(
          element,
          'DT'
        );

      const rateText =
        getXmlChildText_(
          element,
          'Rate'
        );

      const rate =
        parseMarketNumber_(rateText);

      if (
        !dateText ||
        !isFinite(rate)
      ) {
        return;
      }

      dailyRates.push({
        date:
          parseIsoMarketDate_(
            String(dateText)
              .substring(0, 10)
          ),
        value: rate
      });
    }
  );

  dailyRates.sort(
    function(a, b) {
      return (
        a.date.getTime() -
        b.date.getTime()
      );
    }
  );

  let previousRate =
    latest
      ? Number(latest.value)
      : null;

  const result = [];

  dailyRates.forEach(
    function(item) {
      if (
        previousRate === null ||
        Math.abs(
          item.value - previousRate
        ) > 0.000000001
      ) {
        result.push({
          marketKey:
            'CBR_KEY_RATE',
          date: item.date,
          value: item.value,
          unit: '%',
          source:
            MARKET_DATA.SOURCES
              .CBR_KEY_RATE,
          qualityStatus:
            MARKET_DATA.QUALITY_OK,
          publishedAt: ''
        });
      }

      previousRate =
        item.value;
    }
  );

  return result;
}


// ============================================================================
// WRITE / IDEMPOTENCY
// ============================================================================

/**
 * Добавляет только новые observations.
 *
 * Unique key:
 * market_key + date
 *
 * Existing rows никогда не перезаписываются молча.
 *
 * @returns {Object}
 */
function appendMarketObservations_(
  sheet,
  headerMap,
  existing,
  observations,
  fetchedAt
) {
  const rowsToAppend = [];
  const conflicts = [];

  let skipped = 0;

  const known =
    Object.assign(
      {},
      existing.byId
    );

  observations.sort(
    function(a, b) {
      const dateDiff =
        a.date.getTime() -
        b.date.getTime();

      if (dateDiff !== 0) {
        return dateDiff;
      }

      return String(a.marketKey)
        .localeCompare(
          String(b.marketKey)
        );
    }
  );

  observations.forEach(
    function(observation) {
      const id =
        buildMarketObservationId_(
          observation.marketKey,
          observation.date
        );

      const current =
        known[id];

      if (current) {
        const oldValue =
          Number(current.value);

        const newValue =
          Number(observation.value);

        if (
          isFinite(oldValue) &&
          isFinite(newValue) &&
          Math.abs(
            oldValue - newValue
          ) <= 0.000000001
        ) {
          skipped++;
          return;
        }

        conflicts.push({
          id: id,
          existingValue:
            current.value,
          incomingValue:
            observation.value
        });

        Logger.log(
          'Market data conflict: ' +
          id +
          ' | existing=' +
          current.value +
          ' | incoming=' +
          observation.value
        );

        return;
      }

      const row =
        buildMarketSheetRow_(
          sheet.getLastColumn(),
          headerMap,
          observation,
          fetchedAt
        );

      rowsToAppend.push(row);

      known[id] = {
        marketKey:
          observation.marketKey,
        date:
          observation.date,
        value:
          observation.value
      };
    }
  );

  if (rowsToAppend.length > 0) {
    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        rowsToAppend.length,
        sheet.getLastColumn()
      )
      .setValues(rowsToAppend);
  }

  return {
    appended: rowsToAppend.length,
    skipped: skipped,
    conflicts: conflicts
  };
}


/**
 * Формирует строку листа "Рынки" по заголовкам.
 */
function buildMarketSheetRow_(
  columnCount,
  headerMap,
  observation,
  fetchedAt
) {
  const row =
    new Array(columnCount)
      .fill('');

  row[
    headerMap.market_key
  ] =
    observation.marketKey;

  row[
    headerMap.date
  ] =
    observation.date;

  row[
    headerMap.value
  ] =
    observation.value;

  row[
    headerMap.unit
  ] =
    observation.unit;

  row[
    headerMap.source
  ] =
    observation.source;

  row[
    headerMap.fetched_at
  ] =
    fetchedAt;

  row[
    headerMap.quality_status
  ] =
    observation.qualityStatus;

  row[
    headerMap.published_at
  ] =
    observation.publishedAt || '';

  return row;
}


// ============================================================================
// SHEET READ
// ============================================================================

function getMarketHeaderMap_(sheet) {
  const lastColumn =
    sheet.getLastColumn();

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];

  const map = {};

  headers.forEach(
    function(header, index) {
      const key =
        String(header || '')
          .trim();

      if (key) {
        map[key] = index;
      }
    }
  );

  return map;
}


function assertMarketHeaders_(headerMap) {
  const required = [
    'market_key',
    'date',
    'value',
    'unit',
    'source',
    'fetched_at',
    'quality_status',
    'published_at'
  ];

  const missing =
    required.filter(
      function(header) {
        return (
          headerMap[header] ===
          undefined
        );
      }
    );

  if (missing.length > 0) {
    throw new Error(
      'Лист "Рынки" не содержит обязательные колонки: ' +
      missing.join(', ')
    );
  }
}


function readExistingMarketData_(
  sheet,
  headerMap
) {
  const result = {
    byId: {},
    rows: []
  };

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return result;
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        sheet.getLastColumn()
      )
      .getValues();

  values.forEach(
    function(row) {
      const marketKey =
        String(
          row[
            headerMap.market_key
          ] || ''
        ).trim();

      const date =
        coerceMarketDate_(
          row[
            headerMap.date
          ]
        );

      if (
        !marketKey ||
        !date
      ) {
        return;
      }

      const item = {
        marketKey: marketKey,
        date: date,
        value:
          row[
            headerMap.value
          ]
      };

      const id =
        buildMarketObservationId_(
          marketKey,
          date
        );

      result.byId[id] = item;
      result.rows.push(item);
    }
  );

  return result;
}


function findLatestExistingObservation_(
  existing,
  marketKey
) {
  let latest = null;

  existing.rows.forEach(
    function(item) {
      if (
        item.marketKey !==
        marketKey
      ) {
        return;
      }

      if (
        !latest ||
        item.date.getTime() >
          latest.date.getTime()
      ) {
        latest = item;
      }
    }
  );

  return latest;
}


// ============================================================================
// HTTP / XML
// ============================================================================

function assertHttpSuccess_(
  response,
  sourceName
) {
  const code =
    response.getResponseCode();

  if (
    code < 200 ||
    code >= 300
  ) {
    throw new Error(
      sourceName +
      ' HTTP ' +
      code +
      ': ' +
      response
        .getContentText('UTF-8')
        .substring(0, 300)
    );
  }
}


function collectXmlElementsByName_(
  element,
  name,
  result
) {
  if (
    element.getName() === name
  ) {
    result.push(element);
  }

  element
    .getChildren()
    .forEach(
      function(child) {
        collectXmlElementsByName_(
          child,
          name,
          result
        );
      }
    );
}


function getXmlChildText_(
  element,
  childName
) {
  const children =
    element.getChildren();

  for (
    let i = 0;
    i < children.length;
    i++
  ) {
    if (
      children[i].getName() ===
      childName
    ) {
      return children[i]
        .getText()
        .trim();
    }
  }

  return '';
}


// ============================================================================
// DATE / NUMBER HELPERS
// ============================================================================

function normalizeMarketDate_(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0
  );
}


function addMarketDays_(
  date,
  days
) {
  const result =
    new Date(
      date.getTime()
    );

  result.setDate(
    result.getDate() + days
  );

  return normalizeMarketDate_(
    result
  );
}


function formatMarketDateIso_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


function formatMarketDateCbr_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd/MM/yyyy'
  );
}


function parseIsoMarketDate_(text) {
  const match =
    String(text)
      .match(
        /^(\d{4})-(\d{2})-(\d{2})/
      );

  if (!match) {
    throw new Error(
      'Некорректная ISO date: ' +
      text
    );
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
    0
  );
}


function parseCbrMarketDate_(text) {
  const match =
    String(text)
      .match(
        /^(\d{2})\.(\d{2})\.(\d{4})$/
      );

  if (!match) {
    throw new Error(
      'Некорректная CBR date: ' +
      text
    );
  }

  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    12,
    0,
    0,
    0
  );
}


function coerceMarketDate_(value) {
  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {
    return normalizeMarketDate_(
      value
    );
  }

  const text =
    String(value || '')
      .trim();

  if (!text) {
    return null;
  }

  if (
    /^\d{4}-\d{2}-\d{2}/
      .test(text)
  ) {
    return parseIsoMarketDate_(
      text
    );
  }

  if (
    /^\d{2}\.\d{2}\.\d{4}$/
      .test(text)
  ) {
    return parseCbrMarketDate_(
      text
    );
  }

  return null;
}


function parseMarketNumber_(value) {
  const text =
    String(value || '')
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.');

  if (!text) {
    return NaN;
  }

  return Number(text);
}


function buildMarketObservationId_(
  marketKey,
  date
) {
  return (
    String(marketKey) +
    '|' +
    formatMarketDateIso_(date)
  );
}

/**
 * ============================================================================
 * AUTOMATION
 * ============================================================================
 */


/**
 * Handler ежедневного time-driven trigger.
 *
 * Partial failure отдельного внешнего источника:
 * - не отменяет данные остальных источников;
 * - логируется;
 * - не ломает report pipeline.
 *
 * Conflict существующего market_key + date:
 * - считается data-integrity проблемой;
 * - не перезаписывается;
 * - execution завершается ошибкой для явного сигнала владельцу проекта.
 *
 * @returns {Object}
 */
function runScheduledMarketDataUpdate_() {
  const result =
    updateMarketData_();

  if (
    result.errors &&
    result.errors.length > 0
  ) {
    Logger.log(
      'Market data partial source failure: ' +
      JSON.stringify(
        result.errors
      )
    );
  }

  if (
    result.conflicts &&
    result.conflicts.length > 0
  ) {
    throw new Error(
      'Обнаружены конфликты market observations: ' +
      JSON.stringify(
        result.conflicts
      )
    );
  }

  Logger.log(
    'Scheduled market data update completed. ' +
    'appended=' +
    result.appended +
    ', skipped=' +
    result.skipped +
    ', sourceErrors=' +
    result.errors.length
  );

  return result;
}


/**
 * Устанавливает один ежедневный trigger Market Data.
 *
 * Функция идемпотентна:
 * повторный запуск не создает второй trigger.
 *
 * @returns {Object}
 */
function installMarketDataTrigger() {
  const handler =
    'runScheduledMarketDataUpdate_';

  const triggers =
    ScriptApp
      .getProjectTriggers()
      .filter(
        function(trigger) {
          return (
            trigger.getHandlerFunction() ===
            handler
          );
        }
      );

  // Если trigger уже один — ничего не меняем.
  if (triggers.length === 1) {
    const result = {
      created: false,
      triggerId:
        triggers[0]
          .getUniqueId(),
      timezone:
        Session
          .getScriptTimeZone(),
      hour:
        MARKET_DATA
          .TRIGGER
          .HOUR
    };

    Logger.log(
      'Market data trigger already exists: ' +
      result.triggerId
    );

    showInfo_(
      'Market Data trigger уже установлен.\n\n' +
      'Час запуска: ' +
      result.hour +
      '\n' +
      'Timezone: ' +
      result.timezone
    );

    return result;
  }

  // Defensive cleanup:
  // если по какой-то причине существовало несколько triggers,
  // удаляем их и создаем один canonical trigger.
  triggers.forEach(
    function(trigger) {
      ScriptApp.deleteTrigger(
        trigger
      );
    }
  );

  const timezone =
    Session
      .getScriptTimeZone();

  const trigger =
    ScriptApp
      .newTrigger(handler)
      .timeBased()
      .everyDays(1)
      .atHour(
        MARKET_DATA
          .TRIGGER
          .HOUR
      )
      .inTimezone(
        timezone
      )
      .create();

  const result = {
    created: true,
    triggerId:
      trigger.getUniqueId(),
    timezone: timezone,
    hour:
      MARKET_DATA
        .TRIGGER
        .HOUR
  };

  Logger.log(
    'Market data trigger created: ' +
    result.triggerId
  );

  showInfo_(
    'Market Data trigger установлен.\n\n' +
    'Ежедневный запуск: около ' +
    result.hour +
    ':00\n' +
    'Timezone: ' +
    result.timezone
  );

  return result;
}


/**
 * Удаляет все Market Data triggers.
 *
 * @returns {number}
 */
function removeMarketDataTrigger() {
  const handler =
    'runScheduledMarketDataUpdate_';

  const triggers =
    ScriptApp
      .getProjectTriggers();

  let deleted = 0;

  triggers.forEach(
    function(trigger) {
      if (
        trigger.getHandlerFunction() ===
        handler
      ) {
        ScriptApp.deleteTrigger(
          trigger
        );

        deleted++;
      }
    }
  );

  Logger.log(
    'Market data triggers deleted: ' +
    deleted
  );

  showInfo_(
    'Удалено Market Data triggers: ' +
    deleted
  );

  return deleted;
}

/**
 * Ручной тест scheduled Market Data handler.
 */
function runScheduledMarketDataUpdate() {
  return runScheduledMarketDataUpdate_();
}

/**
 * ============================================================================
 * ROSSTAT HOUSING — CONTROLLED MANUAL IMPORT
 * ============================================================================
 *
 * Quarterly housing benchmarks:
 * - MOSCOW_HOUSING_PRICE_SQM
 * - SPB_HOUSING_PRICE_SQM
 *
 * Source:
 * официальный Росстат.
 *
 * Acquisition:
 * controlled manual input.
 *
 * Причина:
 * официальный Rosstat HTTPS endpoint сейчас недоступен для надежного
 * production ingestion через UrlFetchApp.
 *
 * Этот importer:
 * 1. не участвует в scheduled market update;
 * 2. не создает отдельный trigger;
 * 3. валидирует квартал, publication date и оба значения;
 * 4. импортирует Москву и Санкт-Петербург как одну логическую batch;
 * 5. выполняет preflight conflict check до любой записи;
 * 6. использует общий append-only market writer;
 * 7. сохраняет первый fetched_at;
 * 8. повторный ввод тех же данных является idempotent success.
 * ============================================================================
 */


/**
 * Публичная точка входа controlled manual Rosstat housing import.
 *
 * Запускать вручную из Apps Script UI.
 *
 * Пользователь вводит:
 * - квартал, например 2026-Q2;
 * - дату официальной публикации, например 2026-07-29;
 * - цену Москвы;
 * - цену Санкт-Петербурга.
 *
 * Observation date формируется автоматически как конец квартала.
 *
 * @returns {Object}
 */
function runManualRosstatHousingImport() {
  try {
    const input =
      promptRosstatHousingInput_();

    if (!input) {
      Logger.log(
        'Rosstat Housing manual import cancelled by user.'
      );

      return {
        success: false,
        cancelled: true
      };
    }

    const result =
      importRosstatHousingQuarter_(
        input
      );

    showInfo_(
      'Rosstat Housing import завершен.\n\n' +
      'Квартал: ' +
      result.quarter +
      '\n' +
      'Observation date: ' +
      result.observationDate +
      '\n' +
      'Published at: ' +
      result.publishedAt +
      '\n\n' +
      'Добавлено: ' +
      result.appended +
      '\n' +
      'Уже существовало: ' +
      result.skipped
    );

    return result;

  } catch (error) {
    Logger.log(
      'Rosstat Housing manual import failed: ' +
      error.stack
    );

    showError_(
      'Ошибка Rosstat Housing import:\n' +
      error.message
    );

    throw error;
  }
}


/**
 * Последовательно запрашивает controlled manual input.
 *
 * Никакая запись в Google Sheets на этом этапе не выполняется.
 *
 * @returns {Object|null}
 */
function promptRosstatHousingInput_() {
  const ui =
    SpreadsheetApp.getUi();

  const quarterPrompt =
    ui.prompt(
      'Rosstat Housing — квартал',
      'Введите квартал в формате YYYY-QN.\n' +
      'Пример: 2026-Q2',
      ui.ButtonSet.OK_CANCEL
    );

  if (
    quarterPrompt.getSelectedButton() !==
    ui.Button.OK
  ) {
    return null;
  }

  const quarter =
    quarterPrompt
      .getResponseText()
      .trim();

  const publishedPrompt =
    ui.prompt(
      'Rosstat Housing — дата публикации',
      'Введите фактическую дату официальной публикации Росстата ' +
      'в формате YYYY-MM-DD.\n' +
      'Пример: 2026-07-29',
      ui.ButtonSet.OK_CANCEL
    );

  if (
    publishedPrompt.getSelectedButton() !==
    ui.Button.OK
  ) {
    return null;
  }

  const publishedAt =
    publishedPrompt
      .getResponseText()
      .trim();

  const moscowPrompt =
    ui.prompt(
      'Rosstat Housing — Москва',
      'Введите среднюю цену 1 м² на вторичном рынке ' +
      'для квартир улучшенного качества в Москве.\n' +
      'Единица: RUB_per_m2',
      ui.ButtonSet.OK_CANCEL
    );

  if (
    moscowPrompt.getSelectedButton() !==
    ui.Button.OK
  ) {
    return null;
  }

  const moscowValue =
    moscowPrompt
      .getResponseText()
      .trim();

  const spbPrompt =
    ui.prompt(
      'Rosstat Housing — Санкт-Петербург',
      'Введите среднюю цену 1 м² на вторичном рынке ' +
      'для квартир улучшенного качества в Санкт-Петербурге.\n' +
      'Единица: RUB_per_m2',
      ui.ButtonSet.OK_CANCEL
    );

  if (
    spbPrompt.getSelectedButton() !==
    ui.Button.OK
  ) {
    return null;
  }

  const spbValue =
    spbPrompt
      .getResponseText()
      .trim();

  // Выполняем полную валидацию до confirmation card,
  // чтобы пользователь подтверждал уже нормализованные значения.
  const normalized =
    normalizeRosstatHousingInput_({
      quarter: quarter,
      publishedAt: publishedAt,
      moscowValue: moscowValue,
      spbValue: spbValue
    });

  const confirmation =
    ui.alert(
      'Подтвердите Rosstat Housing import',
      'Источник: официальный Росстат\n\n' +
      'Квартал: ' +
      normalized.quarter +
      '\n' +
      'Observation date: ' +
      formatMarketDateIso_(
        normalized.observationDate
      ) +
      '\n' +
      'Published at: ' +
      formatMarketDateIso_(
        normalized.publishedAt
      ) +
      '\n\n' +
      'Москва: ' +
      normalized.moscowValue +
      ' RUB/m²\n' +
      'Санкт-Петербург: ' +
      normalized.spbValue +
      ' RUB/m²\n\n' +
      'Добавить эти observations в лист "Рынки"?',
      ui.ButtonSet.YES_NO
    );

  if (
    confirmation !==
    ui.Button.YES
  ) {
    return null;
  }

  return normalized;
}


/**
 * Импортирует квартальную пару Rosstat Housing.
 *
 * ВАЖНО:
 * - batch содержит обе географии;
 * - conflict одной observation останавливает весь импорт ДО записи;
 * - same-value duplicate является idempotent skip;
 * - fetched_at назначается один раз общим append writer.
 *
 * @param {Object} input
 * @returns {Object}
 */
function importRosstatHousingQuarter_(
  input
) {
  const normalized =
    normalizeRosstatHousingInput_(
      input
    );

  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Market data update уже выполняется другим процессом.'
    );
  }

  try {
    const sheet =
      getSheet_(
        MARKET_DATA.SHEET_NAME
      );

    assertSheetExists_(
      sheet,
      MARKET_DATA.SHEET_NAME
    );

    const headerMap =
      getMarketHeaderMap_(
        sheet
      );

    assertMarketHeaders_(
      headerMap
    );

    const existing =
      readExistingMarketData_(
        sheet,
        headerMap
      );

    const benchmarks =
      MARKET_DATA
        .ROSSTAT
        .HOUSING_BENCHMARKS;

    const unit =
      MARKET_DATA
        .ROSSTAT
        .HOUSING_UNIT;

    const source =
      MARKET_DATA
        .SOURCES
        .ROSSTAT_HOUSING;

    const observations = [
      {
        marketKey:
          benchmarks
            .MOSCOW
            .marketKey,

        date:
          normalized
            .observationDate,

        value:
          normalized
            .moscowValue,

        unit:
          unit,

        source:
          source,

        qualityStatus:
          MARKET_DATA
            .QUALITY_OK,

        publishedAt:
          normalized
            .publishedAt
      },

      {
        marketKey:
          benchmarks
            .SPB
            .marketKey,

        date:
          normalized
            .observationDate,

        value:
          normalized
            .spbValue,

        unit:
          unit,

        source:
          source,

        qualityStatus:
          MARKET_DATA
            .QUALITY_OK,

        publishedAt:
          normalized
            .publishedAt
      }
    ];

    // Критически важно:
    // проверяем конфликты всей квартальной пары
    // до appendMarketObservations_().
    //
    // Иначе generic append writer мог бы записать одну
    // новую observation и одновременно обнаружить конфликт
    // по второй.
    assertRosstatHousingBatchNoConflicts_(
      existing,
      observations
    );

    const fetchedAt =
      new Date();

    const mergeResult =
      appendMarketObservations_(
        sheet,
        headerMap,
        existing,
        observations,
        fetchedAt
      );

    SpreadsheetApp.flush();

    Logger.log(
      '=== ROSSTAT HOUSING MANUAL IMPORT COMPLETE ==='
    );

    Logger.log(
      'Quarter: ' +
      normalized.quarter
    );

    Logger.log(
      'Observation date: ' +
      formatMarketDateIso_(
        normalized.observationDate
      )
    );

    Logger.log(
      'Published at: ' +
      formatMarketDateIso_(
        normalized.publishedAt
      )
    );

    Logger.log(
      'Appended: ' +
      mergeResult.appended
    );

    Logger.log(
      'Skipped existing: ' +
      mergeResult.skipped
    );

    return {
      success: true,

      quarter:
        normalized.quarter,

      observationDate:
        formatMarketDateIso_(
          normalized.observationDate
        ),

      publishedAt:
        formatMarketDateIso_(
          normalized.publishedAt
        ),

      appended:
        mergeResult.appended,

      skipped:
        mergeResult.skipped,

      conflicts:
        []
    };

  } finally {
    lock.releaseLock();
  }
}


/**
 * Нормализует и валидирует controlled manual input.
 *
 * @param {Object} input
 * @returns {Object}
 */
function normalizeRosstatHousingInput_(
  input
) {
  if (
    !input ||
    typeof input !== 'object'
  ) {
    throw new Error(
      'Rosstat Housing input отсутствует.'
    );
  }

  const quarterInfo =
    parseRosstatHousingQuarter_(
      input.quarter
    );

  const publishedAt =
    parseStrictMarketIsoDate_(
      input.publishedAt,
      'published_at'
    );

  const moscowValue =
    parsePositiveManualMarketValue_(
      input.moscowValue,
      'Москва'
    );

  const spbValue =
    parsePositiveManualMarketValue_(
      input.spbValue,
      'Санкт-Петербург'
    );

  const today =
    normalizeMarketDate_(
      new Date()
    );

  if (
    quarterInfo
      .observationDate
      .getTime() >
    today.getTime()
  ) {
    throw new Error(
      'Нельзя импортировать будущий квартал: ' +
      quarterInfo.quarter
    );
  }

  if (
    publishedAt.getTime() >
    today.getTime()
  ) {
    throw new Error(
      'published_at не может быть в будущем.'
    );
  }

  if (
    publishedAt.getTime() <
    quarterInfo
      .observationDate
      .getTime()
  ) {
    throw new Error(
      'published_at не может быть раньше конца квартала ' +
      quarterInfo.quarter +
      '.'
    );
  }

  return {
    quarter:
      quarterInfo.quarter,

    observationDate:
      quarterInfo
        .observationDate,

    publishedAt:
      publishedAt,

    moscowValue:
      moscowValue,

    spbValue:
      spbValue
  };
}


/**
 * Разбирает квартал YYYY-QN.
 *
 * Допустимые примеры:
 * - 2026-Q2
 * - 2026Q2
 * - 2026 Q2
 *
 * Canonical result:
 * 2026-Q2
 *
 * Observation date:
 * последний календарный день квартала.
 *
 * @param {string} value
 * @returns {Object}
 */
function parseRosstatHousingQuarter_(
  value
) {
  const text =
    String(value || '')
      .trim()
      .toUpperCase();

  const match =
    text.match(
      /^(\d{4})\s*-?\s*Q([1-4])$/
    );

  if (!match) {
    throw new Error(
      'Некорректный квартал. Используйте формат YYYY-QN, например 2026-Q2.'
    );
  }

  const year =
    Number(match[1]);

  const quarter =
    Number(match[2]);

  if (
    year < 2000 ||
    year > 2100
  ) {
    throw new Error(
      'Некорректный год квартала: ' +
      year
    );
  }

  // JavaScript Date:
  // new Date(year, quarter * 3, 0)
  // возвращает последний день нужного квартала.
  const observationDate =
    normalizeMarketDate_(
      new Date(
        year,
        quarter * 3,
        0
      )
    );

  return {
    year: year,
    quarterNumber: quarter,

    quarter:
      String(year) +
      '-Q' +
      String(quarter),

    observationDate:
      observationDate
  };
}


/**
 * Строго разбирает market date.
 *
 * Поддерживает:
 * - Date — если значение уже было нормализовано ранее;
 * - string в формате YYYY-MM-DD.
 *
 * В отличие от обычного Date constructor
 * не допускает rollover вроде 2026-02-31.
 *
 * Функция идемпотентна:
 * повторная нормализация уже валидного Date безопасна.
 *
 * @param {Date|string} value
 * @param {string} fieldName
 * @returns {Date}
 */
function parseStrictMarketIsoDate_(
  value,
  fieldName
) {
  // -------------------------------------------------------------------------
  // Уже нормализованный Date
  // -------------------------------------------------------------------------
  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {
    return normalizeMarketDate_(
      value
    );
  }

  // -------------------------------------------------------------------------
  // Исходная строка YYYY-MM-DD
  // -------------------------------------------------------------------------
  const text =
    String(value || '')
      .trim();

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    throw new Error(
      'Некорректный формат ' +
      fieldName +
      '. Используйте YYYY-MM-DD.'
    );
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      year,
      month - 1,
      day,
      12,
      0,
      0,
      0
    );

  // Проверяем реальную календарную дату.
  // Например, 2026-02-31 должен быть отклонен,
  // а не автоматически превращен JavaScript в март.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !==
      month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(
      'Некорректная календарная дата ' +
      fieldName +
      ': ' +
      text
    );
  }

  return normalizeMarketDate_(
    date
  );
}


/**
 * Разбирает положительное manual market value.
 *
 * Поддерживает:
 * - 250000
 * - 250 000
 * - 250000,5
 *
 * @param {*} value
 * @param {string} label
 * @returns {number}
 */
function parsePositiveManualMarketValue_(
  value,
  label
) {
  const parsed =
    parseMarketNumber_(
      value
    );

  if (
    !isFinite(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      'Некорректное значение для "' +
      label +
      '". Ожидается положительное число.'
    );
  }

  return parsed;
}


/**
 * Выполняет batch-level preflight conflict check.
 *
 * Правило:
 * market_key + date уже существует:
 *
 * - same value -> допустимый idempotent duplicate;
 * - different value -> data-integrity conflict.
 *
 * При любом конфликте исключение выбрасывается ДО записи
 * любой observation из batch.
 *
 * @param {Object} existing
 * @param {Array<Object>} observations
 */
function assertRosstatHousingBatchNoConflicts_(
  existing,
  observations
) {
  const conflicts = [];

  observations.forEach(
    function(observation) {
      const id =
        buildMarketObservationId_(
          observation.marketKey,
          observation.date
        );

      const current =
        existing.byId[id];

      if (!current) {
        return;
      }

      const oldValue =
        Number(
          current.value
        );

      const newValue =
        Number(
          observation.value
        );

      if (
        isFinite(oldValue) &&
        isFinite(newValue) &&
        Math.abs(
          oldValue - newValue
        ) <= 0.000000001
      ) {
        return;
      }

      conflicts.push({
        id: id,
        existingValue:
          current.value,
        incomingValue:
          observation.value
      });
    }
  );

  if (
    conflicts.length > 0
  ) {
    throw new Error(
      'Rosstat Housing import остановлен: ' +
      'обнаружен конфликт существующего market_key + date. ' +
      'Ни одна новая строка не записана.\n\n' +
      JSON.stringify(
        conflicts,
        null,
        2
      )
    );
  }
}
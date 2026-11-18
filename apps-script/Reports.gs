
/**
 * ============================================================================
 * Family Budget Automation
 * Reports.gs
 * ----------------------------------------------------------------------------
 * Создание отчетов, объект Report, генерация AI Report Schema,
 * рендер HTML и сохранение HTML-файла.
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

/**
 * Возвращает следующий report_id.
 *
 * @returns {number}
 */
function getNextReportId_() {
  return 3;
}

// ============================================================================
// РАБОТА С REPORT OBJECT
// ============================================================================

/**
 * Создает HTML-отчет и сохраняет его в Drive.
 *
 * @param {Object} report
 * @returns {Object}
 */
function createAndSaveHtmlReport_(report) {
  validateInternalReportObject_(report);

  const reportSchema = buildAiReportSchemaFromReport_(report);
  const html = renderReportHtml(reportSchema);
  const file = saveHtmlReportToDrive_(html, report.id);

  logHtmlReportSave_(file);

  return {
    html: html,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName()
  };
}

/**
 * Преобразует технический объект Report в AI Report Schema.
 *
 * @param {Object} report
 * @returns {Object}
 */
function buildAiReportSchemaFromReport_(report) {
  validateInternalReportObject_(report);

  return {
    Metadata: buildReportMetadata_(report),
    'Executive Dashboard': buildExecutiveDashboard_(report),
    Watchlist: buildWatchlist_(report),
    'Top Insights': buildTopInsights_(report),
    'Family Overview': buildFamilyOverview_(report),
    'Family Financial Position': buildFamilyFinancialPosition_(report),
    'Person Analysis': buildPersonAnalysis_(report),
    Recommendations: buildRecommendations_(report),
    Summary: buildSummary_(report)
  };
}

/**
 * Проверяет технический объект Report.
 *
 * @param {Object} report
 */
function validateInternalReportObject_(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('Invalid report object');
  }

  if (report.id === undefined || report.id === null) {
    throw new Error('Report id is missing');
  }
}

// ============================================================================
// ПОСТРОЕНИЕ РАЗДЕЛОВ AI REPORT SCHEMA
// ============================================================================

/**
 * Создает Metadata для AI Report Schema.
 *
 * @param {Object} report
 * @returns {Object}
 */
function buildReportMetadata_(report) {
  return {
    reportVersion: 'v1.0',
    reportPeriod: getCurrentReportPeriod_(),
    generationDate: getCurrentReportDate_(),
    currency: getProjectCurrency_(),
    language: getProjectLanguage_(),
    analysisVersion: 'v0.1'
  };
}

/**
 * Создает раздел Executive Dashboard.
 *
 * @param {Object} report
 * @returns {Array<Object>}
 */
function buildExecutiveDashboard_(report) {
  return buildMetricSectionFromReportValues_(report, [
    { title: 'Net Worth', value: 0, unit: getProjectCurrency_() },
    { title: 'Liquid Assets', value: 0, unit: getProjectCurrency_() },
    { title: 'Weekly Change', value: 0, unit: getProjectCurrency_() },
    { title: 'Net Debt', value: 0, unit: getProjectCurrency_() }
  ]);
}

/**
 * Создает раздел Watchlist.
 *
 * @param {Object} report
 * @returns {Array<Object>}
 */
function buildWatchlist_(report) {
  return buildMetricSectionFromReportValues_(report, [
    { title: 'Unexplained capital change', value: 0, unit: getProjectCurrency_() },
    { title: 'Idle cash', value: 0, unit: getProjectCurrency_() },
    { title: 'Missed interest income', value: 0, unit: getProjectCurrency_() }
  ]);
}

/**
 * Создает раздел Top Insights.
 *
 * @param {Object} report
 * @returns {Array<Object>}
 */
function buildTopInsights_(report) {
  return [
    {
      title: 'Report created successfully',
      description: 'The report block was copied and converted into the HTML rendering schema.',
      category: 'System',
      priority: 'High',
      impact: 'Positive'
    }
  ];
}

/**
 * Создает раздел Family Overview.
 *
 * @param {Object} report
 * @returns {Array<Object>}
 */
function buildFamilyOverview_(report) {
  return [
    {
      headline: 'Financial overview is ready for rendering.',
      details: 'This section is a placeholder until the analytical pipeline populates real values.'
    }
  ];
}

/**
 * Создает раздел Family Financial Position.
 *
 * @param {Object} report
 * @returns {Array<Object>}
 */
function buildFamilyFinancialPosition_(report) {
  return buildMetricSectionFromReportValues_(report, [
    { title: 'Net Worth', value: 0, unit: getProjectCurrency_() },
    { title: 'Net Debt', value: 0, unit: getProjectCurrency_() },
    { title: 'Real Estate', value: 0, unit: getProjectCurrency_() },
    { title: 'Investments', value: 0, unit: getProjectCurrency_() }
  ]);
}

/**
 * Создает раздел Person Analysis.
 *
 * @param {Object} report
 * @returns {Array<Object>}
 */
function buildPersonAnalysis_(report) {
  return [
    {
      name: 'Person 1',
      Summary: 'Placeholder analysis section.',
      Capital: [],
      Structure: [],
      Changes: [],
      Strengths: ['Schema-ready structure'],
      Weaknesses: ['Real analytical data not connected yet'],
      Risks: ['No LLM integration yet'],
      Opportunities: ['Connect real AI analysis later'],
      Assessment: 'Neutral'
    }
  ];
}

/**
 * Создает раздел Recommendations.
 *
 * @param {Object} report
 * @returns {Array<Object>}
 */
function buildRecommendations_(report) {
  return [
    {
      title: 'Connect real schema data',
      description: 'Replace placeholder values with data from the analytical pipeline.',
      priority: 'Medium',
      expectedEffect: 'Full report automation',
      difficulty: 'Medium'
    }
  ];
}

/**
 * Создает раздел Summary.
 *
 * @param {Object} report
 * @returns {Object}
 */
function buildSummary_(report) {
  return {
    text: 'HTML report schema generated successfully from the technical report object.'
  };
}

/**
 * Общий генератор Metric-разделов.
 *
 * @param {Object} report
 * @param {Array<Object>} templateMetrics
 * @returns {Array<Object>}
 */
function buildMetricSectionFromReportValues_(report, templateMetrics) {
  return templateMetrics.map(function(metric, index) {
    return {
      id: String(report.id) + '-' + String(index + 1),
      title: metric.title,
      value: metric.value,
      unit: metric.unit,
      change: 0,
      changePercent: 0,
      trend: 'neutral',
      status: 'placeholder',
      importance: 'medium',
      description: 'Placeholder metric generated from the current report block.',
      comment: 'Will be replaced by analytical data in the next pipeline stage.'
    };
  });
}

// ============================================================================
// СОХРАНЕНИЕ HTML
// ============================================================================

/**
 * Сохраняет HTML в AI Workspace.
 * 
 * @param {string} html
 * @param {number|string} reportId
 * @param {string} variant - 'ai' или 'final'
 * @returns {GoogleAppsScript.Drive.File}
 */
function saveHtmlReportToDrive_(html, reportId, variant) {
  const fileName = buildHtmlReportFileName_(reportId, variant);
  
  // Сохраняем в AI Workspace через DriveManager
  const file = saveFileToWorkspace_(fileName, html, MimeType.HTML);
  
  logHtmlReportSave_(file);
  return file;
}

/**
 * Формирует имя HTML-файла отчета.
 * 
 * В AI Workspace всегда используется фиксированное имя PROJECT_FILES.HTML_REPORT,
 * чтобы файл перезаписывался при каждом отчете.
 * 
 * @param {number|string} reportId - не используется, но оставлен для совместимости
 * @param {string} variant - не используется, но оставлен для совместимости
 * @returns {string}
 */
function buildHtmlReportFileName_(reportId, variant) {
  // Всегда возвращаем фиксированное имя для AI Workspace
  return PROJECT_FILES.HTML_REPORT;
}

/**
 * Логирует результат сохранения HTML-файла.
 *
 * @param {GoogleAppsScript.Drive.File} file
 */
function logHtmlReportSave_(file) {
  if (typeof ENABLE_HTML_REPORT_LOG !== 'undefined' && ENABLE_HTML_REPORT_LOG) {
    Logger.log('HTML report saved: ' + file.getName());
    Logger.log('File ID: ' + file.getId());
    Logger.log('File URL: ' + file.getUrl());
  }
}

// ============================================================================
// АРХИВИРОВАНИЕ
// ============================================================================

/**
 * Архивирует полный комплект файлов отчета.
 * Вызывается только после успешного завершения всего конвейера.
 * 
 * @param {Object} report - объект отчета {id, createdAt, period}
 * @param {Object} files - объект с содержимым файлов
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function archiveCompletedReport_(report, files) {
  const reportDate = new Date(report.createdAt);
  
  const folder = archiveReport_(report.id, reportDate, files);
  
  Logger.log('Report archived: ' + folder.getUrl());
  return folder;
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
 * Возвращает валюту проекта.
 *
 * @returns {string}
 */
function getProjectCurrency_() {
  return 'EUR';
}

/**
 * Возвращает язык проекта.
 *
 * @returns {string}
 */
function getProjectLanguage_() {
  return 'en';
}

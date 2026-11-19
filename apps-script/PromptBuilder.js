/**
 * ============================================================================
 * Family Budget Automation
 * PromptBuilder.gs
 * ----------------------------------------------------------------------------
 * Формирование AI Job Package для внешних LLM.
 *
 * Единственная ответственность модуля — построение текстового AI Job Package.
 * ============================================================================
 */

const PromptBuilder = Object.freeze({

  VERSION: '1.1',

  MODES: Object.freeze({

    SCHEMA: 'SCHEMA',

    HTML: 'HTML'

  }),

  DEFAULT_MODE: 'HTML'

});


/**
 * ============================================================================
 * Формирует полный AI Job Package.
 * ============================================================================
 */
/**
 * ============================================================================
 * Формирует полный AI Job Package.
 * ============================================================================
 */
function buildAIJobPackage_(sourceSheet, report) {

  const dataset = buildDatasetText_(
    sourceSheet,
    report
  );

  const mode = AI_PIPELINE_MODE;

  const sections = [

    buildPackageHeader_(),

    buildInstructionsSection_(mode)

  ];

  if (mode === PromptBuilder.MODES.SCHEMA) {

    sections.push(
      buildOutputSchemaSection_()
    );

  }

  sections.push(

    buildDatasetSection_(dataset)

  );

  return sections.join('\n\n');

}


/**
 * ============================================================================
 * Заголовок AI Job Package.
 * ============================================================================
 */
function buildPackageHeader_() {

  return [
    '==================================================',
    'FAMILY BUDGET AUTOMATION',
    'AI JOB PACKAGE',
    '=================================================='
  ].join('\n');

}


/**
 * ============================================================================
 * Блок инструкций.
 * ============================================================================
 */
/**
 * ============================================================================
 * Блок инструкций.
 * ============================================================================
 */
function buildInstructionsSection_(mode) {

  const prompt = mode === PromptBuilder.MODES.HTML
    ? PromptTemplates.REPORT_HTML
    : PromptTemplates.REPORT;

  return [

    '# SYSTEM INSTRUCTIONS',

    '',

    prompt.trim()

  ].join('\n');

}


/**
 * ============================================================================
 * Блок OUTPUT_SCHEMA.
 * ============================================================================
 */
function buildOutputSchemaSection_() {

  return [
    '# OUTPUT SCHEMA',
    '',
    PromptTemplates.OUTPUT_SCHEMA.trim()
  ].join('\n');

}


/**
 * ============================================================================
 * Блок DATASET.
 * ============================================================================
 */
function buildDatasetSection_(dataset) {

  return [
    '# DATASET',
    '',
    dataset
  ].join('\n');

}


/**
 * ============================================================================
 * Преобразует данные Google Sheets в текстовый TSV.
 * ============================================================================
 */
function buildDatasetText_(
  sourceSheet,
  report
) {

  const lastColumn = getLastColumn_(sourceSheet);

  const headers = sourceSheet
    .getRange(
      1,
      1,
      1,
      lastColumn
    )
    .getValues()[0];

  const rows = [
    headers,
    ...report.rows
  ];

  return rows
    .map(formatDatasetRow_)
    .join('\n');

}


/**
 * ============================================================================
 * Преобразует строку таблицы в TSV.
 * ============================================================================
 */
function formatDatasetRow_(row) {

  return row
    .map(formatDatasetValue_)
    .join('\t');

}


/**
 * ============================================================================
 * Преобразует значение ячейки в текст.
 * ============================================================================
 */
function formatDatasetValue_(value) {

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();

}


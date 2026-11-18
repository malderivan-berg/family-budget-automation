/**
 * ============================================================================
 * Family Budget Automation
 * Menu.gs
 * ----------------------------------------------------------------------------
 * Создание пользовательского меню Google Sheets.
 * ============================================================================
 */

/**
 * Создает пользовательское меню.
 */
function createMenu_() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAME)
    .addItem(MENU_CREATE_REPORT, 'runCreateReport')
    .addSeparator()
    .addItem(MENU_EXPORT, 'runExportReport')
    .addItem('Импорт AI отчета', 'runImportAIReport')
    .addSeparator()
    .addItem('Запустить Pipeline', 'runFullPipeline')
    .addItem('Статус Pipeline', 'showPipelineStatus')
    .addSeparator()
    .addItem(REPORT_AGENT.MENU.RUN, 'runReportAgentPipeline')
    .addItem(REPORT_AGENT.MENU.STATUS, 'showReportAgentStatus')
    .addItem(REPORT_AGENT.MENU.RETRY, 'retryReportAgent')
    .addItem(REPORT_AGENT.MENU.SETUP, 'checkReportAgentSetup')
    .addToUi();
}

/**
 * Показывает статус последнего pipeline.
 */
function showPipelineStatus() {
  const info = getPipelineInfo();
  
  if (!info) {
    showInfo_('Нет активного pipeline.');
    return;
  }
  
  let message = 'Report ID: ' + info.reportId + '\n';
  message += 'Статус: ' + info.status + '\n';
  message += 'Время: ' + info.elapsed.toFixed(1) + ' мин\n';
  
  if (info.error) {
    message += '\nОшибка: ' + info.error + '\n';
  }
  
  if (info.archiveFolderUrl) {
    message += '\nАрхив: ' + info.archiveFolderUrl;
  }
  
  showInfo_(message);
}
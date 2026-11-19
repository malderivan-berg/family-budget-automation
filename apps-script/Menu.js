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
    .addItem(REPORT_AGENT.MENU.RUN, 'runReportAgentPipeline')
    .addItem(REPORT_AGENT.MENU.STATUS, 'showReportAgentStatus')
    .addSeparator()
    .addItem(REPORT_AGENT.MENU.RESEND, 'resendLastReport')
    .addItem(REPORT_AGENT.MENU.RETRY, 'retryReportAgent')
    .addSeparator()
    .addItem(REPORT_AGENT.MENU.SETUP, 'checkReportAgentSetup')
    .addToUi();
}

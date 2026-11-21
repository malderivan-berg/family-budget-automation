/**
 * ============================================================================
 * Family Budget Automation
 * Main.gs
 * ----------------------------------------------------------------------------
 * Главная точка входа проекта.
 * Содержит только публичные функции.
 * Не содержит бизнес-логики.
 * ============================================================================
 */


/**
 * Вызывается автоматически при открытии таблицы.
 */
function onOpen() {
  createMenu_();
}


// ============================================================================
// РЫНОЧНЫЕ ДАННЫЕ (Stage 3.5) — логика в MarketDataManager.gs
// ============================================================================

/**
 * Команда:
 * обновить raw market data.
 */
function runUpdateMarketData() {
  try {
    const result =
      updateMarketData_();

    let message =
      'Market data update завершен.\n\n' +
      'Получено observations: ' +
      result.fetched +
      '\n' +
      'Добавлено новых строк: ' +
      result.appended +
      '\n' +
      'Уже существовали: ' +
      result.skipped +
      '\n' +
      'Конфликтов: ' +
      result.conflicts.length +
      '\n' +
      'Ошибок источников: ' +
      result.errors.length;

    if (
      result.errors.length > 0
    ) {
      message +=
        '\n\n' +
        result.errors
          .map(function(item) {
            return (
              item.source +
              ': ' +
              item.error
            );
          })
          .join('\n');
    }

    showInfo_(message);

    return result;

  } catch (error) {
    showError_(
      'Ошибка Market Data: ' +
      error.message
    );

    throw error;
  }
}

// ============================================================================
// ОТЧЁТНЫЙ КОНВЕЙЕР — публичные точки входа
// Логика — в ReportAgentManager.gs
// ============================================================================

/**
 * Команда меню: создать отчёт и передать его агенту.
 */
function runReportAgentPipeline() {
  try {
    const state = runReportAgentPipeline_();
    showInfo_(
      'Отчёт №' + state.reportId + ' передан агенту.\n\n' +
      'Отчёт придёт в Telegram обычно через 5–15 минут. ' +
      'Если через ' + REPORT_AGENT.DELIVERY_CHECK_MINUTES +
      ' минут его не будет, придёт предупреждение.\n\n' +
      'Сессия агента: ' + state.sessionUrl
    );
  } catch (error) {
    Logger.log('runReportAgentPipeline: ' + error.message);
    showError_(error.message);
  }
}

/**
 * Команда меню: повторно запустить агента для последнего отчёта.
 */
function retryReportAgent() {
  try {
    const state = retryReportAgent_();
    showInfo_(
      'Агент перезапущен для отчёта №' + state.reportId + '.\n\n' +
      'Сессия агента: ' + state.sessionUrl
    );
  } catch (error) {
    Logger.log('retryReportAgent: ' + error.message);
    showError_(error.message);
  }
}

/**
 * Команда меню: повторно отправить последний отчёт в Telegram без запуска
 * агента. Nodul отправляет тот же report_N.html тем же получателям.
 */
function resendLastReport() {
  try {
    const state = resendLastReport_();
    showInfo_(
      'Отчёт №' + state.reportId + ' отправлен повторно.\n\n' +
      'Если через ' + REPORT_AGENT.DELIVERY_CHECK_MINUTES +
      ' минут он не будет доставлен, придёт предупреждение.'
    );
  } catch (error) {
    Logger.log('resendLastReport: ' + error.message);
    showError_(error.message);
  }
}

/**
 * Команда меню: статус последнего отчёта.
 */
function showReportAgentStatus() {
  showInfo_(buildReportAgentStatusText_());
}

/**
 * Команда меню: проверка настройки агента. Значения секретов не выводятся.
 */
function checkReportAgentSetup() {
  const problems = getReportAgentSetupProblems_();
  const mode = REPORT_AGENT.TEST_MODE
    ? 'тестовый: отчёт получает только ' + REPORT_AGENT.ALERT_USER_NAME
    : 'рабочий: отчёт получают все пользователи';
  if (problems.length) {
    showError_('Настройка не завершена:\n• ' + problems.join('\n• ') + '\n\nРежим: ' + mode);
  } else {
    showInfo_('Настройка в порядке.\n\nРежим: ' + mode);
  }
}

/**
 * Триггер: отложенная проверка доставки отчёта.
 * Имя без «_» — иначе Apps Script не вызовет функцию по триггеру.
 */
function checkReportDelivered() {
  checkReportDelivered_();
}

/**
 * ТЕСТ (запуск из редактора): отправить тестовое предупреждение в Telegram.
 * Проверяет TELEGRAM_BOT_TOKEN и доступ Apps Script к Bot API. Данные не меняет.
 */
function runTestTelegramAlert() {
  const ok = sendTelegramAlert_(
    'Тестовое сообщение: Apps Script может отправлять предупреждения напрямую. ' +
    'Ничего делать не нужно.'
  );
  reportTestResult_(ok
    ? 'Тестовое сообщение отправлено — проверьте Telegram.'
    : 'Сообщение не отправлено. Причина — в строке журнала выше.');
}

/**
 * ТЕСТ (запуск из редактора): выгрузка report_data для последнего
 * существующего отчёта БЕЗ создания нового отчёта и БЕЗ запуска агента.
 * Сохраняет AI Workspace/report_data_test.json (перезаписывается).
 */
function runTestReportDataExport() {
  try {
    const sheet = getSheet_(SOURCE_SHEET_NAME);
    const reportId = getLastReportBlock_(sheet).reportId;
    const data = buildReportData_(reportId);
    const file = saveFileWithOverwrite_(
      getAIWorkspaceFolder_(),
      'report_data_test.json',
      JSON.stringify(data, null, 1),
      'application/json'
    );
    reportTestResult_(
      'Тестовая выгрузка готова.\n\n' +
      'report_id = ' + data.report_id + '\n' +
      'Период: ' + data.period_start + ' — ' + data.period_end +
      ' (' + data.duration_days + ' дн.)\n' +
      'Строк: ' + Object.keys(data.tables).map(function(key) {
        return key + ' ' + data.tables[key].rows.length;
      }).join(', ') + '\n' +
      'Получатели: ' + data.delivery.users.length + '\n\n' +
      'Файл: ' + file.getUrl()
    );
  } catch (error) {
    reportTestResult_('Ошибка выгрузки: ' + error.message);
  }
}

/**
 * ТЕСТ (запуск из редактора): сквозной пилот v1.0 на последнем существующем
 * отчёте БЕЗ создания нового блока в «Расчеты».
 * Выгрузка → агент → Nodul → Telegram (только ALERT_USER_NAME) → проверка
 * доставки через REPORT_AGENT.DELIVERY_CHECK_MINUTES минут.
 */
function runTestReportAgentPilot() {
  try {
    const state = runReportAgentPilot_();
    reportTestResult_(
      'Пилот запущен для отчёта №' + state.reportId + '.\n' +
      'Папка: ' + state.folderUrl + '\n' +
      'Сессия агента: ' + state.sessionUrl + '\n' +
      'Проверка доставки — через ' + REPORT_AGENT.DELIVERY_CHECK_MINUTES + ' мин.'
    );
  } catch (error) {
    reportTestResult_('Пилот не запущен: ' + error.message);
  }
}

/**
 * Обслуживание (запуск из редактора): достроить «История», «Сверка капитала»,
 * «Исполнение плана», «Рыночный контекст» до последнего отчёта «Расчетов».
 * Безопасно запускать повторно.
 */
function runSyncReportSheets() {
  try {
    const added = syncReportSheets_();
    reportTestResult_('Листы отчёта синхронизированы. Добавлено строк: ' + JSON.stringify(added));
  } catch (error) {
    reportTestResult_('Синхронизация не выполнена: ' + error.message);
  }
}

/**
 * Итог тестовой функции — в журнал выполнения редактора и всплывающей
 * подсказкой в таблице. Не блокирует выполнение: диалог showInfo_ при
 * запуске из редактора ждёт «ОК» во вкладке таблицы, и запуск «висит».
 *
 * @param {string} message
 */
function reportTestResult_(message) {
  Logger.log(message);
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, PROJECT_NAME + ' — тест', 15);
  } catch (error) {
    // Нет открытой таблицы — достаточно журнала
  }
}

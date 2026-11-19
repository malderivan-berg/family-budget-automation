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


/**
 * Команда меню:
 * Экспорт отчета.
 */
function runExportReport() {
  askReportId_();
}


/**
 * Команда меню:
 * Создать новый отчет.
 */
function runCreateReport() {
  try {
    const report = createNewReport_();

    showInfo_(
      'Новый отчет успешно создан.\n\n' +
      'report_id = ' + report.id
    );
  } catch (error) {
    showError_(error.message);
    throw error;
  }
}



/**
 * Legacy public entry point.
 *
 * В текущей стабильной версии v0.9 основной автоматический
 * отчетный конвейер реализован через runFullPipeline().
 *
 * Current pipeline:
 *
 * Google Sheets
 * → AI Job Package
 * → Nodul
 * → LLM
 * → AI_Report.html
 * → Apps Script
 * → Telegram
 *
 * Функция сохранена для обратной совместимости и не является
 * основной точкой запуска pipeline.
 */
function runPipeline() {
  showInfo_('Pipeline будет реализован в следующих версиях проекта.');
}

/**
 * Создает новый отчет, генерирует HTML и сохраняет его в Drive.
 */
function runCreateReportHtml() {
  try {
    const report = createNewReport_();
    const result = createAndSaveHtmlReport_(report);

    showInfo_(
      'HTML-отчет успешно создан и сохранен.\n\n' +
      'report_id = ' + report.id + '\n' +
      'file = ' + result.fileName + '\n' +
      'url = ' + result.fileUrl
    );

    return result;
  } catch (error) {
    showError_(error.message);
    throw error;
  }
}

/**
 * Выполняет импорт AI отчета.
 * Используется для ручного импорта без создания нового отчета.
 */
function runImportAIReport() {
  try {
    const response = loadLatestAIReport_();
    let html;
    
    switch (AI_PIPELINE_MODE) {
      case 'HTML':
        html = extractHtmlFromResponse_(response);
        break;
      case 'SCHEMA':
        html = renderReportHtmlFromNodulResponse(response);
        break;
      default:
        throw new Error(
          'Неизвестный режим AI_PIPELINE_MODE: ' +
          AI_PIPELINE_MODE
        );
    }
    
    // Сохраняем в AI Workspace с идентификатором 'manual'
    const file = saveHtmlReportToDrive_(html, 'manual', 'ai');
    Logger.log('HTML saved: ' + file.getUrl());
    
    showInfo_('AI отчет импортирован.\n' + file.getUrl());
  } catch (error) {
    showError_(error.message);
  }
}

/**
 * ============================================================================
 * Полный цикл формирования аналитического отчета с асинхронным ожиданием AI.
 * 
 * Фаза 1 (синхронная):
 * 1. Создать новый report_id
 * 2. Экспортировать dataset.xlsx в AI Workspace
 * 3. Сформировать AI Job Package в AI Workspace/Job
 * 4. Удалить старый AI_Report.html из AI Workspace
 * 5. Сохранить состояние pipeline
 * 6. Создать time-driven триггер
 * 7. Показать уведомление пользователю
 * 
 * Фаза 2 (асинхронная, выполняется триггером):
 * 8. Проверять наличие AI_Report.html каждые 1 минуту
 * 9. Когда файл появится — импортировать, сохранить, архивировать
 * 10. Удалить триггер
 * ============================================================================
 */
function runFullPipeline() {
  try {
    // ========================================================================
    // ФАЗА 1: Подготовка задания (синхронно)
    // ========================================================================
    
    // 1. Создать новый отчет
    const report = createNewReport_();
    Logger.log('Report created: ' + report.id);
    
    // 2. Экспортировать dataset и AI Job Package
    const exportResult = exportReport_(report.id);
    Logger.log('Export completed');
    
    // 3. Удалить старый AI_Report.html из AI Workspace
    const deleted = deleteFileFromWorkspace_(PROJECT_FILES.AI_REPORT_HTML);
    Logger.log('Old AI Report deleted: ' + deleted);
    
    // 4. Сохранить состояние pipeline
    const state = {
      reportId: report.id,
      status: PIPELINE.STATUS_PENDING,
      startTime: new Date().getTime(),
      createdAt: report.createdAt,
      period: report.period,
      excelSpreadsheetId: exportResult.dataset.fileId
    };
    savePipelineState_(state);
    
    // 5. Создать триггер для проверки
    const triggerId = createPipelineTrigger_();
    state.triggerId = triggerId;
    savePipelineState_(state);
    
    // 6. Уведомить пользователя
    showInfo_(
      'Задание отправлено в AI.\n\n' +
      'Report ID: ' + report.id + '\n\n' +
      'Ожидание ответа (~6-8 минут).\n' +
      'Система автоматически завершит pipeline.\n\n' +
      'Таймаут: ' + PIPELINE.TIMEOUT_MINUTES + ' минут'
    );
    
    return {
      reportId: report.id,
      status: 'pending',
      message: 'Pipeline started. Waiting for AI response.'
    };
    
  } catch (error) {
    showError_(error.message);
    throw error;
  }
}

// ============================================================================
// ОТЧЁТНЫЙ КОНВЕЙЕР v1.0 — публичные точки входа
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
 * Команда меню: статус последнего отчёта v1.0.
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
      'Строк: ' + data.rows.length + '\n' +
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

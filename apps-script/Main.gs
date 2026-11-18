
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


/**
 * ============================================================================
 * Family Budget Automation
 * PipelineManager.gs
 * ----------------------------------------------------------------------------
 * Управление асинхронным pipeline.
 * 
 * Ответственность:
 *   • управление состоянием pipeline;
 *   • создание и удаление time-driven триггеров;
 *   • проверка готовности AI Report;
 *   • завершение pipeline;
 *   • логирование ошибок.
 * ============================================================================
 */

// ============================================================================
// УПРАВЛЕНИЕ СОСТОЯНИЕМ PIPELINE
// ============================================================================

/**
 * Сохраняет состояние pipeline в PropertiesService.
 * 
 * @param {Object} state - состояние pipeline
 */
function savePipelineState_(state) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('pipeline_state', JSON.stringify(state));
}

/**
 * Получает состояние pipeline из PropertiesService.
 * 
 * @returns {Object|null}
 */
function getPipelineState_() {
  const props = PropertiesService.getScriptProperties();
  const stateJson = props.getProperty('pipeline_state');
  
  if (!stateJson) {
    return null;
  }
  
  try {
    return JSON.parse(stateJson);
  } catch (error) {
    Logger.log('Error parsing pipeline state: ' + error.message);
    return null;
  }
}

/**
 * Очищает состояние pipeline.
 */
function clearPipelineState_() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('pipeline_state');
}

// ============================================================================
// УПРАВЛЕНИЕ ТРИГГЕРАМИ
// ============================================================================

/**
 * Создает time-driven триггер для проверки pipeline.
 * 
 * @returns {string} ID триггера
 */
function createPipelineTrigger_() {
  // Удаляем существующие триггеры для этой функции
  deletePipelineTriggers_();
  
  // Создаем новый триггер
  const trigger = ScriptApp.newTrigger('checkAndCompletePipeline_')
    .timeBased()
    .everyMinutes(PIPELINE.POLL_INTERVAL_MINUTES)
    .create();
  
  Logger.log('Pipeline trigger created: ' + trigger.getUniqueId());
  return trigger.getUniqueId();
}

/**
 * Удаляет все триггеры для функции checkAndCompletePipeline_.
 */
function deletePipelineTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkAndCompletePipeline_') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('Pipeline trigger deleted: ' + trigger.getUniqueId());
    }
  });
}

/**
 * Удаляет конкретный триггер по ID.
 * 
 * @param {string} triggerId
 */
function deletePipelineTriggerById_(triggerId) {
  const triggers = ScriptApp.getProjectTriggers();
  
  triggers.forEach(function(trigger) {
    if (trigger.getUniqueId() === triggerId) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('Pipeline trigger deleted: ' + triggerId);
    }
  });
}

// ============================================================================
// ПРОВЕРКА ГОТОВНОСТИ AI REPORT
// ============================================================================

/**
 * Проверяет, готов ли AI Report.
 * 
 * @returns {boolean}
 */
function isAIReportReady_() {
  const folder = getAIWorkspaceFolder_();
  const fileName = PROJECT_FILES.AI_REPORT_HTML;
  const files = folder.getFilesByName(fileName);
  
  return files.hasNext();
}

// ============================================================================
// ОСНОВНАЯ ЛОГИКА ПРОВЕРКИ
// ============================================================================

/**
 * Проверяет готовность pipeline и завершает его.
 * Вызывается time-driven триггером.
 */
function checkAndCompletePipeline_() {
  Logger.log('=== Pipeline Check Started ===');
  
  const state = getPipelineState_();
  
  if (!state) {
    Logger.log('No pipeline state found. Exiting.');
    return;
  }
  
  if (state.status !== PIPELINE.STATUS_PENDING) {
    Logger.log('Pipeline is not in pending state: ' + state.status);
    return;
  }
  
  // Проверка таймаута
  const elapsed = (new Date().getTime() - state.startTime) / 1000 / 60;
  Logger.log('Elapsed time: ' + elapsed.toFixed(1) + ' minutes');
  
  if (elapsed > PIPELINE.TIMEOUT_MINUTES) {
    handleTimeout_(state);
    return;
  }
  
  // Проверка готовности AI Report
  if (!isAIReportReady_()) {
    Logger.log('AI Report not ready yet. Waiting...');
    return;
  }
  
  Logger.log('AI Report is ready. Completing pipeline...');
  
  // Завершение pipeline
  try {
    completePipeline_(state);
    
    // Проверяем статус отправки в Telegram (НОВОЕ!)
    const telegramStatus = checkTelegramSendStatus_(state);
    if (telegramStatus) {
      Logger.log('Telegram send status: ' + telegramStatus.status);
    }
    
  } catch (error) {
    handleFailure_(state, error);
  }
}

// ============================================================================
// ЗАВЕРШЕНИЕ PIPELINE
// ============================================================================

/**
 * Завершает pipeline: импорт, сохранение, архивирование, отправка в Telegram.
 * 
 * @param {Object} state - состояние pipeline
 */
function completePipeline_(state) {
  try {
    const reportId = state.reportId;
    
    // 1. Импортировать AI Report
    const response = loadLatestAIReport_();
    Logger.log('AI Report loaded');
    
    // 2. Извлечь HTML
    let html;
    switch (AI_PIPELINE_MODE) {
      case 'HTML':
        html = extractHtmlFromResponse_(response);
        break;
      case 'SCHEMA':
        html = renderReportHtmlFromNodulResponse(response);
        break;
      default:
        throw new Error('Неизвестный режим AI_PIPELINE_MODE: ' + AI_PIPELINE_MODE);
    }
    Logger.log('HTML extracted');
    
    // 3. Сохранить HTML-отчет
    const htmlFile = saveHtmlReportToDrive_(html, reportId, 'final');
    Logger.log('HTML saved: ' + htmlFile.getUrl());
    
    // 4. Архивировать полный комплект
    const filesToArchive = {
      excelSpreadsheetId: state.excelSpreadsheetId,
      aiJobPackageContent: readAIJobPackage_(),
      aiReportContent: response,
      htmlReportContent: html
    };
    
    const report = {
      id: reportId,
      createdAt: state.createdAt,
      period: state.period
    };
    
    const archiveFolder = archiveCompletedReport_(report, filesToArchive);
    Logger.log('Report archived: ' + archiveFolder.getUrl());
    
    // 5. Отправить отчет в Telegram (НОВОЕ!)
    const telegramResult = initiateTelegramSend_(state, htmlFile.getId());
    Logger.log('Telegram send initiated: ' + telegramResult.success);
    
    // 6. Обновить состояние
    state.status = PIPELINE.STATUS_COMPLETED;
    state.completedAt = new Date().getTime();
    state.archiveFolderUrl = archiveFolder.getUrl();
    savePipelineState_(state);
    
    // 7. Удалить триггер
    if (state.triggerId) {
      deletePipelineTriggerById_(state.triggerId);
    }
    
    // 8. Уведомить пользователя
    let notificationMessage = 
      'Pipeline завершен успешно!\n\n' +
      'Report ID: ' + reportId + '\n' +
      'Время выполнения: ' + ((state.completedAt - state.startTime) / 1000 / 60).toFixed(1) + ' мин\n\n' +
      'Архив: ' + archiveFolder.getUrl();
    
    if (telegramResult.success) {
      notificationMessage += '\n\n📱 Отчет отправляется в Telegram...';
    } else {
      notificationMessage += '\n\n⚠️ Telegram: ' + (telegramResult.message || 'Не удалось создать запрос');
    }
    
    showInfo_(notificationMessage);
    
    Logger.log('=== Pipeline Completed Successfully ===');
    
  } catch (error) {
    handleFailure_(state, error);
    throw error;
  }
}

// ============================================================================
// ОБРАБОТКА ОШИБОК
// ============================================================================

/**
 * Обрабатывает таймаут pipeline.
 * 
 * @param {Object} state
 */
function handleTimeout_(state) {
  Logger.log('Pipeline timeout after ' + PIPELINE.TIMEOUT_MINUTES + ' minutes');
  
  state.status = PIPELINE.STATUS_TIMEOUT;
  state.error = 'Timeout: AI Report не появился в течение ' + PIPELINE.TIMEOUT_MINUTES + ' минут';
  state.failedAt = new Date().getTime();
  savePipelineState_(state);
  
  // Удалить триггер
  if (state.triggerId) {
    deletePipelineTriggerById_(state.triggerId);
  }
  
  // Уведомить пользователя
  showError_(
    'Pipeline завершился по таймауту.\n\n' +
    'Report ID: ' + state.reportId + '\n' +
    'AI Report не появился в течение ' + PIPELINE.TIMEOUT_MINUTES + ' минут.\n\n' +
    'Проверьте:\n' +
    '1. Запущен ли Nodul\n' +
    '2. Настроен ли триггер в Nodul\n' +
    '3. Доступ к Google Drive'
  );
  
  Logger.log('=== Pipeline Timeout ===');
}

/**
 * Обрабатывает ошибку pipeline.
 * 
 * @param {Object} state
 * @param {Error} error
 */
function handleFailure_(state, error) {
  Logger.log('Pipeline failed: ' + error.message);
  Logger.log('Stack: ' + error.stack);
  
  state.status = PIPELINE.STATUS_FAILED;
  state.error = error.message;
  state.errorStack = error.stack;
  state.failedAt = new Date().getTime();
  savePipelineState_(state);
  
  // Удалить триггер
  if (state.triggerId) {
    deletePipelineTriggerById_(state.triggerId);
  }
  
  // Уведомить пользователя
  showError_(
    'Pipeline завершился с ошибкой.\n\n' +
    'Report ID: ' + state.reportId + '\n' +
    'Ошибка: ' + error.message + '\n\n' +
    'Детали ошибки сохранены в логах.'
  );
  
  Logger.log('=== Pipeline Failed ===');
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Получает информацию о последнем pipeline.
 * 
 * @returns {Object|null}
 */
function getPipelineInfo() {
  const state = getPipelineState_();
  
  if (!state) {
    return null;
  }
  
  const info = {
    reportId: state.reportId,
    status: state.status,
    startTime: new Date(state.startTime).toISOString(),
    elapsed: state.completedAt || state.failedAt
      ? ((state.completedAt || state.failedAt) - state.startTime) / 1000 / 60
      : (new Date().getTime() - state.startTime) / 1000 / 60,
    error: state.error || null,
    archiveFolderUrl: state.archiveFolderUrl || null
  };
  
  // Добавляем информацию о Telegram
  const telegramInfo = getTelegramInfo();
  if (telegramInfo) {
    info.telegram = telegramInfo;
  }
  
  return info;
}

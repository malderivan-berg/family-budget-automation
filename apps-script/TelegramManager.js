/**
 * ============================================================================
 * Family Budget Automation
 * TelegramManager.gs
 * ----------------------------------------------------------------------------
 * Интеграция с Telegram через Nodul.
 *
 * Ответственность:
 *   • создание запросов на отправку отчетов в Telegram;
 *   • сохранение запросов в Telegram/Outbox/;
 *   • проверка результатов отправки из Telegram/Inbox/;
 *   • обработка успехов и ошибок отправки.
 *
 * Архитектура:
 *   Apps Script → telegram_request.json → Nodul → Telegram Bot → User
 *   Nodul → telegram_response.json → Apps Script
 * ============================================================================
 */

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Отправляет HTML-отчет в Telegram через Nodul.
 * 
 * Создает telegram_request.json в папке Telegram/Outbox/.
 * Nodul мониторит эту папку и отправляет отчет в Telegram.
 * 
 * @param {number|string} reportId - ID отчета
 * @param {string} htmlFileId - ID HTML-файла в Google Drive
 * @param {Array<Object>} users - массив пользователей для отправки
 * @returns {Object} результат создания запроса
 */
function sendReportToTelegram_(reportId, htmlFileId, users) {
  Logger.log('=== Telegram Send Started ===');
  Logger.log('Report ID: ' + reportId);
  Logger.log('HTML File ID: ' + htmlFileId);
  Logger.log('Users count: ' + users.length);
  
  try {
    // 1. Создать запрос
    const request = createTelegramRequest_(reportId, htmlFileId, users);
    Logger.log('Telegram request created: ' + request.requestId);
    
    // 2. Сохранить запрос в Outbox
    const content = JSON.stringify(request, null, 2);
    const savedFile = saveTelegramRequest_(content);
    Logger.log('Telegram request saved: ' + savedFile.getUrl());
    
    // 3. Удалить старый response (если есть)
    const deleted = deleteTelegramResponse_();
    Logger.log('Old Telegram response deleted: ' + deleted);
    
    Logger.log('=== Telegram Request Created Successfully ===');
    
    return {
      success: true,
      requestId: request.requestId,
      message: 'Telegram request created. Waiting for Nodul to send.'
    };
    
  } catch (error) {
    Logger.log('Error creating Telegram request: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    
    return {
      success: false,
      error: error.message,
      message: 'Failed to create Telegram request.'
    };
  }
}

/**
 * Проверяет результат отправки в Telegram.
 * 
 * Читает telegram_response.json из папки Telegram/Inbox/.
 * 
 * @param {string} requestId - ID запроса для проверки
 * @returns {Object|null} результат отправки или null, если еще не готов
 */
function checkTelegramResponse_(requestId) {
  Logger.log('Checking Telegram response for request: ' + requestId);
  
  // Проверяем наличие response файла
  if (!isTelegramResponseReady_()) {
    Logger.log('Telegram response not ready yet.');
    return null;
  }
  
  try {
    // Читаем response
    const content = readTelegramResponse_();
    const response = JSON.parse(content);
    
    // Проверяем, что это ответ на наш запрос
    if (response.requestId !== requestId) {
      Logger.log('Response requestId mismatch. Expected: ' + requestId + ', got: ' + response.requestId);
      return null;
    }
    
    Logger.log('Telegram response received: ' + response.status);
    
    // Обрабатываем результат
    if (response.status === 'success') {
      handleTelegramSuccess_(response);
    } else {
      handleTelegramError_(response);
    }
    
    return response;
    
  } catch (error) {
    Logger.log('Error reading Telegram response: ' + error.message);
    return null;
  }
}

// ============================================================================
// СОЗДАНИЕ ЗАПРОСА
// ============================================================================

/**
 * Создает структуру telegram_request.json.
 * 
 * @param {number|string} reportId - ID отчета
 * @param {string} htmlFileId - ID HTML-файла в Google Drive
 * @param {Array<Object>} users - массив пользователей
 * @returns {Object} структура запроса
 */
function createTelegramRequest_(reportId, htmlFileId, users) {
  const timestamp = new Date();
  const requestId = 'tg_' + reportId + '_' + 
    Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  
  // Получаем информацию о периоде отчета
  const state = getPipelineState_();
  const period = state ? state.period : getCurrentReportPeriod_();
  
  // Формируем caption для каждого пользователя
  const usersWithCaption = users.map(function(user) {
    return {
      userId: user.userId,
      chatId: user.chatId,
      caption: '📊 Отчет за период ' + period + '\n\nReport ID: ' + reportId
    };
  });
  
  return {
    requestId: requestId,
    reportId: reportId,
    users: usersWithCaption,
    htmlFileId: htmlFileId,
    htmlFileName: PROJECT_FILES.HTML_REPORT,
    timestamp: timestamp.toISOString()
  };
}

// ============================================================================
// ОБРАБОТКА РЕЗУЛЬТАТОВ
// ============================================================================

/**
 * Обрабатывает успешную отправку в Telegram.
 * 
 * @param {Object} response - ответ от Nodul
 */
function handleTelegramSuccess_(response) {
  Logger.log('=== Telegram Send Success ===');
  Logger.log('Request ID: ' + response.requestId);
  
  // Логируем результаты для каждого пользователя
  if (response.results && Array.isArray(response.results)) {
    response.results.forEach(function(result) {
      Logger.log('User: ' + result.userId + ' - Status: ' + result.status);
      if (result.messageId) {
        Logger.log('  Message ID: ' + result.messageId);
      }
      if (result.error) {
        Logger.log('  Error: ' + result.error);
      }
    });
  }
  
  // Удаляем response файл после обработки
  deleteTelegramResponse_();
  deleteTelegramRequest_();
  
  Logger.log('Telegram response files cleaned up.');
}

/**
 * Обрабатывает ошибку отправки в Telegram.
 * 
 * @param {Object} response - ответ от Nodul с ошибкой
 */
function handleTelegramError_(response) {
  Logger.log('=== Telegram Send Error ===');
  Logger.log('Request ID: ' + response.requestId);
  Logger.log('Status: ' + response.status);
  
  // Логируем ошибки для каждого пользователя
  if (response.results && Array.isArray(response.results)) {
    response.results.forEach(function(result) {
      if (result.status === 'error' || result.error) {
        Logger.log('User: ' + result.userId + ' - Error: ' + (result.error || 'Unknown error'));
      }
    });
  }
  
  // Удаляем response файл после обработки
  deleteTelegramResponse_();
  deleteTelegramRequest_();
  
  Logger.log('Telegram response files cleaned up.');
}

// ============================================================================
// ИНТЕГРАЦИЯ С PIPELINE
// ============================================================================

/**
 * Запускает отправку отчета в Telegram после завершения pipeline.
 * 
 * Вызывается из PipelineManager после успешного архивирования.
 * 
 * @param {Object} state - состояние pipeline
 * @param {string} htmlFileId - ID сохраненного HTML-файла
 */
function initiateTelegramSend_(state, htmlFileId) {
  Logger.log('=== Initiating Telegram Send ===');
  
  try {
    // Получаем список пользователей из конфигурации
    const users = TELEGRAM.USERS;
    
    if (!users || users.length === 0) {
      Logger.log('No Telegram users configured. Skipping Telegram send.');
      return {
        success: false,
        message: 'No Telegram users configured.'
      };
    }
    
    // Создаем запрос на отправку
    const result = sendReportToTelegram_(state.reportId, htmlFileId, users);
    
    if (!result.success) {
      Logger.log('Failed to create Telegram request: ' + result.error);
      return result;
    }
    
    // Сохраняем requestId в состояние pipeline для последующей проверки
    state.telegramRequestId = result.requestId;
    state.telegramStatus = 'pending';
    savePipelineState_(state);
    
    Logger.log('Telegram send initiated. Request ID: ' + result.requestId);
    
    return result;
    
  } catch (error) {
    Logger.log('Error initiating Telegram send: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    
    return {
      success: false,
      error: error.message,
      message: 'Failed to initiate Telegram send.'
    };
  }
}

/**
 * Проверяет статус отправки в Telegram.
 * 
 * Вызывается из PipelineManager при проверке pipeline.
 * 
 * @param {Object} state - состояние pipeline
 * @returns {Object|null} результат проверки
 */
function checkTelegramSendStatus_(state) {
  if (!state.telegramRequestId) {
    return null;
  }
  
  if (state.telegramStatus === 'completed' || state.telegramStatus === 'failed') {
    return {
      status: state.telegramStatus,
      message: 'Telegram send already processed.'
    };
  }
  
  const response = checkTelegramResponse_(state.telegramRequestId);
  
  if (!response) {
    return null;
  }
  
  // Обновляем состояние pipeline
  if (response.status === 'success') {
    state.telegramStatus = 'completed';
    state.telegramCompletedAt = new Date().getTime();
  } else {
    state.telegramStatus = 'failed';
    state.telegramError = response.error || 'Unknown Telegram error';
    state.telegramFailedAt = new Date().getTime();
  }
  
  savePipelineState_(state);
  
  return response;
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Получает информацию о последней отправке в Telegram.
 * 
 * @returns {Object|null}
 */
function getTelegramInfo() {
  const state = getPipelineState_();
  
  if (!state || !state.telegramRequestId) {
    return null;
  }
  
  return {
    requestId: state.telegramRequestId,
    status: state.telegramStatus || 'unknown',
    completedAt: state.telegramCompletedAt 
      ? new Date(state.telegramCompletedAt).toISOString()
      : null,
    failedAt: state.telegramFailedAt
      ? new Date(state.telegramFailedAt).toISOString()
      : null,
    error: state.telegramError || null
  };
}

// ============================================================================
// ПОВТОРНАЯ ОТПРАВКА ПОСЛЕДНЕГО ОТЧЁТА
// ============================================================================

/**
 * ============================================================================
 * Повторно отправляет последний созданный отчёт в Telegram.
 * 
 * Использует состояние pipeline для получения информации о последнем отчёте.
 * Если pipeline state недоступен — ищет последний архив в папке Reports.
 * 
 * Публичная функция (без _) — может вызываться из меню Google Sheets.
 * 
 * @returns {Object} результат операции
 */
function sendLastReportToTelegram() {
  Logger.log('=== Send Last Report to Telegram ===');
  
  try {
    // 1. Найти последний отчёт
    const lastReport = findLastReport_();
    
    if (!lastReport) {
      throw new Error(
        'Не удалось найти последний отчёт.\n\n' +
        'Проверьте:\n' +
        '1. Был ли завершён pipeline\n' +
        '2. Существует ли папка Reports с архивами'
      );
    }
    
    Logger.log('Last report found:');
    Logger.log('  Report ID: ' + lastReport.reportId);
    Logger.log('  Period: ' + lastReport.period);
    Logger.log('  HTML File ID: ' + lastReport.htmlFileId);
    Logger.log('  Archive URL: ' + lastReport.archiveFolderUrl);
    
    // 2. Получить список пользователей
    const users = TELEGRAM.USERS;
    if (!users || users.length === 0) {
      throw new Error(
        'Не настроены пользователи Telegram.\n\n' +
        'Проверьте TELEGRAM.USERS в Config.gs'
      );
    }
    
    // 3. Создать запрос
    const request = createTelegramRequest_(
      lastReport.reportId,
      lastReport.htmlFileId,
      users
    );
    
    // Переопределяем caption с реальным периодом отчёта
    request.users = request.users.map(function(user) {
      return {
        userId: user.userId,
        chatId: user.chatId,
        caption: '📊 Отчёт за период ' + lastReport.period + 
                 '\n\nReport ID: ' + lastReport.reportId
      };
    });
    
    // 4. Сохранить запрос в Outbox
    const content = JSON.stringify(request, null, 2);
    const savedFile = saveTelegramRequest_(content);
    
    // 5. Удалить старый response (если есть)
    deleteTelegramResponse_();
    
    Logger.log('Telegram request created: ' + savedFile.getUrl());
    
    const message = 
      '✅ Запрос на отправку создан!\n\n' +
      'Report ID: ' + lastReport.reportId + '\n' +
      'Период: ' + lastReport.period + '\n' +
      'Пользователей: ' + users.length + '\n\n' +
      'Nodul отправит отчёт в Telegram в течение 1-2 минут.';
    
    showInfo_(message);
    
    return {
      success: true,
      requestId: request.requestId,
      reportId: lastReport.reportId,
      period: lastReport.period,
      htmlFileId: lastReport.htmlFileId
    };
    
  } catch (error) {
    Logger.log('Error: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    showError_('Ошибка: ' + error.message);
    throw error;
  }
}

/**
 * ============================================================================
 * Находит последний созданный отчёт.
 * 
 * Приоритет:
 * 1. Состояние pipeline (если pipeline завершён)
 * 2. Последний архив в папке Reports
 * 
 * @returns {Object|null} {reportId, period, htmlFileId, archiveFolderUrl}
 */
function findLastReport_() {
  // Попытка 1: Из pipeline state
  const state = getPipelineState_();
  if (state && state.status === PIPELINE.STATUS_COMPLETED && state.archiveFolderUrl) {
    const htmlFileId = findHtmlInArchive_(state.archiveFolderUrl);
    if (htmlFileId) {
      Logger.log('Last report found in pipeline state');
      return {
        reportId: state.reportId,
        period: state.period,
        htmlFileId: htmlFileId,
        archiveFolderUrl: state.archiveFolderUrl
      };
    }
  }
  
  // Попытка 2: Искать последний архив в Reports
  Logger.log('Pipeline state unavailable, searching in Reports folder...');
  return findLastArchivedReport_();
}

/**
 * Находит ID файла Family Budget Report.html в папке архива.
 * 
 * @param {string} archiveFolderUrl - URL папки архива
 * @returns {string|null} ID файла или null
 */
function findHtmlInArchive_(archiveFolderUrl) {
  try {
    const folderIdMatch = archiveFolderUrl.match(/\/folders\/(.+)/);
    if (!folderIdMatch) return null;
    
    const folder = DriveApp.getFolderById(folderIdMatch[1]);
    const files = folder.getFilesByName(PROJECT_FILES.HTML_REPORT);
    
    if (files.hasNext()) {
      return files.next().getId();
    }
    return null;
  } catch (error) {
    Logger.log('Error finding HTML in archive: ' + error.message);
    return null;
  }
}

/**
 * Ищет последний архивный отчёт в папке Reports.
 * Обходит структуру Reports/YYYY/YYYY-MM/Report_ID_DATE/
 * 
 * @returns {Object|null}
 */
function findLastArchivedReport_() {
  try {
    const reportsFolder = getReportsFolder_();
    const yearFolders = reportsFolder.getFolders();
    
    let latestYear = null;
    
    // Находим последнюю папку года
    while (yearFolders.hasNext()) {
      const yearFolder = yearFolders.next();
      const yearName = yearFolder.getName();
      if (!latestYear || yearName > latestYear) {
        latestYear = yearName;
      }
    }
    
    if (!latestYear) {
      Logger.log('No year folders found in Reports');
      return null;
    }
    
    const yearFolder = reportsFolder.getFoldersByName(latestYear).next();
    const monthFolders = yearFolder.getFolders();
    
    let latestMonth = null;
    
    // Находим последнюю папку месяца
    while (monthFolders.hasNext()) {
      const monthFolder = monthFolders.next();
      const monthName = monthFolder.getName();
      if (!latestMonth || monthName > latestMonth) {
        latestMonth = monthName;
      }
    }
    
    if (!latestMonth) {
      Logger.log('No month folders found in ' + latestYear);
      return null;
    }
    
    const monthFolder = yearFolder.getFoldersByName(latestMonth).next();
    const reportFolders = monthFolder.getFolders();
    
    let latestReport = null;
    
    // Находим последнюю папку отчёта (по имени Report_ID_DATE)
    while (reportFolders.hasNext()) {
      const reportFolder = reportFolders.next();
      const reportName = reportFolder.getName();
      
      if (!latestReport || reportName > latestReport.name) {
        // Извлекаем reportId и period из имени
        const match = reportName.match(/Report_(\d+)_(\d{4}-\d{2}-\d{2})/);
        if (match) {
          // Ищем HTML файл в этой папке
          const htmlFiles = reportFolder.getFilesByName(PROJECT_FILES.HTML_REPORT);
          if (htmlFiles.hasNext()) {
            latestReport = {
              name: reportName,
              reportId: parseInt(match[1], 10),
              period: match[2].substring(0, 7), // YYYY-MM
              htmlFileId: htmlFiles.next().getId(),
              archiveFolderUrl: reportFolder.getUrl()
            };
          }
        }
      }
    }
    
    if (latestReport) {
      Logger.log('Last archived report found: ' + latestReport.name);
      return {
        reportId: latestReport.reportId,
        period: latestReport.period,
        htmlFileId: latestReport.htmlFileId,
        archiveFolderUrl: latestReport.archiveFolderUrl
      };
    }
    
    Logger.log('No archived reports found');
    return null;
    
  } catch (error) {
    Logger.log('Error finding last archived report: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    return null;
  }
}
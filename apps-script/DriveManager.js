/**
 * ============================================================================
 * Family Budget Automation
 * DriveManager.gs
 * ----------------------------------------------------------------------------
 * Централизованная работа с Google Drive.
 *
 * Назначение:
 *  - создание структуры папок проекта;
 *  - получение ссылок на рабочие папки;
 *  - работа с файлами (сохранение, чтение, перемещение);
 *  - архивирование отчетов;
 *  - единая точка доступа к Google Drive.
 * ============================================================================
 */

/**
 * ============================================================================
 * Внутренний кэш папок Google Drive.
 *
 * Позволяет избежать повторных обращений к Drive в рамках одного запуска
 * Apps Script.
 * ============================================================================
 */
const DRIVE_CACHE = {
  root: null,
  data: null,
  workspace: null,
  job: null,
  reports: null,
  archive: null,
  inbox: null,
  telegram: null,
  telegramOutbox: null,
  telegramInbox: null,
  voice: null,
  voiceDrafts: null,
  voiceConfirmed: null,
  voiceArchive: null,
  voiceCallbacks: null,
  voicePrompts: null,
  voiceOutbox: null
};

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ПАПКАМИ
// ============================================================================

/**
 * Возвращает корневую папку проекта.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getProjectRootFolder_() {
  return getCachedFolder_(
    'root',
    function () {
      return getOrCreateFolder_(
        DriveApp.getRootFolder(),
        DRIVE.ROOT_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Data.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getDataFolder_() {
  return getCachedFolder_(
    'data',
    function () {
      return getOrCreateFolder_(
        getProjectRootFolder_(),
        DRIVE.DATA_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  AI Workspace.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getAIWorkspaceFolder_() {
  return getCachedFolder_(
    'workspace',
    function () {
      return getOrCreateFolder_(
        getProjectRootFolder_(),
        DRIVE.AI_WORKSPACE_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Job  внутри  AI Workspace.
 *  В этой папке хранится только AI Job Package.txt.
 *  ИИ-оркестратор настраивает триггер на эту подпапку.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getAIJobFolder_() {
  return getCachedFolder_(
    'job',
    function () {
      return getOrCreateFolder_(
        getAIWorkspaceFolder_(),
        DRIVE.AI_JOB_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Reports.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getReportsFolder_() {
  return getCachedFolder_(
    'reports',
    function () {
      return getOrCreateFolder_(
        getProjectRootFolder_(),
        DRIVE.REPORTS_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Archive.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getArchiveFolder_() {
  return getCachedFolder_(
    'archive',
    function () {
      return getOrCreateFolder_(
        getProjectRootFolder_(),
        DRIVE.ARCHIVE_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Inbox.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getInboxFolder_() {
  return getCachedFolder_(
    'inbox',
    function () {
      return getOrCreateFolder_(
        getProjectRootFolder_(),
        DRIVE.INBOX_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Telegram  внутри  AI Workspace.
 *  Используется для интеграции с Telegram через Nodul.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getTelegramFolder_() {
  return getCachedFolder_(
    'telegram',
    function () {
      return getOrCreateFolder_(
        getAIWorkspaceFolder_(),
        DRIVE.TELEGRAM_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Telegram/Outbox  внутри  AI Workspace.
 *  Apps Script создает здесь запросы для отправки в Telegram.
 *  Nodul мониторит эту папку через триггер Google Drive.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getTelegramOutboxFolder_() {
  return getCachedFolder_(
    'telegramOutbox',
    function () {
      return getOrCreateFolder_(
        getTelegramFolder_(),
        DRIVE.TELEGRAM_OUTBOX_FOLDER
      );
    }
  );
}

/**
 *  Возвращает   папку  Telegram/Inbox  внутри  AI Workspace.
 *  Nodul создает здесь ответы с результатом отправки.
 *  Apps Script читает результаты из этой папки.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getTelegramInboxFolder_() {
  return getCachedFolder_(
    'telegramInbox',
    function () {
      return getOrCreateFolder_(
        getTelegramFolder_(),
        DRIVE.TELEGRAM_INBOX_FOLDER
      );
    }
  );
}

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ПАПКАМИ VOICE (v0.9+)
// ============================================================================

/**
 * Возвращает папку Voice внутри AI Workspace.
 * Корневая папка для всех голосовых операций.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getVoiceFolder_() {
  return getCachedFolder_(
    'voice',
    function() {
      return getOrCreateFolder_(
        getAIWorkspaceFolder_(),
        DRIVE.VOICE_FOLDER
      );
    }
  );
}

/**
 * Возвращает папку Voice/Drafts внутри AI Workspace.
 * Здесь хранятся батчи до подтверждения пользователем.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getVoiceDraftsFolder_() {
  return getCachedFolder_(
    'voiceDrafts',
    function() {
      return getOrCreateFolder_(
        getVoiceFolder_(),
        DRIVE.VOICE_DRAFTS_FOLDER
      );
    }
  );
}

/**
 * Возвращает папку Voice/Confirmed внутри AI Workspace.
 * Здесь хранятся батчи, подтвержденные пользователем,
 * ожидающие записи в Sheets.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getVoiceConfirmedFolder_() {
  return getCachedFolder_(
    'voiceConfirmed',
    function() {
      return getOrCreateFolder_(
        getVoiceFolder_(),
        DRIVE.VOICE_CONFIRMED_FOLDER
      );
    }
  );
}

/**
 * Возвращает папку Voice/Archive внутри AI Workspace.
 * Архив всех обработанных батчей (для аудита и отладки).
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getVoiceArchiveFolder_() {
  return getCachedFolder_(
    'voiceArchive',
    function() {
      return getOrCreateFolder_(
        getVoiceFolder_(),
        DRIVE.VOICE_ARCHIVE_FOLDER
      );
    }
  );
}

/**
 * Возвращает папку Voice/Callbacks внутри AI Workspace.
 * Сюда Nodul кладет файлы-сигналы о действиях пользователя (confirm/cancel).
 * Apps Script читает эти сигналы и выполняет соответствующие действия.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getVoiceCallbacksFolder_() {
  return getCachedFolder_(
    'voiceCallbacks',
    function() {
      return getOrCreateFolder_(
        getVoiceFolder_(),
        DRIVE.VOICE_CALLBACKS_FOLDER
      );
    }
  );
}

/**
 * Возвращает папку Voice/Outbox внутри AI Workspace.
 * Сюда Apps Script кладёт уведомления о результате записи голосовых операций.
 * Nodul (сценарий 3, второй триггер) мониторит эту папку.
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getVoiceOutboxFolder_() {
  return getCachedFolder_(
    'voiceOutbox',
    function() {
      return getOrCreateFolder_(
        getVoiceFolder_(),
        DRIVE.VOICE_OUTBOX_FOLDER
      );
    }
  );
}

/**
 * Возвращает папку Voice/Prompts внутри AI Workspace.
 * Здесь хранятся промпты для LLM (читаются Nodul).
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getVoicePromptsFolder_() {
  return getCachedFolder_(
    'voicePrompts',
    function() {
      return getOrCreateFolder_(
        getVoiceFolder_(),
        'Prompts'
      );
    }
  );
}

/**
 * Возвращает папку года в разделе Reports.
 *
 * @param {number|string} year
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getReportYearFolder_(year) {
  return getReportSubFolder_(
    getReportsFolder_(),
    'year_' + year,
    String(year)
  );
}

/**
 * Возвращает папку месяца внутри папки года.
 *
 * @param {number|string} year
 * @param {number|string} month
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getReportMonthFolder_(year, month) {
  const folderName =
    year + '-' + Utilities.formatString('%02d', Number(month));
  return getReportSubFolder_(
    getReportYearFolder_(year),
    'month_' + folderName,
    folderName
  );
}

/**
 * Возвращает папку конкретного отчета.
 *
 *  Структура :
 * Reports/
 *   2026/
 *     2026-07/
 *       Report_123_2026-07-11/
 *
 * @param {number|string} reportId
 * @param {Date} reportDate
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getReportFolder_(
  reportId,
  reportDate
) {
  const year = reportDate.getFullYear();
  const month = reportDate.getMonth() + 1;
  const dateString = Utilities.formatDate(
    reportDate,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
  const folderName =
    'Report_' +
    reportId +
    '_' +
    dateString;
  return getReportSubFolder_(
    getReportMonthFolder_(year, month),
    'report_' + reportId + '_' + dateString,
    folderName
  );
}

/**
 * Возвращает существующую вложенную папку Reports
 * или создает новую.
 *
 * @param {GoogleAppsScript.Drive.Folder} parentFolder
 * @param {string} cacheKey
 * @param {string} folderName
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getReportSubFolder_(
  parentFolder,
  cacheKey,
  folderName
) {
  return getCachedFolder_(
    cacheKey,
    function () {
      return getOrCreateFolder_(
        parentFolder,
        folderName
      );
    }
  );
}

/**
 * Возвращает папку из кэша.
 * Если папки нет — вызывает функцию создания,
 * сохраняет результат в кэш и возвращает его.
 *
 * @param {string} key
 * @param {Function} factory
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getCachedFolder_(
  key,
  factory
) {
  if (!DRIVE_CACHE[key]) {
    DRIVE_CACHE[key] = factory();
  }
  return DRIVE_CACHE[key];
}

/**
 * Возвращает существующую папку или создает новую.
 *
 * @param {GoogleAppsScript.Drive.Folder} parentFolder
 * @param {string} folderName
 *
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateFolder_(
  parentFolder,
  folderName
) {
  Logger.log('Searching folder: ' + folderName);
  const folders =
    parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ
// ============================================================================

/**
 * Универсальная функция сохранения файла с перезаписью.
 * Если файл с таким именем существует — удаляет его и создаёт новый.
 * 
 * Все специализированные функции (saveFileToWorkspace_, saveAIJobPackage_)
 * являются обёртками над этой функцией.
 * 
 * @param {GoogleAppsScript.Drive.Folder} folder - папка для сохранения
 * @param {string} fileName - имя файла
 * @param {string} content - содержимое файла
 * @param {string} mimeType - тип файла (MimeType.PLAIN_TEXT, MimeType.HTML и т.д.)
 * @returns {GoogleAppsScript.Drive.File}
 */
function saveFileWithOverwrite_(folder, fileName, content, mimeType) {
  //  Удаляем   существующий   файл,  если   есть
  const existingFiles = folder.getFilesByName(fileName);
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
  }
  
  //  Создаём   новый   файл
  const blob = Utilities.newBlob(content, mimeType, fileName);
  return folder.createFile(blob);
}

/**
 * Универсальная функция удаления файла по имени из указанной папки.
 * 
 * Все специализированные функции удаления являются обёртками над этой функцией.
 * 
 * @param {GoogleAppsScript.Drive.Folder} folder - папка для поиска
 * @param {string} fileName - имя файла для удаления
 * @returns {boolean} true, если файл был удалён
 */
function deleteFileByName_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  let deleted = false;
  while (files.hasNext()) {
    files.next().setTrashed(true);
    deleted = true;
  }
  return deleted;
}

/**
 *  Сохраняет   файл   в  AI Workspace  с   перезаписью.
 *  Обёртка   над  saveFileWithOverwrite_.
 * 
 * @param {string} fileName -  имя   файла
 * @param {string} content -  содержимое   файла
 * @param {string} mimeType -  тип   файла
 * @returns {GoogleAppsScript.Drive.File}
 */
function saveFileToWorkspace_(fileName, content, mimeType) {
  return saveFileWithOverwrite_(
    getAIWorkspaceFolder_(),
    fileName,
    content,
    mimeType
  );
}

/**
 * Получает файл из AI Workspace по имени.
 * 
 * @param {string} fileName
 * @returns {GoogleAppsScript.Drive.File}
 */
function getFileFromWorkspace_(fileName) {
  const folder = getAIWorkspaceFolder_();
  const files = folder.getFilesByName(fileName);
  
  if (!files.hasNext()) {
    throw new Error('Файл "' + fileName + '" не найден в AI Workspace.');
  }
  
  return files.next();
}

/**
 * Читает содержимое файла из AI Workspace.
 * 
 * @param {string} fileName
 * @returns {string}
 */
function readFileFromWorkspace_(fileName) {
  const file = getFileFromWorkspace_(fileName);
  return file.getBlob().getDataAsString('UTF-8').trim();
}

/**
 * Перемещает Google Spreadsheet в AI Workspace.
 * 
 * @param {GoogleAppsScript.SpreadsheetApp.Spreadsheet} spreadsheet
 * @returns {GoogleAppsScript.Drive.File}
 */
function moveSpreadsheetToWorkspace_(spreadsheet) {
  const folder = getAIWorkspaceFolder_();
  const file = DriveApp.getFileById(spreadsheet.getId());
  
  // Перемещаем в AI Workspace
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  
  return file;
}

/**
 * Сохраняет AI Job Package в подпапку Job с перезаписью.
 * Обёртка над saveFileWithOverwrite_.
 *
 * @param {string} content - содержимое AI Job Package
 * @returns {GoogleAppsScript.Drive.File}
 */
function saveAIJobPackage_(content) {
  return saveFileWithOverwrite_(
    getAIJobFolder_(),
    PROJECT_FILES.AI_JOB_PACKAGE,
    content,
    MimeType.PLAIN_TEXT
  );
}

/**
 * Читает содержимое AI Job Package из подпапки Job.
 *
 * @returns {string}
 */
function readAIJobPackage_() {
  const folder = getAIJobFolder_();
  const fileName = PROJECT_FILES.AI_JOB_PACKAGE;
  const files = folder.getFilesByName(fileName);
  
  if (!files.hasNext()) {
    throw new Error('AI Job Package не найден в папке Job.');
  }
  
  return files.next().getBlob().getDataAsString('UTF-8').trim();
}

/**
 * Сохраняет Telegram request в папку Telegram/Outbox с перезаписью.
 * Обёртка над saveFileWithOverwrite_.
 *
 * @param {string} content - содержимое telegram_request.json
 * @returns {GoogleAppsScript.Drive.File}
 */
function saveTelegramRequest_(content) {
  return saveFileWithOverwrite_(
    getTelegramOutboxFolder_(),
    PROJECT_FILES.TELEGRAM_REQUEST,
    content,
    MimeType.PLAIN_TEXT
  );
}

/**
 * Читает содержимое Telegram request из папки Telegram/Outbox.
 *
 * @returns {string}
 */
function readTelegramRequest_() {
  const folder = getTelegramOutboxFolder_();
  const fileName = PROJECT_FILES.TELEGRAM_REQUEST;
  const files = folder.getFilesByName(fileName);
  
  if (!files.hasNext()) {
    throw new Error('Telegram request не найден в папке Telegram/Outbox.');
  }
  
  return files.next().getBlob().getDataAsString('UTF-8').trim();
}

/**
 * Сохраняет Telegram response в папку Telegram/Inbox с перезаписью.
 * Обёртка над saveFileWithOverwrite_.
 *
 * @param {string} content - содержимое telegram_response.json
 * @returns {GoogleAppsScript.Drive.File}
 */
function saveTelegramResponse_(content) {
  return saveFileWithOverwrite_(
    getTelegramInboxFolder_(),
    PROJECT_FILES.TELEGRAM_RESPONSE,
    content,
    MimeType.PLAIN_TEXT
  );
}

/**
 * Читает содержимое Telegram response из папки Telegram/Inbox.
 *
 * @returns {string}
 */
function readTelegramResponse_() {
  const folder = getTelegramInboxFolder_();
  const fileName = PROJECT_FILES.TELEGRAM_RESPONSE;
  const files = folder.getFilesByName(fileName);
  
  if (!files.hasNext()) {
    throw new Error('Telegram response не найден в папке Telegram/Inbox.');
  }
  
  return files.next().getBlob().getDataAsString('UTF-8').trim();
}

/**
 * Удаляет файл Telegram request из папки Telegram/Outbox.
 *
 * @returns {boolean} true, если файл был удалён
 */
function deleteTelegramRequest_() {
  return deleteFileByName_(getTelegramOutboxFolder_(), PROJECT_FILES.TELEGRAM_REQUEST);
}

/**
 * Удаляет файл Telegram response из папки Telegram/Inbox.
 *
 * @returns {boolean} true, если файл был удалён
 */
function deleteTelegramResponse_() {
  return deleteFileByName_(getTelegramInboxFolder_(), PROJECT_FILES.TELEGRAM_RESPONSE);
}

// ============================================================================
// ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ VOICE (v0.9+)
// ============================================================================

/**
 * Сохраняет Voice Transaction Batch в папку Voice/Drafts.
 * Файл получает имя {batch_id}.json.
 *
 * @param {string} batchId - уникальный ID батча (например, "vtb_20260716_abc123")
 * @param {string} content - JSON-содержимое батча
 * @returns {GoogleAppsScript.Drive.File}
 */
function saveVoiceDraft_(batchId, content) {
  const fileName = batchId + '.json';
  return saveFileWithOverwrite_(
    getVoiceDraftsFolder_(),
    fileName,
    content,
    MimeType.PLAIN_TEXT
  );
}

/**
 * Читает содержимое Voice Transaction Batch из папки Voice/Drafts.
 *
 * @param {string} batchId - уникальный ID батча
 * @returns {string} JSON-содержимое батча
 */
function readVoiceDraft_(batchId) {
  const folder = getVoiceDraftsFolder_();
  const fileName = batchId + '.json';
  const files = folder.getFilesByName(fileName);

  if (!files.hasNext()) {
    throw new Error('Voice Draft не найден: ' + fileName);
  }

  return files.next().getBlob().getDataAsString('UTF-8').trim();
}

/**
 * Удаляет Voice Transaction Batch из папки Voice/Drafts.
 * Используется при отмене операции пользователем.
 *
 * @param {string} batchId - уникальный ID батча
 * @returns {boolean} true, если файл был удалён
 */
function deleteVoiceDraft_(batchId) {
  return deleteFileByName_(
    getVoiceDraftsFolder_(),
    batchId + '.json'
  );
}

/**
 * Перемещает Voice Transaction Batch из Voice/Drafts в Voice/Confirmed.
 * Вызывается после подтверждения пользователем через Telegram.
 *
 * @param {string} batchId - уникальный ID батча
 * @returns {GoogleAppsScript.Drive.File} файл в папке Confirmed
 */
function moveVoiceDraftToConfirmed_(batchId) {
  const fileName = batchId + '.json';
  const draftsFolder = getVoiceDraftsFolder_();
  const confirmedFolder = getVoiceConfirmedFolder_();

  const files = draftsFolder.getFilesByName(fileName);
  if (!files.hasNext()) {
    throw new Error('Voice Draft не найден для перемещения: ' + fileName);
  }

  const file = files.next();

  // Добавляем файл в папку Confirmed
  confirmedFolder.addFile(file);
  // Удаляем файл из папки Drafts (не в корзину, а только из папки)
  draftsFolder.removeFile(file);

  return file;
}

/**
 * Читает содержимое Voice Transaction Batch из папки Voice/Confirmed.
 *
 * @param {string} batchId - уникальный ID батча
 * @returns {string} JSON-содержимое батча
 */
function readVoiceConfirmed_(batchId) {
  const folder = getVoiceConfirmedFolder_();
  const fileName = batchId + '.json';
  const files = folder.getFilesByName(fileName);

  if (!files.hasNext()) {
    throw new Error('Voice Confirmed не найден: ' + fileName);
  }

  return files.next().getBlob().getDataAsString('UTF-8').trim();
}

/**
 * Перемещает Voice Transaction Batch из Voice/Confirmed в Voice/Archive.
 * Вызывается после успешной записи операций в Sheets.
 *
 * @param {string} batchId - уникальный ID батча
 * @returns {GoogleAppsScript.Drive.File} файл в папке Archive
 */
function moveVoiceConfirmedToArchive_(batchId) {
  const fileName = batchId + '.json';
  const confirmedFolder = getVoiceConfirmedFolder_();
  const archiveFolder = getVoiceArchiveFolder_();

  const files = confirmedFolder.getFilesByName(fileName);
  if (!files.hasNext()) {
    throw new Error('Voice Confirmed не найден для архивирования: ' + fileName);
  }

  const file = files.next();

  // Добавляем файл в папку Archive
  archiveFolder.addFile(file);
  // Удаляем файл из папки Confirmed
  confirmedFolder.removeFile(file);

  return file;
}

/**
 * Возвращает список всех батчей в папке Voice/Confirmed.
 * Используется VoiceInputManager для обработки ожидающих батчей.
 *
 * @returns {Array<{batchId: string, fileId: string, fileName: string}>}
 */
function listVoiceConfirmedBatches_() {
  const folder = getVoiceConfirmedFolder_();
  const files = folder.getFiles();
  const batches = [];

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();

    // Проверяем, что это JSON-файл
    if (!fileName.endsWith('.json')) {
      continue;
    }

    // Извлекаем batchId из имени файла (убираем расширение)
    const batchId = fileName.replace(/\.json$/, '');

    batches.push({
      batchId: batchId,
      fileId: file.getId(),
      fileName: fileName
    });
  }

  return batches;
}

/**
 * Проверяет наличие батча в папке Voice/Confirmed.
 *
 * @param {string} batchId - уникальный ID батча
 * @returns {boolean}
 */
function isVoiceConfirmedReady_(batchId) {
  const folder = getVoiceConfirmedFolder_();
  const fileName = batchId + '.json';
  const files = folder.getFilesByName(fileName);
  return files.hasNext();
}

/**
 * Проверяет наличие файла Telegram response в папке Telegram/Inbox.
 *
 * @returns {boolean}
 */
function isTelegramResponseReady_() {
  const folder = getTelegramInboxFolder_();
  const files = folder.getFilesByName(PROJECT_FILES.TELEGRAM_RESPONSE);
  return files.hasNext();
}

/**
 * Архивирует полный комплект файлов отчета.
 * Создает структуру: Reports/YYYY/YYYY-MM/Report_ID_DATE/
 * 
 * @param {number|string} reportId
 * @param {Date} reportDate
 * @param {Object} files - объект с файлами для архивирования
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function archiveReport_(reportId, reportDate, files) {
  const folder = getReportFolder_(reportId, reportDate);
  
  // Архивируем Excel (копируем Google Spreadsheet)
  if (files.excelSpreadsheetId) {
    const sourceFile = DriveApp.getFileById(files.excelSpreadsheetId);
    const excelFileName = EXPORT_FILE_PREFIX + reportId + '_' + 
      Utilities.formatDate(reportDate, Session.getScriptTimeZone(), DATE_TIME_FORMAT);
    
    // Копируем Spreadsheet в папку архива
    sourceFile.makeCopy(excelFileName, folder);
  }
  
  // Архивируем AI Job Package
  if (files.aiJobPackageContent) {
    const blob = Utilities.newBlob(
      files.aiJobPackageContent, 
      MimeType.PLAIN_TEXT, 
      PROJECT_FILES.AI_JOB_PACKAGE
    );
    folder.createFile(blob);
  }
  
  //  Архивируем  AI Report
  if (files.aiReportContent) {
    const aiReportFileName = AI_PIPELINE_MODE === 'HTML' 
      ? PROJECT_FILES.AI_REPORT_HTML 
      : PROJECT_FILES.AI_RESPONSE;
    const mimeType = AI_PIPELINE_MODE === 'HTML' ? MimeType.HTML : MimeType.PLAIN_TEXT;
    
    const blob = Utilities.newBlob(files.aiReportContent, mimeType, aiReportFileName);
    folder.createFile(blob);
  }
  
  //  Архивируем  HTML Report
  if (files.htmlReportContent) {
    const blob = Utilities.newBlob(
      files.htmlReportContent, 
      MimeType.HTML, 
      PROJECT_FILES.HTML_REPORT
    );
    folder.createFile(blob);
  }
  
  return folder;
}

/**
 * Удаляет файл из AI Workspace по имени.
 * Обёртка над deleteFileByName_.
 * 
 * @param {string} fileName - имя файла для удаления
 * @returns {boolean} true, если файл был удалён
 */
function deleteFileFromWorkspace_(fileName) {
  return deleteFileByName_(getAIWorkspaceFolder_(), fileName);
}

/**
 * Удаляет все старые файлы voice_notification_*.json из папки Telegram/Outbox.
 * 
 * Вызывается перед созданием нового уведомления, чтобы гарантировать,
 * что в папке будет только один актуальный файл.
 * 
 * @returns {number} количество удалённых файлов
 */
function cleanupOldVoiceNotifications_() {
  const outboxFolder = getVoiceOutboxFolder_();
  const files = outboxFolder.getFiles();
  let deletedCount = 0;
  
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    
    // Проверяем, что это файл голосового уведомления
    if (fileName.startsWith('voice_notification_') && fileName.endsWith('.json')) {
      try {
        file.setTrashed(true);
        deletedCount++;
        Logger.log('Deleted old voice notification: ' + fileName);
      } catch (error) {
        Logger.log('Failed to delete ' + fileName + ': ' + error.message);
      }
    }
  }
  
  if (deletedCount > 0) {
    Logger.log('Cleaned up ' + deletedCount + ' old voice notification(s)');
  }
  
  return deletedCount;
}
/**
 * ============================================================================
 * Family Budget Automation
 * ReportAgentManager.gs
 * ----------------------------------------------------------------------------
 * Отчётный конвейер v1.0: запуск агента отчёта и контроль доставки.
 *
 *   «Сформировать отчёт»
 *     → createNewReport_()           новый блок в «Расчеты», report_id = N
 *     → exportReportData_()          report_data_N.json в папку отчёта
 *     → fireReportAgent_()           POST /fire (задача Claude с API-триггером)
 *     → scheduleDeliveryCheck_()     одна отложенная проверка
 *   Агент: report_N.html → telegram_request_N.json → Nodul → Telegram
 *     → checkReportDelivered_()      доставлен? иначе — предупреждение
 *
 * Секреты — только в Script Properties (SCRIPT_PROPS), никогда в коде и логах.
 * Архитектура: docs/TARGET_ARCHITECTURE_v1.0.md.
 * ============================================================================
 */

// ============================================================================
// ОСНОВНОЙ СЦЕНАРИЙ
// ============================================================================

/**
 * Создаёт отчёт, выгружает данные и запускает агента.
 *
 * @returns {Object} состояние запуска
 */
function runReportAgentPipeline_() {
  return withReportAgentLock_(function() {
    assertReportAgentSetup_();

    const report = createNewReport_();
    SpreadsheetApp.flush();
    return startReportAgent_(report.id, false);
  });
}

/**
 * Пилот: запуск агента для последнего существующего отчёта БЕЗ создания
 * нового блока в «Расчеты» — данные таблицы не меняются. Только в тестовом
 * режиме: отчёт получает только REPORT_AGENT.ALERT_USER_NAME.
 * Файлы пилота — в папке отчёта с сегодняшней датой.
 *
 * @returns {Object} состояние запуска
 */
function runReportAgentPilot_() {
  return withReportAgentLock_(function() {
    assertReportAgentSetup_();
    if (!REPORT_AGENT.TEST_MODE) {
      throw new Error('Пилот доступен только в тестовом режиме (REPORT_AGENT.TEST_MODE = true).');
    }

    const reportId = getLastReportBlock_(getSheet_(SOURCE_SHEET_NAME)).reportId;
    return startReportAgent_(reportId, true);
  });
}

/**
 * Повторный запуск агента для последнего отчёта без создания нового блока.
 * Агент идемпотентен: если отчёт уже построен, он только досоздаст запрос
 * на доставку.
 *
 * @returns {Object} состояние запуска
 */
function retryReportAgent_() {
  return withReportAgentLock_(function() {
    assertReportAgentSetup_();

    const state = getReportAgentState_();
    if (!state || !state.reportId) {
      throw new Error('Нет отчёта для повторного запуска. Используйте «' +
        REPORT_AGENT.MENU.RUN + '».');
    }

    if (!state.dataFileId) {
      exportForState_(state);
    }
    fireForState_(state);
    return state;
  });
}

/**
 * Новое состояние запуска → выгрузка → запуск агента.
 * Состояние сохраняется сразу: при сбое выгрузки «Повторить запуск»
 * продолжит с этого отчёта, а не создаст новый блок в «Расчеты».
 *
 * @param {number} reportId
 * @param {boolean} pilot
 * @returns {Object} состояние запуска
 */
function startReportAgent_(reportId, pilot) {
  const state = {
    reportId: reportId,
    status: REPORT_AGENT.STATUS.CREATED,
    startedAt: new Date().toISOString(),
    pilot: pilot
  };
  saveReportAgentState_(state);

  exportForState_(state);
  fireForState_(state);
  return state;
}

/**
 * Выполняет fn под блокировкой скрипта: два запуска отчёта одновременно невозможны.
 *
 * @param {function(): Object} fn
 * @returns {Object}
 */
function withReportAgentLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(REPORT_AGENT.LOCK_TIMEOUT_MS)) {
    throw new Error('Отчёт уже формируется. Повторите через минуту.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Повторная отправка последнего отчёта без запуска агента. Запрос
 * telegram_request_N.json, созданный агентом, пересоздаётся с тем же
 * содержимым — сценарий Nodul срабатывает на новый файл в Outbox.
 * Старый ответ Nodul уходит в корзину, чтобы проверка доставки прочитала новый.
 *
 * @returns {Object} состояние запуска
 */
function resendLastReport_() {
  return withReportAgentLock_(function() {
    const state = getReportAgentState_();
    if (!state || !state.reportId || !state.folderId) {
      throw new Error('Нет отчёта для повторной отправки.');
    }

    const id = state.reportId;
    const outbox = getTelegramOutboxFolder_();
    const requestName = reportFileName_(REPORT_AGENT.FILES.TELEGRAM_REQUEST, id);
    const request = findFileInFolder_(outbox, requestName);
    if (!request) {
      throw new Error('Запрос на доставку отчёта №' + id + ' не найден: агент не ' +
        'завершил работу. Используйте «' + REPORT_AGENT.MENU.RETRY + '».');
    }
    const content = request.getBlob().getDataAsString('UTF-8');

    deleteFileByName_(getTelegramInboxFolder_(),
      reportFileName_(REPORT_AGENT.FILES.TELEGRAM_RESPONSE, id));
    saveFileWithOverwrite_(outbox, requestName, content, MimeType.PLAIN_TEXT);

    state.status = REPORT_AGENT.STATUS.RESENT;
    state.resentAt = new Date().toISOString();
    state.error = null;
    saveReportAgentState_(state);

    scheduleDeliveryCheck_();
    Logger.log('Report resent: ' + requestName);
    return state;
  });
}

/**
 * Выгрузка report_data для отчёта из состояния.
 *
 * @param {Object} state изменяется и сохраняется
 */
function exportForState_(state) {
  const folder = state.folderId
    ? DriveApp.getFolderById(state.folderId)
    : getReportFolder_(state.reportId, new Date());

  const dataFile = exportReportData_(state.reportId, folder);

  state.folderId = folder.getId();
  state.folderUrl = folder.getUrl();
  state.dataFileId = dataFile.getId();
  state.status = REPORT_AGENT.STATUS.EXPORTED;
  saveReportAgentState_(state);

  Logger.log('report_data saved: ' + dataFile.getName() + ' → ' + folder.getUrl());
}

/**
 * Запуск агента и планирование проверки доставки.
 *
 * @param {Object} state изменяется и сохраняется
 */
function fireForState_(state) {
  try {
    const fire = fireReportAgent_({
      report_id: state.reportId,
      report_folder_id: state.folderId,
      report_data_file_id: state.dataFileId,
      telegram_outbox_folder_id: getTelegramOutboxFolder_().getId()
    });

    state.status = REPORT_AGENT.STATUS.FIRED;
    state.firedAt = new Date().toISOString();
    state.sessionUrl = fire.sessionUrl;
    state.error = null;
    saveReportAgentState_(state);

    scheduleDeliveryCheck_();
    Logger.log('Report agent fired: ' + fire.sessionUrl);

  } catch (error) {
    state.status = REPORT_AGENT.STATUS.FIRE_FAILED;
    state.error = error.message;
    saveReportAgentState_(state);

    sendTelegramAlert_(
      'Не удалось запустить агента для отчёта №' + state.reportId + '.\n' +
      error.message + '\n\nПовторить: меню «' + REPORT_AGENT.MENU.RETRY + '».'
    );
    throw error;
  }
}

// ============================================================================
// ВЫЗОВ API-ТРИГГЕРА
// ============================================================================

/**
 * POST /fire. Поля передаются агенту строками «ключ=значение»;
 * платформа помечает их как недоверенные данные.
 *
 * @param {Object<string, string|number>} fields
 * @returns {{sessionId: string, sessionUrl: string}}
 */
function fireReportAgent_(fields) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty(SCRIPT_PROPS.FIRE_URL);
  const token = props.getProperty(SCRIPT_PROPS.FIRE_TOKEN);

  const text = Object.keys(fields)
    .map(function(key) { return key + '=' + fields[key]; })
    .join('\n');

  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + token,
        'anthropic-beta': REPORT_AGENT.ANTHROPIC_BETA,
        'anthropic-version': REPORT_AGENT.ANTHROPIC_VERSION
      },
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch (error) {
    throw new Error('Запуск агента: сеть — ' + redact_(error.message, [token]));
  }

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(
      'Запуск агента: HTTP ' + code + ' — ' + redact_(body, [token]).slice(0, 300)
    );
  }

  const json = JSON.parse(body);
  return {
    sessionId: json.claude_code_session_id || '',
    sessionUrl: json.claude_code_session_url || ''
  };
}

// ============================================================================
// КОНТРОЛЬ ДОСТАВКИ
// ============================================================================

/**
 * Создаёт одну отложенную проверку доставки.
 */
function scheduleDeliveryCheck_() {
  deleteDeliveryCheckTriggers_();
  ScriptApp.newTrigger(REPORT_AGENT.CHECK_HANDLER)
    .timeBased()
    .after(REPORT_AGENT.DELIVERY_CHECK_MINUTES * 60 * 1000)
    .create();
}

/**
 * Удаляет триггеры проверки доставки.
 */
function deleteDeliveryCheckTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === REPORT_AGENT.CHECK_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Проверяет, дошёл ли отчёт; при сбое отправляет предупреждение.
 *
 * Порядок: ответ Nodul → файл ошибки агента → HTML без доставки → ничего.
 */
function checkReportDelivered_() {
  deleteDeliveryCheckTriggers_();

  const state = getReportAgentState_();
  const waiting = [REPORT_AGENT.STATUS.FIRED, REPORT_AGENT.STATUS.RESENT];
  if (!state || waiting.indexOf(state.status) < 0) {
    Logger.log('Delivery check: nothing to check');
    return;
  }

  const id = state.reportId;
  const folder = DriveApp.getFolderById(state.folderId);
  const htmlFile = findFileInFolder_(folder, reportFileName_(REPORT_AGENT.FILES.HTML, id));
  const errorFile = findFileInFolder_(folder, reportFileName_(REPORT_AGENT.FILES.ERROR, id));
  const responseFile = findFileInFolder_(
    getTelegramInboxFolder_(),
    reportFileName_(REPORT_AGENT.FILES.TELEGRAM_RESPONSE, id)
  );

  let alert = null;
  const session = state.sessionUrl ? '\nСессия агента: ' + state.sessionUrl : '';

  if (responseFile) {
    let delivery = {};
    try {
      delivery = JSON.parse(responseFile.getBlob().getDataAsString('UTF-8'));
    } catch (error) {
      delivery = { status: 'invalid_json' };
    }
    if (delivery.status === 'success') {
      state.status = REPORT_AGENT.STATUS.DELIVERED;
    } else {
      state.status = REPORT_AGENT.STATUS.DELIVERY_FAILED;
      alert = 'Отчёт №' + id + ' не доставлен: Nodul вернул статус «' +
        delivery.status + '».\nПовторить отправку: меню «' + REPORT_AGENT.MENU.RESEND + '».';
    }
  } else if (errorFile) {
    state.status = REPORT_AGENT.STATUS.AGENT_FAILED;
    alert = 'Агент не смог построить отчёт №' + id + '. Причина — в файле ' +
      errorFile.getName() + ' в папке отчёта.' + session;
  } else if (htmlFile) {
    state.status = REPORT_AGENT.STATUS.NOT_DELIVERED;
    alert = 'Отчёт №' + id + ' построен, но за ' + REPORT_AGENT.DELIVERY_CHECK_MINUTES +
      ' минут не доставлен в Telegram. Проверьте сценарий доставки в Nodul.' +
      '\nПовторить отправку: меню «' + REPORT_AGENT.MENU.RESEND + '».';
  } else {
    state.status = REPORT_AGENT.STATUS.NO_REPORT;
    alert = 'Агент не создал отчёт №' + id + ' за ' + REPORT_AGENT.DELIVERY_CHECK_MINUTES +
      ' минут.' + session + '\nПовторить: меню «' + REPORT_AGENT.MENU.RETRY + '».';
  }

  state.checkedAt = new Date().toISOString();
  saveReportAgentState_(state);
  Logger.log('Delivery check: ' + state.status);

  if (alert) {
    sendTelegramAlert_(alert);
  }
}

// ============================================================================
// ПРЕДУПРЕЖДЕНИЯ В TELEGRAM (решение D1)
// ============================================================================

/**
 * Отправляет предупреждение напрямую через Telegram Bot API.
 * Не зависит от Nodul. Ошибки не пробрасывает — только логирует без токена.
 *
 * @param {string} text
 * @returns {boolean} true — сообщение отправлено
 */
function sendTelegramAlert_(text) {
  const token = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.BOT_TOKEN);
  const chatId = getAlertChatId_();

  if (!token || !chatId) {
    Logger.log('Telegram alert skipped: нет ' + SCRIPT_PROPS.BOT_TOKEN + ' или получателя');
    return false;
  }

  try {
    const response = UrlFetchApp.fetch(REPORT_AGENT.TELEGRAM_API_URL + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: '⚠️ Family Budget\n\n' + text,
        disable_web_page_preview: true
      }),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('Telegram alert failed: HTTP ' + code + ' — ' +
        redact_(response.getContentText(), [token]).slice(0, 200));
      return false;
    }
    return true;
  } catch (error) {
    Logger.log('Telegram alert failed: ' + redact_(error.message, [token]));
    return false;
  }
}

// ============================================================================
// НАСТРОЙКА И СОСТОЯНИЕ
// ============================================================================

/**
 * Проверяет обязательные Script Properties. Значения не выводит.
 */
function assertReportAgentSetup_() {
  const problems = getReportAgentSetupProblems_();
  if (problems.length) {
    throw new Error('Агент не настроен:\n• ' + problems.join('\n• '));
  }
}

/**
 * @returns {Array<string>} список проблем настройки (пустой — всё в порядке)
 */
function getReportAgentSetupProblems_() {
  const props = PropertiesService.getScriptProperties();
  const problems = [];
  const url = props.getProperty(SCRIPT_PROPS.FIRE_URL);

  if (!url) {
    problems.push('нет свойства ' + SCRIPT_PROPS.FIRE_URL);
  } else if (url.indexOf(REPORT_AGENT.FIRE_URL_PREFIX) !== 0 || !/\/fire$/.test(url)) {
    problems.push(SCRIPT_PROPS.FIRE_URL + ' не похож на Fire URL задачи');
  }
  if (!props.getProperty(SCRIPT_PROPS.FIRE_TOKEN)) {
    problems.push('нет свойства ' + SCRIPT_PROPS.FIRE_TOKEN);
  }
  if (!props.getProperty(SCRIPT_PROPS.BOT_TOKEN)) {
    problems.push('нет свойства ' + SCRIPT_PROPS.BOT_TOKEN + ' (нужно для предупреждений)');
  }
  if (!getAlertChatId_()) {
    problems.push('в TELEGRAM.USERS нет пользователя ' + REPORT_AGENT.ALERT_USER_NAME);
  }
  return problems;
}

/**
 * @returns {Object|null}
 */
function getReportAgentState_() {
  const json = PropertiesService.getScriptProperties().getProperty(REPORT_AGENT.STATE_PROPERTY);
  if (!json) {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    Logger.log('Report agent state is invalid: ' + error.message);
    return null;
  }
}

/**
 * @param {Object} state
 */
function saveReportAgentState_(state) {
  PropertiesService.getScriptProperties()
    .setProperty(REPORT_AGENT.STATE_PROPERTY, JSON.stringify(state));
}

/**
 * Текст статуса для меню.
 *
 * @returns {string}
 */
function buildReportAgentStatusText_() {
  const state = getReportAgentState_();
  if (!state) {
    return 'Отчёты v1.0 ещё не запускались.';
  }
  const lines = [
    'Отчёт №' + state.reportId,
    'Статус: ' + (REPORT_AGENT.STATUS_TEXT[state.status] || state.status),
    'Начат: ' + state.startedAt
  ];
  if (state.firedAt) lines.push('Агент запущен: ' + state.firedAt);
  if (state.checkedAt) lines.push('Проверка доставки: ' + state.checkedAt);
  if (state.error) lines.push('\nОшибка: ' + state.error);
  if (state.sessionUrl) lines.push('\nСессия агента: ' + state.sessionUrl);
  if (state.folderUrl) lines.push('Папка отчёта: ' + state.folderUrl);
  return lines.join('\n');
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================================

/**
 * Имя файла по шаблону REPORT_AGENT.FILES.
 *
 * @param {string} template
 * @param {number|string} reportId
 * @returns {string}
 */
function reportFileName_(template, reportId) {
  return template.replace('{id}', String(reportId));
}

/**
 * Получатели отчёта. В TEST_MODE — только ALERT_USER_NAME.
 *
 * @returns {Array<{userId: string, chatId: string}>}
 */
function getDeliveryUsers_() {
  return TELEGRAM.USERS
    .filter(function(user) {
      return !REPORT_AGENT.TEST_MODE || user.name === REPORT_AGENT.ALERT_USER_NAME;
    })
    .map(function(user) {
      return { userId: String(user.userId), chatId: String(user.chatId) };
    });
}

/**
 * @returns {string|null} chat_id получателя предупреждений
 */
function getAlertChatId_() {
  for (let i = 0; i < TELEGRAM.USERS.length; i++) {
    if (TELEGRAM.USERS[i].name === REPORT_AGENT.ALERT_USER_NAME) {
      return String(TELEGRAM.USERS[i].chatId);
    }
  }
  return null;
}

/**
 * Удаляет секреты из текста перед логированием.
 *
 * @param {string} text
 * @param {Array<string>} secrets
 * @returns {string}
 */
function redact_(text, secrets) {
  let result = String(text || '');
  (secrets || []).forEach(function(secret) {
    if (secret) {
      result = result.split(secret).join('***');
    }
  });
  return result;
}

/**
 * Стенд №22. Установить только в привязанный проект тестовой копии Sheets.
 * Advanced Google Drive service v3 требуется для резервирования ID.
 */
const FBA22_STATE = 'FBA22_STATE';
const FBA22_CHECK = 'checkFba22Delivery';

function prepareFba22Run() {
  return withFba22Lock_((props, config) => {
    if (props.getProperty(FBA22_STATE)) throw new Error('FBA22_RUN_ALREADY_RESERVED');
    const state = { stage: 'PREPARING', runId: Utilities.getUuid() };
    saveFba22State_(props, state);
    state.reportId = createNewReport_().id;
    SpreadsheetApp.flush();
    if (!Number.isSafeInteger(state.reportId) || state.reportId < 1) throw new Error('FBA22_INVALID_REPORT_ID');
    return finishFba22Preparation_(props, config, state);
  });
}

function resumeFba22Preparation() {
  return withFba22Lock_((props, config) => {
    const state = readFba22State_(props);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SOURCE_SHEET_NAME);
    const block = getLastReportBlock_(sheet);
    // Единственный частично подготовленный запуск задачи №22.
    if (state.stage !== 'PREPARING' || !/^[0-9a-f-]{36}$/i.test(state.runId) ||
        block.reportId !== 11 || (state.reportId && state.reportId !== block.reportId)) {
      throw new Error('FBA22_RECOVERY_STATE_MISMATCH');
    }
    state.reportId = block.reportId;
    return finishFba22Preparation_(props, config, state);
  });
}

function finishFba22Preparation_(props, config, state) {
  SpreadsheetApp.flush();
  const name = 'report_data_' + state.reportId + '.json';
  if (fba22UniqueFile_(config.runFolderId, name)) {
    throw new Error('FBA22_EXISTING_EXPORT_REQUIRES_REVIEW');
  }
  const data = buildReportData_(state.reportId);
  if (data.schema !== 'report_data' || data.schema_version !== '1.0' ||
      data.report_id !== state.reportId) {
    throw new Error('FBA22_EXPORT_SCHEMA_MISMATCH');
  }
  const ids = Drive.Files.generateIds({ count: 1, space: 'drive' }).ids;
  if (ids?.length !== 1 || !ids[0]) throw new Error('FBA22_DRIVE_RESERVATION_FAILED');
  const blob = Utilities.newBlob(JSON.stringify(data, null, 1), 'application/json', name);
  const file = DriveApp.getFolderById(config.runFolderId).createFile(blob);
  const originalSha = fba22Sha256_(blob);
  if (!fba22OnlyParent_(file, config.runFolderId) || fba22Sha256_(file.getBlob()) !== originalSha) {
    throw new Error('FBA22_EXPORT_READBACK_MISMATCH');
  }
  state.dataId = file.getId();
  state.dataSha256 = originalSha;
  state.startId = ids[0];
  state.stage = 'PREPARED';
  saveFba22State_(props, state);
  return state;
}

function startFba22Run() {
  return withFba22Lock_((props, config) => {
    const state = readFba22State_(props);
    if (state.stage !== 'PREPARED') throw new Error('FBA22_START_NOT_PREPARED');
    const data = DriveApp.getFileById(state.dataId);
    if (data.isTrashed() || data.getName() !== 'report_data_' + state.reportId + '.json' ||
        !fba22OnlyParent_(data, config.runFolderId) ||
        fba22Sha256_(data.getBlob()) !== state.dataSha256) {
      throw new Error('FBA22_EXPORT_CHANGED');
    }
    const manifest = {
      schema: 'fba_agent_start', schema_version: '2.0', status: 'READY',
      run_id: state.runId, report_id: state.reportId,
      report_folder_id: config.finalFolderId, report_data_file_id: state.dataId,
      telegram_outbox_folder_id: config.outboxFolderId,
      created_at: new Date().toISOString()
    };
    const name = 'fba_work_start_' + state.runId + '.json';
    state.stage = 'WAITING_REPORT';
    state.startedAt = Date.now();
    saveFba22State_(props, state);
    ScriptApp.newTrigger(FBA22_CHECK).timeBased().everyMinutes(1).create();
    const created = Drive.Files.create(
      { id: state.startId, name: name, parents: [config.startFolderId] },
      Utilities.newBlob(JSON.stringify(manifest), 'application/json', name),
      { fields: 'id' }
    );
    if (created.id !== state.startId) throw new Error('FBA22_START_ID_MISMATCH');
    return state.stage;
  });
}

// One controlled continuation of the isolated report 11 after QA A01.
function resumeFba22DeliveryAfterQaA01() {
  return withFba22Lock_((props, config) => {
    const state = readFba22State_(props);
    if (state.reportId !== 11 || !state.startId || !state.runId ||
        !Number.isFinite(state.startedAt) || state.continuedQaAt ||
        state.requestId || state.requestAt ||
        !['WAITING_REPORT', 'REPORT_TIMEOUT'].includes(state.stage)) {
      throw new Error('FBA22_CONTINUATION_STATE_INVALID');
    }

    const start = fba22UniqueFile_(config.startFolderId, 'fba_work_start_' + state.runId + '.json');
    const evidence = fba22UniqueFile_(config.runFolderId, 'fba_build_evidence_' + state.runId + '_a02.json');
    if (!start || start.getId() !== state.startId || !evidence || evidence.getMimeType() !== 'application/json') {
      throw new Error('FBA22_CONTINUATION_ARTIFACT_MISSING');
    }
    const record = JSON.parse(evidence.getBlob().getDataAsString('UTF-8'));
    if (record.schema !== 'fba_build_evidence' || record.schema_version !== '1.0' ||
        record.attempt !== 2 || record.report_id !== 11 || record.run_id !== state.runId ||
        record.report_data_file_id !== state.dataId || record.report_data_sha256 !== state.dataSha256 ||
        record.continuation?.mode !== 'qa_only' || record.continuation.source_attempt !== 1 ||
        fba22UniqueFile_(config.finalFolderId, 'report_11.html') ||
        fba22UniqueFile_(config.outboxFolderId, 'telegram_request_11.json') ||
        fba22UniqueFile_(config.inboxFolderId, 'telegram_response_11.json') ||
        ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === FBA22_CHECK)) {
      throw new Error('FBA22_CONTINUATION_PREFLIGHT_FAILED');
    }

    const trigger = ScriptApp.newTrigger(FBA22_CHECK).timeBased().everyMinutes(1).create();
    try {
      state.continuationPreviousStage = state.stage;
      state.continuedQaAt = Date.now();
      state.stage = 'WAITING_REPORT';
      saveFba22State_(props, state);
    } catch (error) {
      ScriptApp.deleteTrigger(trigger);
      throw error;
    }
    return state.stage;
  });
}

function checkFba22Delivery() {
  return withFba22Lock_((props, config) => {
    const state = readFba22State_(props);
    const now = Date.now();
    if (state.stage === 'WAITING_REPORT' || state.stage === 'WAITING_DELIVERY') {
      try {
        const request = readFba22Json_(config.outboxFolderId,
          'telegram_request_' + state.reportId + '.json');
        if (request) {
          const recipient = request.users?.[0];
          const finalName = 'report_' + state.reportId + '.html';
          const finalFile = fba22UniqueFile_(config.finalFolderId, finalName);
          if (!finalFile || finalFile.getMimeType() !== 'text/html' ||
              request.htmlFileId !== finalFile.getId() || request.htmlFileName !== finalName ||
              request.reportId !== state.reportId ||
              typeof request.requestId !== 'string' ||
              !new RegExp('^tg_' + state.reportId + '_[0-9]{8}_[0-9]{6}$').test(request.requestId) ||
              !fba22PostStart_(request.timestamp, state.startedAt, now) ||
              request.users.length !== 1 ||
              String(recipient.userId) !== config.userId ||
              String(recipient.chatId) !== config.chatId ||
              (state.requestId && state.requestId !== request.requestId)) {
            throw new Error('FBA22_INVALID_REQUEST');
          }
          if (state.stage === 'WAITING_REPORT') {
            state.requestId = request.requestId;
            state.requestAt = Date.parse(request.timestamp);
            state.stage = 'WAITING_DELIVERY';
            saveFba22State_(props, state);
          }
          const response = readFba22Json_(config.inboxFolderId,
            'telegram_response_' + state.reportId + '.json');
          if (response) {
            if (!isFba22Delivered_(response, state, config.userId, now)) {
              throw new Error('FBA22_INVALID_RESPONSE');
            }
            state.stage = 'delivered';
          }
        } else if (state.stage === 'WAITING_DELIVERY') {
          throw new Error('FBA22_REQUEST_MISSING');
        }
        if (state.stage === 'WAITING_REPORT' && now - (state.continuedQaAt || state.startedAt) >= config.reportMinutes * 60000) {
          state.stage = 'REPORT_TIMEOUT';
        }
        if (state.stage === 'WAITING_DELIVERY' && now - state.requestAt >= config.deliveryMinutes * 60000) {
          state.stage = 'DELIVERY_UNCERTAIN';
        }
      } catch (error) {
        state.stage = 'EVIDENCE_REQUIRES_REVIEW';
      }
      saveFba22State_(props, state);
    }
    if (state.stage !== 'WAITING_REPORT' && state.stage !== 'WAITING_DELIVERY') {
      stopFba22DeliveryCheck();
    }
    return state.stage;
  });
}

function stopFba22DeliveryCheck() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === FBA22_CHECK)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function isFba22Delivered_(response, state, userId, now) {
  const result = response.results?.[0];
  const summary = response.summary;
  return response.requestId === state.requestId && response.status === 'success' &&
    Array.isArray(response.results) && response.results.length === 1 &&
    String(result?.userId) === userId && result?.status === 'success' &&
    /^[1-9][0-9]*$/.test(String(result?.messageId)) &&
    summary?.total === 1 && summary.success === 1 && summary.error === 0 &&
    fba22PostStart_(response.timestamp, state.requestAt, now);
}

function fba22PostStart_(value, earliest, now) {
  const time = Date.parse(value);
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && time >= earliest && time <= now;
}

function fba22UniqueFile_(folderId, name) {
  const files = DriveApp.getFolderById(folderId).getFilesByName(name);
  const file = files.hasNext() ? files.next() : null;
  if (file && (file.isTrashed() || !fba22OnlyParent_(file, folderId) || files.hasNext())) {
    throw new Error('FBA22_AMBIGUOUS_FILE');
  }
  return file;
}

function readFba22Json_(folderId, name) {
  const file = fba22UniqueFile_(folderId, name);
  if (!file) return null;
  if (file.getMimeType() !== 'text/plain') throw new Error('FBA22_UNEXPECTED_MIME');
  const value = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('FBA22_INVALID_JSON');
  return value;
}

function fba22OnlyParent_(file, id) {
  const parents = file.getParents();
  return parents.hasNext() && parents.next().getId() === id && !parents.hasNext();
}

function fba22Sha256_(blob) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, blob.getBytes())
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
}

function withFba22Lock_(operation) {
  const props = PropertiesService.getScriptProperties();
  const config = JSON.parse(props.getProperty('FBA22_CONFIG') || '{}');
  const sheetId = SpreadsheetApp.getActiveSpreadsheet()?.getId();
  const folderIds = [config.startFolderId, config.runFolderId, config.finalFolderId,
    config.outboxFolderId, config.inboxFolderId];
  if (!sheetId || sheetId !== config.testSpreadsheetId || sheetId === config.productionSpreadsheetId ||
      !config.productionSpreadsheetId || !config.testRootFolderId || folderIds.some(id => typeof id !== 'string' || !id) ||
      new Set(folderIds).size !== folderIds.length ||
      typeof config.userId !== 'string' || !config.userId ||
      typeof config.chatId !== 'string' || !config.chatId ||
      ![config.reportMinutes, config.deliveryMinutes].every(n => Number.isInteger(n) && n > 0)) {
    throw new Error('FBA22_TEST_CONFIG_REQUIRED');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!folderIds.every(id => {
      const folder = DriveApp.getFolderById(id);
      return !folder.isTrashed() && fba22OnlyParent_(folder, config.testRootFolderId);
    })) throw new Error('FBA22_TEST_FOLDER_MISMATCH');
    return operation(props, config);
  } finally {
    lock.releaseLock();
  }
}

function readFba22State_(props) {
  return JSON.parse(props.getProperty(FBA22_STATE) || '{}');
}

function saveFba22State_(props, state) {
  props.setProperty(FBA22_STATE, JSON.stringify(state));
}

function testFba22DeliveryEvidence() {
  const state = { requestId: 'tg_999_20261126_120000', requestAt: Date.parse('2026-11-26T09:00:00Z') };
  const timestamp = '2026-11-26T09:01:00Z';
  const now = Date.parse(timestamp);
  const result = { userId: 'fixture', status: 'success', messageId: 123 };
  const response = {
    requestId: state.requestId, status: 'success', results: [result], timestamp,
    summary: { total: 1, success: 1, error: 0 }
  };
  const rejected = [
    { ...response, requestId: 'other' },
    { ...response, results: [{ ...result, userId: 'other' }] },
    { ...response, results: [{ ...result, messageId: null }] },
    { ...response, summary: { total: 2, success: 2, error: 0 } },
    { ...response, timestamp: '2026-11-25T09:00:00Z' }
  ];
  if (!isFba22Delivered_(response, state, 'fixture', now) ||
      rejected.some(value => isFba22Delivered_(value, state, 'fixture', now))) {
    throw new Error('FBA22_ACK_TEST_FAILED');
  }
  return 'FBA22_ACK_TEST_OK';
}

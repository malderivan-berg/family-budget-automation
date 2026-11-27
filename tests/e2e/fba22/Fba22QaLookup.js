/**
 * Временный read-only endpoint для тестового проекта FBA №22.
 * Установка и откат описаны в docs/FBA_TASK_22_E2E.md.
 */
function doPost(event) {
  let result = { ok: false, error: 'FBA22_QA_LOOKUP_DENIED' };
  try {
    const body = event?.postData?.contents;
    if (event.queryString || event.pathInfo || typeof body !== 'string' || body.length > 1024) {
      throw new Error('INVALID_REQUEST');
    }
    result = fba22QaLookup_(JSON.parse(body), Date.now());
  } catch (_) {
    // Не возвращаем входные данные или ошибки Drive.
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function fba22QaLookup_(request, now) {
  const windowMs = 120000;
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  const driveId = /^[A-Za-z0-9_-]{1,160}$/;
  const hex256 = /^[0-9a-f]{64}$/;
  if (!request || Object.keys(request).length !== 7 || request.version !== 1 ||
      typeof request.runId !== 'string' || !uuid.test(request.runId) ||
      !Number.isInteger(request.attempt) || request.attempt < 1 || request.attempt > 4 ||
      typeof request.candidateId !== 'string' || !driveId.test(request.candidateId) ||
      !Number.isSafeInteger(request.timestamp) || Math.abs(now - request.timestamp) > windowMs ||
      typeof request.nonce !== 'string' || !uuid.test(request.nonce) ||
      typeof request.signature !== 'string' || !hex256.test(request.signature)) {
    throw new Error('INVALID_REQUEST');
  }
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('FBA22_QA_LOOKUP_KEY');
  if (!key || !hex256.test(key)) throw new Error('DISABLED');
  const signed = JSON.stringify([
    'fba22-qa-lookup-v1', 11, request.runId, request.attempt, request.candidateId,
    request.timestamp, request.nonce
  ]);
  const signature = Utilities.computeHmacSha256Signature(signed, key, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
  let difference = 0;
  for (let i = 0; i < signature.length; i++) {
    difference |= signature.charCodeAt(i) ^ request.signature.charCodeAt(i);
  }
  if (difference) throw new Error('INVALID_SIGNATURE');

  const config = JSON.parse(props.getProperty('FBA22_QA_LOOKUP_CONFIG') || '{}');
  const runConfig = JSON.parse(props.getProperty('FBA22_CONFIG') || '{}');
  const { folderId, expiresAt } = config;
  if (typeof folderId !== 'string' || !driveId.test(folderId) ||
      !Number.isSafeInteger(expiresAt) || now >= expiresAt ||
      !runConfig.testRootFolderId || folderId === runConfig.testRootFolderId ||
      [runConfig.startFolderId, runConfig.runFolderId, runConfig.finalFolderId,
        runConfig.outboxFolderId, runConfig.inboxFolderId].includes(folderId)) {
    throw new Error('DISABLED');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const state = readFba22State_(props);
    if (state.stage !== 'WAITING_REPORT' || state.reportId !== 11 || state.runId !== request.runId) {
      throw new Error('CONTEXT_MISMATCH');
    }
    const nonceKey = 'FBA22_QA_LOOKUP_NONCES';
    const nonces = JSON.parse(props.getProperty(nonceKey) || '{}');
    for (const nonce of Object.keys(nonces)) {
      if (nonces[nonce] < now) delete nonces[nonce];
    }
    if (Object.prototype.hasOwnProperty.call(nonces, request.nonce) ||
        Object.keys(nonces).length >= 64) {
      throw new Error('NONCE_REJECTED');
    }
    nonces[request.nonce] = request.timestamp + windowMs;
    props.setProperty(nonceKey, JSON.stringify(nonces));
  } finally {
    lock.releaseLock();
  }

  const folder = Drive.Files.get(folderId, { fields: 'id,mimeType,parents,trashed' });
  if (folder?.id !== folderId || folder.trashed !== false ||
      folder.mimeType !== 'application/vnd.google-apps.folder' ||
      folder.parents?.length !== 1 || folder.parents[0] !== runConfig.testRootFolderId) {
    throw new Error('INVALID_FOLDER');
  }
  const candidate = Drive.Files.get(request.candidateId, { fields: 'id,name,mimeType,parents,trashed' });
  if (candidate?.id !== request.candidateId || candidate.trashed !== false ||
      candidate.mimeType !== 'text/html' ||
      candidate.parents?.length !== 1 || candidate.parents[0] !== folderId) {
    throw new Error('INVALID_CANDIDATE');
  }
  const suffix = request.runId + '_a' + String(request.attempt).padStart(2, '0') + '.json';
  return {
    ok: true, version: 1, reportId: 11, runId: request.runId, attempt: request.attempt,
    nonce: request.nonce,
    candidatePage: { files: [candidate] },
    resultPage: fba22QaFind_(folderId, 'fba_layout_result_' + suffix),
    receiptPage: fba22QaFind_(folderId, 'fba_signal_sent_' + suffix)
  };
}

function fba22QaFind_(folderId, name) {
  const options = {
    q: "'" + folderId + "' in parents and name = '" + name + "' and trashed = false",
    corpora: 'user',
    spaces: 'drive',
    fields: 'kind,nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed)'
  };
  const files = [];
  const tokens = new Set();
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = Drive.Files.list(options);
    if (page?.kind !== 'drive#fileList' || !Array.isArray(page.files) ||
        (page.incompleteSearch !== undefined && page.incompleteSearch !== false)) {
      throw new Error('INCOMPLETE_SEARCH');
    }
    for (const file of page.files) {
      if (file?.name !== name || typeof file.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(file.id) ||
          file.trashed !== false || file.parents?.length !== 1 || file.parents[0] !== folderId ||
          !['application/json', 'text/plain'].includes(file.mimeType)) {
        throw new Error('INVALID_METADATA');
      }
      files.push(file);
      if (files.length > 1) throw new Error('AMBIGUOUS_SEARCH');
    }
    const token = page.nextPageToken;
    if (token === undefined) return { files };
    if (typeof token !== 'string' || !token.trim() || tokens.has(token)) {
      throw new Error('INCOMPLETE_SEARCH');
    }
    tokens.add(token);
    options.pageToken = token;
  }
  throw new Error('INCOMPLETE_SEARCH');
}

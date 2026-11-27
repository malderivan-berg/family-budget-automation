// N02 integration for the isolated FBA task 22. See PR #13 for replayGate.
// Изолированный N02. Метаданные должны происходить из Drive, отдельно от JSON заявки.
function replayGate({
  request, requestFileId, candidate, results, receipts, eventId, delivery
}) {
  if (!Array.isArray(results) || !Array.isArray(receipts) ||
      results.length > 1 || receipts.length > 1) {
    throw new Error('QA_LOOKUP_AMBIGUOUS');
  }
  if (!requestFileId || !request?.candidate_file_id ||
      candidate?.id !== request.candidate_file_id || candidate.trashed !== false ||
      candidate.mimeType !== 'text/html' || !request.candidate_file_name ||
      candidate.name !== request.candidate_file_name || !request.qa_folder_id ||
      !Array.isArray(candidate.parents) || !candidate.parents.includes(request.qa_folder_id)) {
    throw new Error('QA_CANDIDATE_METADATA_MISMATCH');
  }
  if (!results.length) {
    if (receipts.length) throw new Error('QA_RECEIPT_WITHOUT_RESULT');
    return { action: 'VALIDATE' };
  }

  const { id: validationFileId, text } = results[0];
  if (!validationFileId || typeof text !== 'string') throw new Error('QA_RESULT_UNREADABLE');
  const result = JSON.parse(text);
  if (result?.request_file_id !== requestFileId) throw new Error('QA_REQUEST_FILE_ID_MISMATCH');
  if (Object.hasOwn(result, 'candidate_file_id') && result.candidate_file_id !== candidate.id) {
    throw new Error('QA_RESULT_CANDIDATE_FILE_ID_MISMATCH');
  }
  const attempt = request.attempt;
  const hash = request.candidate_sha256;
  const requestId = `FBA_R${request.report_id}_${request.run_id}_A${String(attempt).padStart(2, '0')}`;
  const event = result.status === 'PASS_GEOMETRY' ? 'VALIDATED'
    : result.status === 'FAIL_GEOMETRY' ? (attempt < 4 ? 'REPAIR' : 'EXCEPTION') : null;
  if (result.schema !== 'fba_layout_result' || result.schema_version !== '2.0' ||
      !request.run_id || !Number.isInteger(request.report_id) || request.report_id < 1 ||
      !Number.isInteger(attempt) || attempt < 1 || attempt > 4 ||
      result.max_attempts !== 4 || result.attempt !== attempt ||
      result.run_id !== request.run_id || result.report_id !== request.report_id ||
      request.request_id !== requestId || result.request_id !== requestId ||
      typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash) ||
      result.candidate_sha256?.toLowerCase() !== hash.toLowerCase() ||
      !event || result.event !== event || !/^[a-f0-9]{64}$/i.test(eventId ?? '')) {
    throw new Error('QA_RESULT_INCONSISTENT');
  }
  const [receipt] = receipts;
  if (receipts.length === 1) {
    if (receipt?.schema !== 'fba_signal_receipt' || receipt.event_id !== eventId ||
        receipt.request_id !== requestId || receipt.validation_file_id !== validationFileId) {
      throw new Error('QA_RECEIPT_INCONSISTENT');
    }
    return { action: 'SKIP' };
  }

  // RESEND выбирает существующий результат. Для Outlook требуется отдельное разрешение.
  if (delivery?.eventId !== eventId ||
      delivery.outlookHistory !== 'CONFIRMED_NOT_SENT' || delivery.gmail !== 'NOT_FOUND') {
    throw new Error('QA_DELIVERY_UNCERTAIN');
  }
  return { action: 'RESEND', existingResultJson: text, validationFileId, eventId };
}

function exactEntry(page, name, folderId, mimeTypes) {
  if (!page || !Array.isArray(page.files) || page.nextPageToken ||
      (page.incompleteSearch !== undefined && page.incompleteSearch !== false)) {
    throw new Error('QA_LOOKUP_INCOMPLETE');
  }
  const matches = page.files.filter(file => file?.name === name);
  if (matches.length > 1) throw new Error('QA_LOOKUP_AMBIGUOUS');
  const [file] = matches;
  if (!file) return null;
  if (typeof file.id !== 'string' || !file.id || file.trashed !== false ||
      !mimeTypes.includes(file.mimeType) || file.parents?.length !== 1 ||
      file.parents[0] !== folderId) {
    throw new Error('QA_LOOKUP_METADATA_MISMATCH');
  }
  return file;
}

function readMatchedFile(file, downloaded) {
  if (!file && downloaded == null) return null;
  if (!file || !downloaded || downloaded.id !== file.id ||
      typeof downloaded.text !== 'string' || !downloaded.text.trim()) {
    throw new Error('QA_DOWNLOAD_ID_MISMATCH');
  }
  return downloaded.text;
}

export default function evaluateQaReplay(context, sha256) {
  const { request, requestFileId, trustedFolderId, trustedRunId, candidatePage, resultPage,
    receiptPage, resultDownload, receiptDownload } = context;
  if (typeof trustedFolderId !== 'string' || !trustedFolderId ||
      request?.qa_folder_id !== trustedFolderId || request.run_id !== trustedRunId ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(request.run_id ?? '') ||
      !Number.isInteger(request.attempt) || request.attempt < 1 || request.attempt > 4 ||
      !Number.isSafeInteger(request.report_id) || request.report_id !== 11 ||
      typeof requestFileId !== 'string' || !requestFileId) {
    throw new Error('QA_CONTEXT_MISMATCH');
  }
  const suffix = request.run_id + '_a' + String(request.attempt).padStart(2, '0') + '.json';
  const jsonMimes = ['application/json', 'text/plain'];
  const candidate = exactEntry(candidatePage, request.candidate_file_name, trustedFolderId, ['text/html']);
  const result = exactEntry(resultPage, 'fba_layout_result_' + suffix, trustedFolderId, jsonMimes);
  const receipt = exactEntry(receiptPage, 'fba_signal_sent_' + suffix, trustedFolderId, jsonMimes);
  const resultText = readMatchedFile(result, resultDownload);
  const receiptText = readMatchedFile(receipt, receiptDownload);
  let eventId;
  if (resultText) {
    const parsed = JSON.parse(resultText);
    eventId = sha256(JSON.stringify([
      parsed.run_id, parsed.request_id, parsed.event,
      String(parsed.candidate_sha256 ?? '').toLowerCase()
    ]));
  }
  return replayGate({
    request,
    requestFileId,
    candidate,
    results: result ? [{ id: result.id, text: resultText }] : [],
    receipts: receipt ? [JSON.parse(receiptText)] : [],
    eventId
  });
}

/**
 * Читает все страницы точного поиска в доверенной тестовой папке.
 * getDriveJson получает URL и возвращает исходный JSON успешного Drive API GET.
 * OAuth и проверка HTTP-статуса остаются в транспортном слое.
 */
export async function listFba22DriveMatches({ folderId, name, getDriveJson }) {
  if (typeof folderId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(folderId) ||
      typeof name !== 'string' || !name.trim() || typeof getDriveJson !== 'function') {
    throw new Error('QA_LOOKUP_INPUT_INVALID');
  }
  const escapedName = name.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `'${folderId}' in parents and name = '${escapedName}' and trashed = false`);
  url.searchParams.set('corpora', 'user');
  url.searchParams.set('spaces', 'drive');
  url.searchParams.set('fields', 'kind,nextPageToken,incompleteSearch,files(id,name,parents,mimeType,trashed)');

  const files = [];
  const seenTokens = new Set();
  // Для точного имени в изолированной папке больше десяти страниц — аномалия.
  for (let pageNumber = 1; pageNumber <= 10; pageNumber++) {
    const page = await getDriveJson(url.href);
    if (page?.kind !== 'drive#fileList' || !Array.isArray(page.files) ||
        (page.incompleteSearch !== undefined && page.incompleteSearch !== false)) {
      throw new Error('QA_LOOKUP_INCOMPLETE');
    }
    for (const file of page.files) {
      if (file?.name !== name || file.trashed !== false ||
          !Array.isArray(file.parents) || file.parents.length !== 1 || file.parents[0] !== folderId ||
          typeof file.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(file.id)) {
        throw new Error('QA_LOOKUP_METADATA_MISMATCH');
      }
      files.push(file);
      if (files.length > 1) throw new Error('QA_LOOKUP_AMBIGUOUS');
    }
    const token = page.nextPageToken;
    if (token === undefined) return { files };
    if (typeof token !== 'string' || !token.trim() || seenTokens.has(token)) {
      throw new Error('QA_LOOKUP_INCOMPLETE');
    }
    seenTokens.add(token);
    url.searchParams.set('pageToken', token);
  }
  throw new Error('QA_LOOKUP_INCOMPLETE');
}

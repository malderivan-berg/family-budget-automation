import { createHmac, randomUUID } from 'node:crypto';

// Ключ передаётся из хранилища Nodul и не входит в возвращаемый объект.
export function signQaLookup({ runId, attempt, candidateId }, key) {
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) {
    throw new Error('FBA22_QA_LOOKUP_KEY_REQUIRED');
  }
  const timestamp = Date.now();
  const nonce = randomUUID();
  const message = JSON.stringify(['fba22-qa-lookup-v1', 11, runId, attempt, candidateId, timestamp, nonce]);
  const signature = createHmac('sha256', key).update(message, 'utf8').digest('hex');
  return { version: 1, runId, attempt, candidateId, timestamp, nonce, signature };
}

export function readQaLookup(response, request) {
  if (response?.ok !== true || response.version !== request.version || response.reportId !== 11 ||
      response.runId !== request.runId || response.attempt !== request.attempt ||
      response.nonce !== request.nonce ||
      response.candidatePage?.files?.[0]?.id !== request.candidateId ||
      response.candidatePage.files.length !== 1 ||
      !Array.isArray(response.resultPage?.files) || !Array.isArray(response.receiptPage?.files)) {
    throw new Error('FBA22_QA_LOOKUP_DENIED');
  }
  const { candidatePage, resultPage, receiptPage } = response;
  return { candidatePage, resultPage, receiptPage };
}

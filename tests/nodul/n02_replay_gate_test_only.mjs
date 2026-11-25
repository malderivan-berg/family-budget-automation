// Изолированный N02. Метаданные должны происходить из Drive, отдельно от JSON заявки.
export default function replayGate({
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

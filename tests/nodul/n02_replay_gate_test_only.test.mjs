import assert from 'node:assert/strict';
import gate from './n02_replay_gate_test_only.mjs';
const request = {run_id:'test-run',report_id:999921,attempt:1,request_id:'FBA_R999921_test-run_A01',candidate_sha256:'a'.repeat(64),candidate_file_id:'candidate',candidate_file_name:'candidate.html',qa_folder_id:'folder'};
const candidate={id:'candidate',name:'candidate.html',mimeType:'text/html',trashed:false,parents:['folder']};
const result={...request,request_file_id:'request',schema:'fba_layout_result',schema_version:'2.0',status:'PASS_GEOMETRY',event:'VALIDATED',max_attempts:4};
const eventId='b'.repeat(64);
const receipt={schema:'fba_signal_receipt',event_id:eventId,request_id:request.request_id,validation_file_id:'result'};
const input={request,requestFileId:'request',candidate,results:[{id:'result',text:JSON.stringify(result)}],receipts:[receipt],eventId};
assert.equal(gate(input).action,'SKIP');
const delivery={eventId,outlookHistory:'CONFIRMED_NOT_SENT',gmail:'NOT_FOUND'};
assert.equal(gate({...input,receipts:[],delivery}).existingResultJson,input.results[0].text);
assert.equal(gate({...input,receipts:[],delivery}).action,'RESEND');
const {candidate_file_id: omitted, ...legacy}=result;
assert.equal(gate({...input,results:[{id:'result',text:JSON.stringify(legacy)}]}).action,'SKIP');
for (const [patch,error] of [
  [{requestFileId:'copy'},/REQUEST_FILE_ID/],
  [{candidate:{...candidate,id:'substituted'}},/CANDIDATE_METADATA/],
  [{results:[{id:'result',text:JSON.stringify({...result,candidate_file_id:'substituted'})}]},/RESULT_CANDIDATE_FILE_ID/],
  [{receipts:[{...receipt,event_id:'c'.repeat(64)}]},/RECEIPT_INCONSISTENT/],
  [{receipts:[{...receipt,request_id:'other'}]},/RECEIPT_INCONSISTENT/],
  [{receipts:[{...receipt,validation_file_id:'other'}]},/RECEIPT_INCONSISTENT/],
  [{receipts:[receipt,receipt]},/LOOKUP_AMBIGUOUS/],
  [{receipts:[]},/DELIVERY_UNCERTAIN/],
  [{receipts:[],delivery:{...delivery,outlookHistory:'UNKNOWN'}},/DELIVERY_UNCERTAIN/],
  [{receipts:[],delivery:{...delivery,gmail:'FOUND'}},/DELIVERY_UNCERTAIN/]
]) assert.throws(()=>gate({...input,...patch}),error);
assert.equal(gate({...input,results:[],receipts:[]}).action,'VALIDATE');
console.log('14 проверок пройдено');

const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const vm=require('node:vm');
const now=1800000000000, key='a'.repeat(64), runId='00000000-0000-4000-8000-000000000001';
const folderId='test-qa', root='test-root', candidateId='test-candidate';
const state={stage:'WAITING_REPORT',reportId:11,runId};
const candidate={id:candidateId,name:'test.html',mimeType:'text/html',parents:[folderId],trashed:false};
const page=(files=[],extra={})=>({kind:'drive#fileList',files,...extra});
const result={id:'test-result',name:'fba_layout_result_'+runId+'_a01.json',mimeType:'application/json',parents:[folderId],trashed:false};
const body={version:1,runId,attempt:1,candidateId,timestamp:now,nonce:'00000000-0000-4000-8000-000000000002'};
const sign=r=>createHmac('sha256',key).update(JSON.stringify(['fba22-qa-lookup-v1',11,r.runId,r.attempt,r.candidateId,r.timestamp,r.nonce])).digest('hex');
const request=(patch={})=>{const r={...body,...patch}; return {...r,signature:sign(r)};};
function fixture({pages=[page(),page()], storedState=state, folderParent=root, candidateData=candidate, expiresAt=now+60000}={}){
  const prop=new Map([
    ['FBA22_QA_LOOKUP_KEY',key],
    ['FBA22_QA_LOOKUP_CONFIG',JSON.stringify({folderId,expiresAt})],
    ['FBA22_CONFIG',JSON.stringify({testRootFolderId:root})]
  ]);
  const calls=[];
  const ctx=vm.createContext({
    Date:{now:()=>now},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>prop.get(k),setProperty:(k,v)=>prop.set(k,v)})},
    Utilities:{Charset:{UTF_8:'UTF_8'},computeHmacSha256Signature:(value,secret)=>Array.from(createHmac('sha256',secret).update(value).digest())},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})},
    readFba22State_:()=>storedState,
    Drive:{Files:{
      get(id){calls.push(id);return id===folderId?{id,mimeType:'application/vnd.google-apps.folder',parents:[folderParent],trashed:false}:candidateData;},
      list(opt){calls.push({...opt});if(!pages.length)throw Error('unexpected page');return pages.shift();}
    }}
  });
  vm.runInContext(readFileSync(process.argv[2],'utf8'),ctx);
  return {run:(r=request())=>ctx.doPost({postData:{contents:JSON.stringify(r)}}),calls};
}
const deny = {ok:false,error:'FBA22_QA_LOOKUP_DENIED'};
const paginated=fixture({pages:[page([],{nextPageToken:'next'}),page([result]),page()]});
assert.equal(paginated.run().resultPage.files[0].id,result.id);
assert.equal(paginated.calls[3].pageToken,'next');
assert.deepEqual(paginated.run(),deny);
for(const input of [request({timestamp:now-120001}),{...request(),signature:'0'.repeat(64)},request({runId:'00000000-0000-4000-8000-000000000003'}),request({folderId:'other-folder'})]){
  const probe=fixture();assert.deepEqual(probe.run(input),deny);assert.equal(probe.calls.length,0);
}
for(const opts of [
  {storedState:{...state,stage:'PREPARED'}},
  {expiresAt:now},
  {folderParent:'production'},
  {candidateData:{...candidate,parents:['production']}},
  {pages:[page([],{incompleteSearch:true})]},
  {pages:[page([result],{nextPageToken:'next'}),page([result])]},
  {pages:[page([],{nextPageToken:'loop'}),page([],{nextPageToken:'loop'})]},
  {pages:[{result:[]}]},
  {pages:[page([],{nextPageToken:'next'})]}
])assert.deepEqual(fixture(opts).run(),deny);
assert.deepEqual(fixture().run().resultPage.files,[]);
(async () => {
  const {pathToFileURL}=require('node:url');
  const {signQaLookup,readQaLookup}=await import(pathToFileURL(process.argv[3]).href);
  const signed=signQaLookup({runId,attempt:1,candidateId},key);
  assert.equal(signed.signature,sign(signed));
  const comparable={...signed,timestamp:now};
  comparable.signature=sign(comparable);
  const response=fixture().run(comparable);
  assert.equal(readQaLookup(response,comparable).candidatePage.files[0].id,candidateId);
  assert.throws(()=>readQaLookup({...response,nonce:body.nonce},comparable),/DENIED/);
  assert.throws(()=>readQaLookup(deny,comparable),/DENIED/);
  console.log('FBA22 QA lookup: 20 cases passed');
})().catch(err=>{console.error(err);process.exitCode=1;});

import assert from 'node:assert/strict';
import { listFba22DriveMatches } from './fba22_replay_context.mjs';

const folderId = 'test-folder';
const name = "report's\\draft.html";
const file = { id: 'test-file', name, parents: [folderId], mimeType: 'text/html', trashed: false };
const page = (files = [], fields = {}) => ({ kind: 'drive#fileList', files, ...fields });
const run = (pages, urls = []) => listFba22DriveMatches({
  folderId, name, getDriveJson: async href => {
    urls.push(new URL(href));
    const next = pages.shift();
    if (next instanceof Error) throw next;
    return next;
  }
});

const urls = [];
assert.deepEqual(await run([page([], { nextPageToken: 'continue' }), page([file])], urls), { files: [file] });
assert.equal(urls[0].origin, 'https://www.googleapis.com');
assert.equal(urls[0].searchParams.get('q'),
  "'test-folder' in parents and name = 'report\\'s\\\\draft.html' and trashed = false");
assert.equal(urls[0].searchParams.has('pageToken'), false);
assert.equal(urls[1].searchParams.get('pageToken'), 'continue');
assert.deepEqual(await run([page()]), { files: [] });
await assert.rejects(run([page([file], { nextPageToken: 'next' }), page([file])]), /QA_LOOKUP_AMBIGUOUS/);
await assert.rejects(run([page([], { incompleteSearch: true })]), /QA_LOOKUP_INCOMPLETE/);
await assert.rejects(run([page([], { incompleteSearch: 'false' })]), /QA_LOOKUP_INCOMPLETE/);
await assert.rejects(run([{ result: [] }]), /QA_LOOKUP_INCOMPLETE/);
await assert.rejects(run([page([], { nextPageToken: null })]), /QA_LOOKUP_INCOMPLETE/);
await assert.rejects(run([page([], { nextPageToken: 'repeat' }), page([], { nextPageToken: 'repeat' })]), /QA_LOOKUP_INCOMPLETE/);
await assert.rejects(run(Array.from({ length: 10 }, (_, i) => page([], { nextPageToken: String(i) }))), /QA_LOOKUP_INCOMPLETE/);
await assert.rejects(run([page([{ ...file, parents: ['wrong-folder'] }])]), /QA_LOOKUP_METADATA_MISMATCH/);
await assert.rejects(run([page([], { nextPageToken: 'next' }), new Error('HTTP 403')]), /HTTP 403/);
console.log('FBA22 Drive files.list: 11 сценариев пройдены');

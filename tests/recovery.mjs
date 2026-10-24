// Run with node --experimental-test-module-mocks tests/recovery.mjs
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { createHash } from 'node:crypto';

const blobs = new Map();
let writes = 0;
let failure = null;
mock.module('@vercel/blob', { namedExports: {
  get: async (key, options) => {
    assert.equal(options.access, 'private');
    assert.equal(options.useCache, false);
    if (failure === 'network') throw new Error('Synthetic storage outage');
    if (failure === 'status') return { statusCode: 304 };
    const value = blobs.get(key);
    return value === undefined ? null : { statusCode: 200, stream: new Response(value).body };
  },
  put: async (key, value, options) => {
    assert.equal(options.access, 'private');
    assert.equal(options.addRandomSuffix, false);
    writes++;
    blobs.set(key, value);
  },
} });
process.env.VERCEL = '1';
delete process.env.BLOB_STORE_ID;
delete process.env.BLOB_READ_WRITE_TOKEN;
const { handleApiRequest } = await import('../server/shared/api-handler.js');
const email = 'business@example.invalid';
const phone = '0752220401';
const key = (number) => `business/${createHash('sha256').update(`${email}|${number}`).digest('hex')}.json`;
async function call(path, method = 'GET', body, identity = { email, phone }) {
  const response = await handleApiRequest(new Request(`https://example.invalid/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-QuoteFlow-Business-Email': identity.email, 'X-QuoteFlow-Business-Phone': identity.phone },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
const claim = (extra = {}) => call('business-identity', 'POST', { email, phone, ...extra });
assert.equal((await claim({ createIfMissing: true })).status, 503);
assert.equal(writes, 0, 'missing configuration cannot create local workspace');
process.env.BLOB_READ_WRITE_TOKEN = 'synthetic-test-token';
assert.equal((await claim()).status, 404);
assert.equal(writes, 0);
const created = await claim({ createIfMissing: true, seed: {
  businessProfile: { email, phone, name: 'Saved business', bankDetails: 'Preserved account' },
  clients: [{ id: 'client-a', name: 'ABC Company' }],
  catalog: [{ id: 'catalog-a', name: 'Banner' }],
  nextNumbers: { invoice: 20, quotation: 30 },
} });
assert.equal(created.status, 200);
assert.equal(created.data.workspaceExists, false);
for (const type of ['invoice', 'quotation']) {
  assert.equal((await call('documents', 'POST', { id: type, type, client: { name: 'ABC Company' }, items: [{ name: 'Banner', description: 'Outdoor printing', quantity: 2, unitPrice: 150 }] })).status, 201);
}
const saved = (await call('bootstrap')).data;
const beforeRecoveryWrites = writes;
for (const variant of ['0752220401', '+255752220401', '255752220401', '752220401']) {
  const result = await call('business-identity', 'POST', { email: `  ${email.toUpperCase()}  `, phone: variant, seed: { documents: [] } });
  assert.equal(result.status, 200);
  assert.equal(result.data.workspaceExists, true);
  assert.deepEqual(result.data.documents, saved.documents);
  assert.deepEqual(result.data.nextNumbers, saved.nextNumbers);
  assert.deepEqual(result.data.clients, saved.clients);
  assert.deepEqual(result.data.catalog, saved.catalog);
  assert.equal(result.data.businessProfile.name, 'Saved business');
}
assert.equal(writes, beforeRecoveryWrites, 'recovery must be read-only');
assert.equal((await call('bootstrap', 'GET', null, { email, phone: '0752220402' })).status, 404);
assert.equal((await call('bootstrap', 'GET', null, { email: 'other@example.invalid', phone })).status, 404);
for (const mode of ['network', 'status']) {
  failure = mode;
  assert.ok((await claim({ createIfMissing: true })).status >= 500);
  assert.equal(writes, beforeRecoveryWrites);
}
failure = null;
const original = blobs.get(key('255752220401'));
blobs.set(key('255752220401'), '{invalid');
assert.equal((await claim({ createIfMissing: true })).status, 409);
blobs.set(key('255752220401'), 'null');
assert.equal((await claim({ createIfMissing: true })).status, 409);
blobs.set(key('255752220401'), JSON.stringify({ version: 4, identity: { email, phone } }));
assert.equal((await claim({ createIfMissing: true })).status, 409);
blobs.set(key('255752220401'), JSON.stringify({ ...JSON.parse(original), identity: { email: 'wrong@example.invalid', phone } }));
assert.equal((await claim()).status, 409);
blobs.delete(key('255752220401'));
blobs.set(key('0752220401'), original);
assert.equal((await claim()).data.documents.length, 2);
// An accidentally created empty canonical workspace cannot hide populated legacy data.
blobs.set(key('255752220401'), JSON.stringify({ ...JSON.parse(original), documents: [], clients: [], catalog: [] }));
assert.equal((await claim()).data.documents.length, 2);
await call('documents/invoice', 'PUT', { notes: 'Legacy update' });
assert.equal(JSON.parse(blobs.get(key('0752220401'))).documents.find(d => d.id === 'invoice').notes, 'Legacy update');
assert.equal(JSON.parse(blobs.get(key('255752220401'))).documents.length, 0);
assert.equal((await call('documents/quotation/duplicate', 'POST', {})).status, 201);
assert.equal((await call('documents/quotation/convert', 'POST', {})).status, 201);
for (const via of ['pdf', 'whatsapp']) assert.equal((await call('documents/invoice/shared', 'POST', { via })).status, 200);
assert.equal((await call('documents/invoice', 'DELETE')).status, 204);
const afterDelete = (await call('bootstrap')).data;
assert.ok(!afterDelete.documents.some(d => d.id === 'invoice'));
assert.ok(afterDelete.nextNumbers.invoice >= saved.nextNumbers.invoice);
assert.ok(blobs.has(key('0752220401')), 'legacy file retained');
blobs.set(key('752220401'), original);
const beforeConflict = writes;
assert.equal((await claim()).status, 409);
assert.equal(writes, beforeConflict);
console.log('PASS: fresh identity requests, four phone forms, legacy paths, numbering, settings, wrong identities, corruption, outages, retry, unsupported migration and document actions.');

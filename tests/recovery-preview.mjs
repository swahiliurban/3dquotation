import assert from 'node:assert/strict';
import { handleRecoveryPreview } from '../server/recovery-preview.mjs';
const calls = [];
const payload = {
  businessProfile: { name: 'Saved business' }, clients: [], catalog: [],
  nextNumbers: { invoice: 101, quotation: 26 },
  documents: Array.from({ length: 125 }, (_, i) => ({ id: String(i), type: i < 100 ? 'invoice' : 'quotation' })),
};
const remote = async (url, options) => { calls.push({ url, options }); return Response.json(payload); };
const request = (path, method = 'GET', body) => new Request(`http://127.0.0.1/api/${path}`, {
  method, headers: { 'x-quoteflow-business-email': 'saved@example.invalid', 'x-quoteflow-business-phone': '+255752220401' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
for (const phone of ['0752220401', '+255752220401', '255752220401', '752220401']) {
  const response = await handleRecoveryPreview(request('business-identity', 'POST', { email: ' SAVED@example.invalid ', phone, seed: { documents: [] } }), remote);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.workspaceExists, true);
  assert.equal(result.documents.filter(d => d.type === 'invoice').length, 100);
  assert.equal(result.documents.filter(d => d.type === 'quotation').length, 25);
  assert.deepEqual(result.nextNumbers, payload.nextNumbers);
  assert.equal(calls.at(-1).options.method, 'GET');
  assert.equal(calls.at(-1).url, 'https://3dquotation.vercel.app/api/bootstrap');
  assert.equal(calls.at(-1).options.headers['X-QuoteFlow-Business-Phone'], '255752220401');
  assert.equal(calls.at(-1).options.body, undefined);
}
assert.deepEqual(await (await handleRecoveryPreview(request('bootstrap'), remote)).json(), payload);
const count = calls.length;
for (const [path, method, body] of [
  ['business-identity', 'POST', { email: 'saved@example.invalid', phone: '0752220401', createIfMissing: true }],
  ['documents', 'POST', {}], ['documents/1', 'PUT', {}], ['documents/1', 'DELETE'],
  ['business-settings', 'PUT', {}], ['documents/1/shared', 'POST', {}], ['documents/1/duplicate', 'POST', {}],
]) assert.equal((await handleRecoveryPreview(request(path, method, body), remote)).status, 405);
assert.equal(calls.length, count, 'no mutations reach production');
assert.equal((await handleRecoveryPreview(request('bootstrap'), async () => new Response('', { status: 404 }))).status, 404);
assert.equal((await handleRecoveryPreview(request('bootstrap'), async () => { throw new Error('offline'); })).status, 503);
assert.equal((await handleRecoveryPreview(request('bootstrap'), async () => Response.json({}))).status, 502);
console.log('PASS: recovery preview retains 100 invoices and 25 quotations, normalizes identities, never forwards writes or seeds, and does not fall back on outage/missing account.');

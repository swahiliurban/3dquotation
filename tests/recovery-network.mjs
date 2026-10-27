import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { packWorkspace, unpackWorkspace } from '../shared/workspace-transfer.js';

const memory = new Map();
globalThis.window = {
  localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
  setTimeout: (callback, delay) => setTimeout(callback, delay < 60_000 ? 0 : delay), clearTimeout,
};
const bundle = await build({ entryPoints: ['src/lib/api/sharedStore.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const identity = { email: 'saved@example.invalid', phone: '+255752220401', key: 'saved-key' };
const firstLogo = 'data:image/png;base64,' + 'a'.repeat(5000);
const oldLogo = 'data:image/png;base64,' + 'b'.repeat(5000);
const payload = { user: identity, businessProfile: { ...identity, logoDataUrl: firstLogo }, clients: [], catalog: [],
  documents: [{ id: '1', type: 'invoice', business: { logoDataUrl: oldLogo, signatureDataUrl: firstLogo } },
    { id: '2', type: 'quotation', business: { logoDataUrl: firstLogo, signatureDataUrl: '' } }], nextNumbers: { invoice: 101, quotation: 22 } };
const packed = packWorkspace(payload);
assert.equal(packed.assets.length, 2);
assert.deepEqual(unpackWorkspace(packed), payload, 'historical logos/signatures must be restored exactly');
assert.equal(payload.documents[0].business.logoDataUrl, oldLogo, 'packing must not modify source records');
const broken = structuredClone(packed);
broken.workspace.documents[0].business.logoDataUrl.quoteFlowAsset = 999;
assert.throws(() => unpackWorkspace(broken), /image is missing/);

let calls = [];
let replies = [];
globalThis.fetch = async (path, options) => {
  calls.push({ path, options });
  const reply = replies.shift();
  if (reply instanceof Error) throw reply;
  assert.ok(reply, 'unexpected extra request');
  return reply;
};
const response = () => Response.json(packWorkspace({ ...payload, businessIdentity: identity, workspaceExists: true }));
for (const failure of [new TypeError('Connection reset'), new Response('{truncated'), new Response('Unavailable', { status: 503 })]) {
  calls = []; replies = [failure, response()];
  const restored = await api.getRemoteBootstrap(identity);
  assert.deepEqual(restored.documents, payload.documents);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.get('X-QuoteFlow-Transport'), 'assets-v1');
  assert.equal(calls[0].options.cache, 'no-store');
}
calls = []; replies = [new TypeError('Network'), response()];
await api.claimRemoteBusinessIdentity({ ...identity, seed: payload });
assert.equal(calls.length, 2);
assert.deepEqual(JSON.parse(calls[1].options.body), { email: identity.email, phone: identity.phone }, 'recovery retries never contain a seed or creation flag');
for (const status of [401, 404, 409]) {
  calls = []; replies = [Response.json({ error: 'Cannot recover' }, { status })];
  await assert.rejects(() => api.getRemoteBootstrap(identity), /Cannot recover/);
  assert.equal(calls.length, 1);
}
calls = []; replies = [new TypeError('Network'), new TypeError('Network'), new TypeError('Network')];
await assert.rejects(() => api.getRemoteBootstrap(identity), /network connection/);
assert.equal(calls.length, 3, 'recovery retries are bounded');
for (const mutation of [
  () => api.claimRemoteBusinessIdentity({ ...identity, seed: payload, createIfMissing: true }),
  () => api.createRemoteDocument(identity, payload.documents[0]),
  () => api.updateRemoteDocument(identity, '1', payload.documents[0]),
  () => api.deleteRemoteDocument(identity, '1'),
  () => api.convertRemoteQuotation(identity, '2'),
]) {
  calls = []; replies = [new TypeError('Network')];
  await assert.rejects(mutation, /network connection/);
  assert.equal(calls.length, 1, 'uncertain mutations must never be repeated automatically');
}
console.log('PASS: lossless historical images, compact/legacy compatibility, interrupted recovery retries, bounded outages, and no repeated mutations.');

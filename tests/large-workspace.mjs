import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const moduleUrl = new URL('../server/shared/api-handler.js', import.meta.url);
const original = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'quoteflow-regression-'));
process.chdir(directory);
const { default: api } = await import(new URL('../api/index.js', import.meta.url));
const identity = { email: 'regression@example.invalid', phone: '0001234567' };
const headers = { 'Content-Type': 'application/json', 'X-QuoteFlow-Business-Email': identity.email, 'X-QuoteFlow-Business-Phone': identity.phone };
async function call(path, method = 'GET', body) {
  const response = await api.fetch(new Request('http://localhost/api?route=' + encodeURIComponent(path), {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  assert.ok(response.ok, `HTTP ${response.status}`);
  const wire = Buffer.from(await response.arrayBuffer());
  const decoded = response.headers.get('content-encoding') === 'gzip' ? gunzipSync(wire) : wire;
  return { data: JSON.parse(decoded), bytes: decoded.length, wireBytes: wire.length, response };
}
try {
  const logo = 'data:image/png;base64,' + randomBytes(390000).toString('base64');
  const documents = Array.from({ length: 100 }, (_, i) => ({
    id: `test-${i}`, type: 'quotation', number: `QUO-2026-${i + 1}`,
    business: { name: 'Synthetic test', logoDataUrl: logo },
    client: { name: 'Test client' }, items: [], notes: 'Unicode 🌍 Kiswahili',
  }));
  const initial = await call('business-identity', 'POST', { ...identity, seed: { documents } });
  assert.equal(initial.data.documents.length, 100);
  assert.ok(initial.bytes > 50_000_000);
  assert.equal(initial.response.headers.get('content-encoding'), 'gzip');
  assert.equal(initial.response.headers.get('cache-control'), 'private, no-store');
  const saved = await call('documents', 'POST', { id: 'new-save', type: 'quotation', client: {name:'New test'}, items:[], notes:'Verified 🌍' });
  assert.equal(saved.data.document.id, 'new-save');
  const refreshed = await call('bootstrap');
  assert.equal(refreshed.data.documents.length, 101);
  assert.equal(refreshed.data.documents.find(d => d.id === 'test-0').business.logoDataUrl, logo);
  assert.equal(refreshed.data.documents.find(d => d.id === 'new-save').notes, 'Verified 🌍');
  await call('documents/new-save', 'PUT', { notes: 'Updated through nested route' });
  const shared = await call('documents/new-save/shared', 'POST', { via: 'pdf' });
  assert.equal(shared.data.document.notes, 'Updated through nested route');
  console.log(`PASS: ${refreshed.bytes} byte workspace streamed; save and reload retained 101 documents and image data.`);
} finally {
  process.chdir(original);
  await rm(directory, {recursive:true, force:true});
}

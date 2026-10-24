import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/lib/recordSearch.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { buildRecordIndex, searchRecords } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const make = (id, type, name, company, product, description, price, date, status) => ({
  id, type, number: `${type === 'invoice' ? 'INV' : 'QT'}-2026-${id.padStart(4, '0')}`,
  status, issueDate: date, createdAt: `${date}T10:00:00Z`,
  client: { name, company, email: 'client@example.com', phone: '+255 752 220 401' },
  business: { showTax: false, showDiscount: false },
  items: [{ name: product, description, quantity: 1, unitPrice: price, discount: 0, tax: 0 }],
});
const documents = [
  make('1', 'invoice', 'Alice', 'ABC Company', 'Business Cards', 'Silk finish', 300, '2026-01-01', 'paid'),
  make('2', 'quotation', 'Juma Printing', '', 'Roll-Up Banner', 'Outdoor display', 100, '2026-02-02', 'draft'),
  make('3', 'invoice', 'Bob', 'ABC Company', 'T-Shirt Printing', 'Cotton fabric', 200, '2026-03-03', 'unpaid'),
  make('4', 'quotation', 'Grace Events', '', 'LED Signage', 'Illuminated panel', 400, '2026-04-04', 'sent'),
];
const defaults = { query: '', type: 'all', status: 'all', from: '', to: '', sort: 'newest' };
const index = buildRecordIndex(documents);
const find = (query, extra = {}) => searchRecords(index, { ...defaults, query, ...extra }).map(d => d.id);
assert.deepEqual(find('ABC'), ['3', '1']);
assert.deepEqual(find('  Printing  '), ['3', '2']);
assert.deepEqual(find('INV-2026-0003'), ['3']);
assert.deepEqual(find('bann'), ['2']);
assert.deepEqual(find('silk   FINISH'), ['1']);
assert.deepEqual(find('alice'), ['1']);
assert.equal(find('client@example').length, 4);
assert.equal(find('255752220401').length, 4);
assert.deepEqual(find('abc', { type: 'invoice', sort: 'oldest' }), ['1', '3']);
assert.deepEqual(find('abc', { status: 'paid' }), ['1']);
assert.deepEqual(find('', { from: '2026-02-02', to: '2026-03-03' }), ['3', '2']);
assert.deepEqual(find('', { sort: 'highest' }), ['4', '1', '3', '2']);
assert.deepEqual(find('', { sort: 'lowest' }), ['2', '3', '1', '4']);
assert.deepEqual(find('missing'), []);
assert.deepEqual(documents.map(d => d.id), ['1', '2', '3', '4']);
const large = buildRecordIndex(Array.from({ length: 10000 }, (_, i) => ({ ...documents[i % 4], id: String(i) })));
const start = performance.now();
assert.equal(searchRecords(large, { ...defaults, query: 'printing' }).length, 5000);
console.log(`PASS: all search fields, partial/case/whitespace matching, combined filters, inclusive dates, amount/date ordering; 10,000 rows searched in ${(performance.now() - start).toFixed(1)}ms.`);

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'quoteflow-proxy-test-'));
await mkdir(join(directory, 'dist'));
await writeFile(join(directory, 'dist', 'index.html'), '<title>Account page</title>');
const payload = { documents: [{ id: 'saved' }], message: 'Saved workspace 🌍' };
const compressed = gzipSync(JSON.stringify(payload));
const upstream = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': compressed.length });
  response.end(compressed);
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/static-preview.mjs', import.meta.url))], {
  cwd: directory, windowsHide: true,
  env: { ...process.env, QUOTEFLOW_PREVIEW_PORT: String(port), QUOTEFLOW_API_PORT: String(upstream.address().port) },
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timed out')), 15_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  const result = await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
  assert.equal(result.headers.get('content-encoding'), null);
  assert.deepEqual(await result.json(), payload, 'upstream gzip is decoded exactly once');
  const auth = await fetch(`http://127.0.0.1:${port}/auth`, { redirect: 'manual' });
  assert.equal(auth.status, 200, 'account form must survive a direct visit or refresh');
  console.log('PASS: production-style preview relays compressed API responses correctly and serves the account page directly.');
} finally {
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await exited;
  await new Promise(resolve => upstream.close(resolve));
  await rm(directory, { recursive: true, force: true });
}

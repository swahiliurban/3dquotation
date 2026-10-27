import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, QUOTEFLOW_RECOVERY_PREVIEW: '1', QUOTEFLOW_API_PORT: '8877', VITE_RECOVERY_PREVIEW: 'true' };
const children = [];
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(code);
}
for (const args of [
  ['server/api-server.mjs'],
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
]) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); shutdown(1); });
  child.on('exit', code => shutdown(code ?? 1));
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
console.log('Read-only live recovery preview: http://127.0.0.1:5174/auth');
console.log('Enter your existing business details. Production writes and new accounts are blocked.');

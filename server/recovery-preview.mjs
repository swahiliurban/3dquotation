import { createHash } from 'node:crypto';
import { unpackWorkspace } from '../shared/workspace-transfer.js';

const SOURCE = 'https://3dquotation.vercel.app';
function json(status, body) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// This adapter is used only by the explicitly selected local recovery preview.
// Never forward writes, registration, seeds, cookies or arbitrary destination URLs.
export async function handleRecoveryPreview(request, fetchRemote = fetch) {
  const path = new URL(request.url).pathname;
  if (path === '/api/health' && request.method === 'GET') {
    return json(200, { ok: true, mode: 'read-only-recovery', source: SOURCE });
  }
  const claim = path === '/api/business-identity' && request.method === 'POST';
  if (!claim && !(path === '/api/bootstrap' && request.method === 'GET')) {
    return json(405, { error: 'This recovery preview is read-only. Your live records cannot be changed here.' });
  }
  let body;
  try { body = claim ? await request.json() : {}; }
  catch { return json(400, { error: 'Enter your registered business email and phone.' }); }
  const email = String(claim ? body.email || '' : request.headers.get('x-quoteflow-business-email') || '').trim().toLowerCase();
  let phone = String(claim ? body.phone || '' : request.headers.get('x-quoteflow-business-phone') || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (/^0[67]\d{8}$/.test(phone)) phone = `255${phone.slice(1)}`;
  else if (/^[67]\d{8}$/.test(phone)) phone = `255${phone}`;
  if (!email || !phone) return json(400, { error: 'Enter your registered business email and phone.' });
  if (body.createIfMissing) return json(405, { error: 'New accounts cannot be created in the read-only recovery preview.' });
  try {
    const response = await fetchRemote(`${SOURCE}/api/bootstrap`, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(600_000),
      headers: { 'X-QuoteFlow-Business-Email': email, 'X-QuoteFlow-Business-Phone': phone, 'X-QuoteFlow-Transport': 'assets-v1' },
    });
    if (response.status === 404) return json(404, { error: 'No matching workspace was found on the live site. Check your original business details. No account was created.' });
    if (!response.ok) return json(502, { error: `Live workspace recovery failed (HTTP ${response.status}). Retry; no local or live records were changed.` });
    const payload = unpackWorkspace(await response.json());
    if (!Array.isArray(payload.documents) || !payload.businessProfile || !payload.nextNumbers || !Array.isArray(payload.clients) || !Array.isArray(payload.catalog)) {
      return json(502, { error: 'The live workspace response was incomplete. No local workspace was substituted.' });
    }
    return json(200, claim ? {
      ...payload, workspaceExists: true,
      businessIdentity: { email, phone: `+${phone}`, key: createHash('sha256').update(`${email}|${phone}`).digest('hex') },
    } : payload);
  } catch (error) {
    console.error('[Recovery preview] Live read failed:', error.name, error.message, error.cause?.code || '');
    return json(503, { error: 'Could not reach the live workspace. Check your internet connection and retry. No empty workspace was created.' });
  }
}

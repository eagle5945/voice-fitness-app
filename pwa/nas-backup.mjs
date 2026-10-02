// Talks to the NAS backup server at /api/backup/. The token lives in its own IndexedDB key, never in the backup data.
export const ENDPOINT = '/api/backup/';

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Automatic backups wait until no workout is in progress, and skip data the NAS already has.
export function shouldSend({ reason, hash, lastHash, activeSessionId, online = true }) {
  if (!online) return false;
  if (reason === 'manual') return true;
  if (activeSessionId) return false;
  return hash !== lastHash;
}

const headers = (token, extra = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

async function call(fetchImpl, url, init) {
  let response;
  try { response = await fetchImpl(url, { cache: 'no-store', ...init }); }
  catch { return { status: 'offline' }; }
  let body = null;
  try { body = await response.json(); } catch { /* 401 and some errors have no body */ }
  if (response.status === 401) return { status: 'unauthorized' };
  // Before the server is installed nginx answers with its own non-JSON 404; a stopped server gives 502.
  if (response.status === 404) return body?.error ? { status: 'notfound', body } : { status: 'missing' };
  if ([502, 503, 504].includes(response.status)) return { status: 'missing' };
  if (response.status === 409 && body?.reason === 'shrink') return { status: 'shrink', body };
  if (response.status === 422) return { status: 'invalid', body };
  if (response.status === 201) return { status: 'saved', body };
  if (response.ok) return { status: body?.unchanged ? 'unchanged' : 'ok', body };
  return { status: 'error', code: response.status };
}

export function sendBackup(text, token, { confirmShrink = false, fetchImpl = fetch } = {}) {
  return call(fetchImpl, ENDPOINT, { method: 'PUT', headers: headers(token, { 'Content-Type': 'application/json', ...(confirmShrink ? { 'X-Backup-Confirm': 'shrink' } : {}) }), body: text });
}

export const listBackups = (token, { fetchImpl = fetch } = {}) => call(fetchImpl, ENDPOINT, { headers: headers(token) });

export const fetchBackup = (token, id, { fetchImpl = fetch } = {}) => call(fetchImpl, `${ENDPOINT}${encodeURIComponent(id)}`, { headers: headers(token) });

export function errorText(result) {
  if (result.status === 'unauthorized') return '토큰이 맞지 않습니다.';
  if (result.status === 'offline') return 'NAS에 연결할 수 없습니다.';
  if (result.status === 'missing') return 'NAS 백업 서버가 꺼져 있습니다.';
  if (result.status === 'notfound') return '백업을 찾지 못했습니다.';
  if (result.status === 'invalid') return result.body?.error ?? '백업 형식이 올바르지 않습니다.';
  return `NAS 백업에 실패했습니다(${result.code ?? '알 수 없음'}).`;
}

// The ONLY place that talks to the network. Every *Api.js file calls request() with a REST path.
// The PHP API lives in a separate project; its address comes from VITE_API_BASE_URL.
import { config } from '../config';
import { ApiError } from './errors';

const TOKEN_KEY = 'ucrm_token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)),
};

let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

function buildUrl(path, params) {
  const url = `${config.apiBaseUrl}${path}`;
  if (!params) return url;
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.append(k, v); });
  const s = q.toString();
  return s ? `${url}?${s}` : url;
}

export async function request(method, path, { body, params } = {}) {
  if (!config.apiBaseUrl) {
    throw new ApiError('The API address is not configured. Set VITE_API_BASE_URL in the frontend .env file (see README) and restart npm run dev.', 0, { code: 'CONFIG' });
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let res;
  try {
    res = await fetch(buildUrl(path, params), { method, headers, signal: ctrl.signal, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'The server took too long to respond.' : `Cannot reach the API at ${config.apiBaseUrl}. Check that the PHP server and MySQL are running, the URL is correct, and CORS allows this site.`, 0, { code: 'NETWORK' });
  } finally { clearTimeout(timer); }

  let json = null;
  const text = await res.text();
  if (text) { try { json = JSON.parse(text); } catch { json = null; } }

  if (!res.ok) {
    const err = new ApiError(json?.message || res.statusText || `Request failed (${res.status})`, res.status, { errors: json?.errors, code: json?.code, data: json?.data });
    // 401 on a protected call = session expired / revoked. (A wrong password on /auth/login also answers 401.)
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && unauthorizedHandler) unauthorizedHandler();
    throw err;
  }
  if (json === null && res.status !== 204) {
    throw new ApiError('The server returned an unexpected (non-JSON) response. Check the API URL and the PHP error log.', res.status, { code: 'BAD_RESPONSE' });
  }
  return json;
}

// ---- Response shape helpers. Single record: { data: {...} }   List: { data: [...], meta: { total, page, pageSize } } ----
export const unwrap = (json) => (json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json);
export function normalizeList(json) {
  if (Array.isArray(json)) return { rows: json, total: json.length };
  return { rows: json?.data || [], total: json?.meta?.total ?? (json?.data || []).length };
}

// Generic REST helpers used by most modules.
export function makeResource(path) {
  return {
    list: (params) => request('GET', path, { params }).then(normalizeList),
    get: (id) => request('GET', `${path}/${id}`).then(unwrap),
    create: (body) => request('POST', path, { body }).then(unwrap),
    update: (id, body) => request('PUT', `${path}/${id}`, { body }).then(unwrap),
    setStatus: (id, status, extra = {}) => request('PATCH', `${path}/${id}/status`, { body: { status, ...extra } }).then(unwrap),
    remove: (id) => request('DELETE', `${path}/${id}`).then(unwrap),
  };
}

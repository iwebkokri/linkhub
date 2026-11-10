export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let onUnauthorized = null;
let onSetupRequired = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}
export function setSetupRequiredHandler(fn) {
  onSetupRequired = fn;
}

async function request(method, url, body) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    options.body = body; // the browser sets the multipart boundary
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    // A 401 anywhere except the sign-in steps themselves means the session is gone.
    const isSignIn = url.startsWith('/api/auth/login') || url.startsWith('/api/auth/2fa/verify');
    if (res.status === 401 && !isSignIn && onUnauthorized) onUnauthorized();
    // 403 SETUP_REQUIRED: the account must change its password / enrol 2FA before anything else.
    if (res.status === 403 && data?.details?.code === 'SETUP_REQUIRED' && onSetupRequired) onSetupRequired();
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

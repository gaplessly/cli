// One authenticated GET against the Gaplessly API.
//
// The key travels in the Authorization header and nowhere else: never in a
// URL, never in an error message, never in a log line.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Refuse to send a key over plain HTTP, except to a server on this machine. */
export function checkBaseUrl(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new ApiError(0, 'usage', `Not a valid URL: ${base}`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    throw new ApiError(0, 'usage', `Refusing to send an API key to ${url.origin}: use https.`);
  }
  return url.origin;
}

/**
 * GET a path and return the parsed JSON body. A 429 waits for Retry-After
 * (the API sends it in seconds) and tries again, up to `retries` times.
 */
export async function get(url, { key, userAgent, fetch = globalThis.fetch, sleep, retries = 3 }) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'User-Agent': userAgent },
    });
    if (res.status === 429 && attempt < retries) {
      const seconds = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
      continue;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, body?.code ?? `http_${res.status}`, body?.error ?? res.statusText);
    }
    return body;
  }
}

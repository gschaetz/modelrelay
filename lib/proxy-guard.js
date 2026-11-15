// Protection for the OpenAI-compatible proxy (/v1/*): an optional bearer token.
//
// The proxy is open by default because it is usually reached over loopback by local tools, and its CORS headers
// are what browser-based clients rely on. When the router is published beyond this machine (a VPS, a reverse
// proxy, a shared host), anyone who knows the URL can spend the quota configured for the providers. Setting
// MODELRELAY_PROXY_TOKEN requires `Authorization: Bearer <token>` on every /v1 request; without it nothing
// changes, so existing clients keep working.
//
// CORS preflights stay open: a browser must be able to ask for permission before it sends the header.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const PROXY_TOKEN_ENV = 'MODELRELAY_PROXY_TOKEN';
export const MIN_PROXY_TOKEN_LENGTH = 16;

/** Reads the proxy token from the environment, trimmed. Empty means the proxy stays open. */
export function getProxyToken(env = process.env) {
  const raw = env?.[PROXY_TOKEN_ENV];
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Returns the credential of an `Authorization: Bearer <token>` header, or '' for any other shape. */
export function parseBearerToken(header) {
  if (typeof header !== 'string') return '';
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return match ? match[1] : '';
}

/**
 * Builds the token check. With no token the proxy is open; with one, only an exact bearer credential passes.
 * Comparison runs over HMACs under a random per-process key, so it is constant-time and does not leak the
 * token length.
 */
export function createProxyAuth({ token } = {}) {
  const normalized = typeof token === 'string' ? token.trim() : '';
  const enabled = normalized.length > 0;
  const macKey = randomBytes(32);
  const mac = (value) => createHmac('sha256', macKey).update(String(value)).digest();
  const expected = enabled ? mac(normalized) : null;

  const verify = (header) => {
    if (!enabled) return true;
    const candidate = parseBearerToken(header);
    return candidate.length > 0 && timingSafeEqual(mac(candidate), expected);
  };

  return { enabled, verify };
}

/** Express middleware for /v1. Mount it after the CORS middleware so preflights are answered first. */
export function createProxyMiddleware({ token } = {}) {
  const auth = createProxyAuth({ token });
  return (req, res, next) => {
    if (!auth.enabled || req.method === 'OPTIONS' || auth.verify(req.headers.authorization)) return next();
    return res.status(401).json({ error: { message: 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } });
  };
}

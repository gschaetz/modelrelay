// Protection for the admin API (/api/*): host and origin checks plus an optional admin token.
//
// The router listens on every network interface and the admin API can read and change provider API keys, so
// without these checks any web page open in a browser on the same machine (or any device on the network) could
// read the keys and redirect a provider to an attacker. The /v1 proxy is deliberately NOT covered here: it has to
// stay reachable cross-origin for browser-based clients.
//
//   1. Host check      - rejects requests whose Host header is not a name this machine answers to. Stops DNS
//                        rebinding, where an attacker's domain is re-pointed at 127.0.0.1.
//   2. Origin check    - rejects browser requests that come from another origin (Origin / Sec-Fetch-Site).
//   3. Admin token     - optional. When MODELRELAY_ADMIN_TOKEN is set every other /api route needs a login
//                        session (cookie) or an `Authorization: Bearer <token>` header.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { hostname } from 'node:os'
import { isIP } from 'node:net'

export const SESSION_COOKIE = 'modelrelay_session'
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MAX_SESSIONS = 100
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_FAILURES = 10

// ---- host header ------------------------------------------------------------------------------------------

/** Splits a Host header into { host, port }. Handles `name`, `name:port`, `1.2.3.4:port` and `[::1]:port`. */
export function parseHostHeader(value) {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (!text || text.length > 255) return null
  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    if (end === -1) return null
    const host = text.slice(1, end)
    const rest = text.slice(end + 1)
    if (rest && !/^:\d{1,5}$/.test(rest)) return null
    return isIP(host) === 6 ? { host, port: rest ? rest.slice(1) : '' } : null
  }
  const colon = text.lastIndexOf(':')
  const host = colon === -1 ? text : text.slice(0, colon)
  const port = colon === -1 ? '' : text.slice(colon + 1)
  if (port && !/^\d{1,5}$/.test(port)) return null
  if (!host || !/^[a-z0-9._-]+$/.test(host)) return null
  return { host, port }
}

/** Parses a comma separated allow list (`a.example.com, b.example.com:7352`) into lowercase host names. */
export function parseAllowedHosts(value) {
  if (typeof value !== 'string') return []
  return value.split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
    .map(entry => (entry === '*' ? entry : (parseHostHeader(entry)?.host ?? entry)))
}

/** Parses a comma separated list of full origins (`https://modelrelay.example.com`). */
export function parseAllowedOrigins(value) {
  if (typeof value !== 'string') return []
  const origins = []
  for (const entry of value.split(',')) {
    try { origins.push(new URL(entry.trim()).origin.toLowerCase()) } catch { /* ignore malformed entries */ }
  }
  return origins
}

/**
 * Is this Host header one we serve? Allowed: any IP literal (DNS rebinding needs a *name*, and an IP in the Host
 * header means the browser really connected to that IP), localhost, this machine's own host name, and anything
 * listed in MODELRELAY_ALLOWED_HOSTS ("*" disables the check).
 */
export function isAllowedHost(hostHeader, { extraHosts = [], machineName = hostname() } = {}) {
  if (hostHeader === undefined) return true // HTTP/1.0 clients that send no Host header
  const parsed = parseHostHeader(hostHeader)
  if (!parsed) return false
  const { host } = parsed
  if (extraHosts.includes('*')) return true
  if (isIP(host)) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  const machine = String(machineName || '').toLowerCase()
  if (machine && (host === machine || host === `${machine}.local`)) return true
  return extraHosts.includes(host)
}

// ---- origin -----------------------------------------------------------------------------------------------

/**
 * Cross-origin check for browser requests. Same-origin fetches and plain navigations pass; requests another
 * site makes to us are refused even when they would not need a CORS preflight.
 */
export function evaluateRequestOrigin({ origin, host, secFetchSite, allowedOrigins = [] }) {
  const site = typeof secFetchSite === 'string' ? secFetchSite.toLowerCase() : ''
  if (origin !== undefined) {
    if (origin === 'null') return { ok: false, reason: 'Request has an opaque (null) origin.' }
    let originUrl
    try { originUrl = new URL(origin) } catch { return { ok: false, reason: 'Request has an invalid Origin header.' } }
    const sameOrigin = typeof host === 'string' && originUrl.host.toLowerCase() === host.trim().toLowerCase()
    if (sameOrigin || allowedOrigins.includes(originUrl.origin.toLowerCase())) return { ok: true }
    return { ok: false, reason: `Cross-origin request from ${originUrl.origin} blocked.` }
  }
  if (site && site !== 'same-origin' && site !== 'none') {
    return { ok: false, reason: 'Cross-site request blocked.' }
  }
  return { ok: true }
}

// ---- cookies ----------------------------------------------------------------------------------------------

export function parseCookies(header) {
  const cookies = {}
  if (typeof header !== 'string') return cookies
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name && !(name in cookies)) cookies[name] = part.slice(eq + 1).trim()
  }
  return cookies
}

export function buildSessionCookie(id, { secure = false, maxAgeSeconds = DEFAULT_SESSION_TTL_MS / 1000 } = {}) {
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeSeconds)}${secure ? '; Secure' : ''}`
}

export function buildClearedCookie({ secure = false } = {}) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`
}

// ---- admin token and sessions ------------------------------------------------------------------------------

export function createAdminAuth({ token, sessionTtlMs = DEFAULT_SESSION_TTL_MS, now = () => Date.now() } = {}) {
  const enabled = typeof token === 'string' && token.length > 0
  // Compare MACs under a random per-process key: constant-time, and equal-length regardless of input length.
  const macKey = randomBytes(32)
  const mac = (value) => createHmac('sha256', macKey).update(String(value)).digest()
  const expected = enabled ? mac(token) : null
  const sessions = new Map() // id -> expiry (ms)
  const failures = new Map() // client address -> { count, firstAt }

  const verifyToken = (candidate) => enabled && typeof candidate === 'string' && candidate.length > 0
    && timingSafeEqual(mac(candidate), expected)

  const prune = () => {
    const t = now()
    for (const [id, expiry] of sessions) if (expiry <= t) sessions.delete(id)
    while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value)
  }

  const createSession = () => {
    prune()
    const id = randomBytes(32).toString('hex')
    sessions.set(id, now() + sessionTtlMs)
    return id
  }

  const isValidSession = (id) => {
    if (typeof id !== 'string' || !sessions.has(id)) return false
    if (sessions.get(id) <= now()) { sessions.delete(id); return false }
    return true
  }

  const authenticateRequest = (req) => {
    if (!enabled) return true
    const authorization = req.headers?.authorization
    if (typeof authorization === 'string' && /^bearer /i.test(authorization)) {
      if (verifyToken(authorization.slice(7).trim())) return true
    }
    return isValidSession(parseCookies(req.headers?.cookie)[SESSION_COOKIE])
  }

  // Brute-force protection for the login route: lock a client out after repeated failures.
  const isLockedOut = (client) => {
    const entry = failures.get(client)
    if (!entry) return false
    if (now() - entry.firstAt > LOGIN_WINDOW_MS) { failures.delete(client); return false }
    return entry.count >= MAX_LOGIN_FAILURES
  }
  const recordFailure = (client) => {
    const entry = failures.get(client)
    if (!entry || now() - entry.firstAt > LOGIN_WINDOW_MS) failures.set(client, { count: 1, firstAt: now() })
    else entry.count += 1
  }
  const clearFailures = (client) => failures.delete(client)

  return {
    enabled, verifyToken, createSession, isValidSession,
    destroySession: (id) => sessions.delete(id),
    authenticateRequest, isLockedOut, recordFailure, clearFailures,
    sessionCount: () => sessions.size,
  }
}

// ---- express middleware -------------------------------------------------------------------------------------

// Routes under /api that must work before the user is signed in.
const AUTH_EXEMPT_PATHS = new Set(['/auth/status', '/auth/login', '/auth/logout'])

export function createAdminMiddleware({ auth, extraHosts = [], allowedOrigins = [], machineName, onBlocked = () => {} } = {}) {
  return function adminGuard(req, res, next) {
    // Admin responses can contain secrets: never let a browser or proxy cache them.
    res.setHeader('Cache-Control', 'no-store')

    if (!isAllowedHost(req.headers.host, { extraHosts, machineName })) {
      onBlocked('host', req.headers.host)
      return res.status(403).json({
        error: `Host "${req.headers.host}" is not allowed to use the admin API.`,
        hint: 'Open the dashboard through localhost, an IP address or this machine\'s name, or add the host name to MODELRELAY_ALLOWED_HOSTS.',
      })
    }

    const origin = evaluateRequestOrigin({
      origin: req.headers.origin,
      host: req.headers.host,
      secFetchSite: req.headers['sec-fetch-site'],
      allowedOrigins,
    })
    if (!origin.ok) {
      onBlocked('origin', req.headers.origin || req.headers['sec-fetch-site'])
      return res.status(403).json({ error: origin.reason, hint: 'If the dashboard is served from another origin (a reverse proxy), add it to MODELRELAY_ALLOWED_ORIGINS.' })
    }

    if (!auth || !auth.enabled || AUTH_EXEMPT_PATHS.has(req.path)) return next()
    if (auth.authenticateRequest(req)) return next()
    return res.status(401).json({ error: 'Authentication required.', authRequired: true })
  }
}

/** Express handlers for /api/auth/*. Mount them under /api so the guard's exemptions apply. */
export function createAuthRoutes({ auth }) {
  const isSecure = (req) => !!req.socket?.encrypted || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https'
  const client = (req) => req.socket?.remoteAddress || 'unknown'

  return {
    status: (req, res) => {
      res.json({ authRequired: auth.enabled, authenticated: auth.authenticateRequest(req) })
    },
    login: (req, res) => {
      if (!auth.enabled) return res.json({ ok: true, authRequired: false })
      const who = client(req)
      if (auth.isLockedOut(who)) return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' })
      const token = typeof req.body?.token === 'string' ? req.body.token : ''
      if (!auth.verifyToken(token.trim())) {
        auth.recordFailure(who)
        return res.status(401).json({ error: 'Invalid admin token.' })
      }
      auth.clearFailures(who)
      res.setHeader('Set-Cookie', buildSessionCookie(auth.createSession(), { secure: isSecure(req) }))
      return res.json({ ok: true, authRequired: true })
    },
    logout: (req, res) => {
      auth.destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE])
      res.setHeader('Set-Cookie', buildClearedCookie({ secure: isSecure(req) }))
      res.json({ ok: true })
    },
  }
}

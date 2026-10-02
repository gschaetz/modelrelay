// Passive telemetry: per provider/model outcomes observed on real proxied traffic.
// Pure functions over a plain JSON-serializable store so they are easy to test and persist.
// Only metadata is recorded (counts, latencies, token rates) -- never prompt or response content.

export const TELEMETRY_HALF_LIFE_MS = 24 * 60 * 60_000
export const TELEMETRY_MIN_SAMPLES = 5
export const TELEMETRY_FULL_CONFIDENCE_SAMPLES = 30
export const TELEMETRY_MIN_MULTIPLIER = 0.25
const PRIOR_SUCCESSES = 2
const PRIOR_FAILURES = 0.5
const EWMA_ALPHA = 0.2
// At or above this smoothed success rate a model is treated as fully healthy (mirrors the >=95%
// uptime tier), so the Beta prior can't leave a flawless model ranked below an unsampled one.
const HEALTHY_SUCCESS_RATE = 0.95

export const FAILURE_KINDS = ['rateLimit', 'serverError', 'network', 'midstream', 'unsupported']

export function createTelemetryStore() {
  return { version: 1, models: {} }
}

function emptyEntry(now) {
  return { ok: 0, fail: 0, kinds: {}, ttftMs: null, tokensPerSec: null, updatedAt: now }
}

function decayEntry(entry, now, halfLifeMs) {
  const dt = now - entry.updatedAt
  if (!(dt > 0)) return
  const factor = Math.pow(0.5, dt / halfLifeMs)
  entry.ok *= factor
  entry.fail *= factor
  for (const kind of Object.keys(entry.kinds)) entry.kinds[kind] *= factor
  entry.updatedAt = now
}

function ewma(previous, sample) {
  return previous == null ? sample : previous + EWMA_ALPHA * (sample - previous)
}

/**
 * Classify an HTTP status as a reliability signal. Returns the failure kind, or null when the
 * status says nothing about the model (success, or caller-side 4xx like 400/401/404/422 that
 * would fail on any model and must not drag a model's reliability down).
 */
export function classifyFailureStatus(status) {
  const code = Number(status)
  if (code === 429) return 'rateLimit'
  if (code === 410 || (code >= 500 && code <= 599)) return 'serverError'
  return null
}

function getOrCreate(store, key, now) {
  if (!store.models[key]) store.models[key] = emptyEntry(now)
  return store.models[key]
}

export function recordSuccess(store, key, { ttftMs = null, durationMs = null, completionTokens = null, now = Date.now(), halfLifeMs = TELEMETRY_HALF_LIFE_MS } = {}) {
  if (!key) return
  const entry = getOrCreate(store, key, now)
  decayEntry(entry, now, halfLifeMs)
  entry.ok += 1
  if (Number.isFinite(ttftMs) && ttftMs >= 0) entry.ttftMs = ewma(entry.ttftMs, ttftMs)
  const generationMs = Number.isFinite(durationMs) && Number.isFinite(ttftMs) ? durationMs - ttftMs : null
  if (Number.isFinite(completionTokens) && completionTokens > 1 && generationMs != null && generationMs > 50) {
    entry.tokensPerSec = ewma(entry.tokensPerSec, completionTokens / (generationMs / 1000))
  }
}

export function recordFailure(store, key, kind, { now = Date.now(), halfLifeMs = TELEMETRY_HALF_LIFE_MS } = {}) {
  if (!key || !FAILURE_KINDS.includes(kind)) return
  const entry = getOrCreate(store, key, now)
  decayEntry(entry, now, halfLifeMs)
  entry.fail += 1
  entry.kinds[kind] = (entry.kinds[kind] || 0) + 1
}

/**
 * Smoothed reliability for one entry. `successRate` uses a Beta prior so a single early
 * failure doesn't zero a model; `confidence` ramps from 0 to 1 with the (decayed) sample count.
 */
export function getReliability(entry, now = Date.now(), halfLifeMs = TELEMETRY_HALF_LIFE_MS) {
  if (!entry) return { samples: 0, successRate: null, confidence: 0 }
  const snapshot = { ...entry, kinds: { ...entry.kinds } }
  decayEntry(snapshot, now, halfLifeMs)
  const samples = snapshot.ok + snapshot.fail
  if (samples <= 0) return { samples: 0, successRate: null, confidence: 0 }
  const successRate = (snapshot.ok + PRIOR_SUCCESSES) / (samples + PRIOR_SUCCESSES + PRIOR_FAILURES)
  const confidence = samples < TELEMETRY_MIN_SAMPLES
    ? 0
    : Math.min(1, samples / TELEMETRY_FULL_CONFIDENCE_SAMPLES)
  return { samples, successRate, confidence }
}

/**
 * Routing multiplier in [TELEMETRY_MIN_MULTIPLIER, 1]. Exactly 1 with too little data, so new
 * models and fresh installs route as before; scales toward the observed success rate as
 * confidence grows. Never boosts a model above 1 -- telemetry only demotes unreliable ones.
 */
export function reliabilityMultiplier(entry, now = Date.now(), halfLifeMs = TELEMETRY_HALF_LIFE_MS) {
  const { successRate, confidence } = getReliability(entry, now, halfLifeMs)
  if (successRate == null || confidence === 0) return 1
  const effectiveRate = Math.min(1, successRate / HEALTHY_SUCCESS_RATE)
  const blended = 1 - confidence * (1 - effectiveRate)
  return Math.max(TELEMETRY_MIN_MULTIPLIER, Math.min(1, blended))
}

function decayedFailureKinds(entry, now, halfLifeMs = TELEMETRY_HALF_LIFE_MS) {
  const snapshot = { ...entry, kinds: { ...entry.kinds } }
  decayEntry(snapshot, now, halfLifeMs)
  const out = {}
  for (const [kind, count] of Object.entries(snapshot.kinds)) out[kind] = Math.round(count * 100) / 100
  return out
}

export function summarizeTelemetry(store, now = Date.now()) {
  const out = {}
  for (const [key, entry] of Object.entries(store?.models || {})) {
    const { samples, successRate, confidence } = getReliability(entry, now)
    out[key] = {
      samples: Math.round(samples * 100) / 100,
      successRate,
      confidence,
      multiplier: reliabilityMultiplier(entry, now),
      ttftMs: entry.ttftMs == null ? null : Math.round(entry.ttftMs),
      tokensPerSec: entry.tokensPerSec == null ? null : Math.round(entry.tokensPerSec * 10) / 10,
      // Decayed to `now`, like `samples`, so the two always agree (raw stored counts are as of updatedAt).
      failures: decayedFailureKinds(entry, now),
      updatedAt: entry.updatedAt,
    }
  }
  return out
}

// null/undefined mean "not measured yet" and must stay null -- Number(null) is 0, which would load as a
// measured zero and drag the smoothed value toward 0 on the next sample. Time to first token and token
// rate are never really 0, so a non-positive value is also treated as unmeasured: that heals files saved
// by 1.24.x, which wrote the bad zeros.
function optionalNumber(value) {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Defensive load: drop anything that isn't a well-formed entry so a corrupt file can't break routing. */
export function normalizeTelemetryStore(raw) {
  const store = createTelemetryStore()
  if (!raw || typeof raw !== 'object' || !raw.models || typeof raw.models !== 'object') return store
  for (const [key, entry] of Object.entries(raw.models)) {
    if (!entry || typeof entry !== 'object') continue
    const ok = Number(entry.ok)
    const fail = Number(entry.fail)
    const updatedAt = Number(entry.updatedAt)
    if (!Number.isFinite(ok) || !Number.isFinite(fail) || !Number.isFinite(updatedAt) || ok < 0 || fail < 0) continue
    const kinds = {}
    for (const kind of FAILURE_KINDS) {
      const n = Number(entry.kinds?.[kind])
      if (Number.isFinite(n) && n > 0) kinds[kind] = n
    }
    store.models[key] = {
      ok, fail, kinds, updatedAt,
      ttftMs: optionalNumber(entry.ttftMs),
      tokensPerSec: optionalNumber(entry.tokensPerSec),
    }
  }
  return store
}

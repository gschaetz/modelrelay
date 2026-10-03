// Linear-time string helpers.
//
// Several regexes of the shape /x+$/, /^x+|x+$/ or /\s+word\s*$/ are quadratic on adversarial input: the
// engine retries from every start position and rescans to the end. The router accepts request bodies of
// several megabytes, and its inputs (endpoint names, tags, model ids, API keys) come from unauthenticated
// API callers, so one hostile string could block the single-threaded process for minutes. These helpers do
// the same trimming with one pass.

export const MAX_LABEL_LENGTH = 500

const WHITESPACE = /\s/

export function isWhitespaceChar(ch) {
  return WHITESPACE.test(ch)
}

export function trimStartWhile(str, predicate) {
  let start = 0
  while (start < str.length && predicate(str[start])) start += 1
  return start === 0 ? str : str.slice(start)
}

export function trimEndWhile(str, predicate) {
  let end = str.length
  while (end > 0 && predicate(str[end - 1])) end -= 1
  return end === str.length ? str : str.slice(0, end)
}

export function trimWhile(str, predicate) {
  return trimEndWhile(trimStartWhile(str, predicate), predicate)
}

/**
 * Removes any run of the given suffixes from the end of `str`, case-insensitively, e.g.
 * 'model:free:cloud' with [':free', ':cloud'] -> 'model'. Same result as /(?::(?:free|cloud))+$/i, in one pass.
 * `suffixes` must be lowercase.
 */
export function stripTrailingSuffixes(str, suffixes) {
  let end = str.length
  for (;;) {
    let matched = false
    for (const suffix of suffixes) {
      const start = end - suffix.length
      if (start >= 0 && str.slice(start, end).toLowerCase() === suffix) {
        end = start
        matched = true
        break
      }
    }
    if (!matched) break
  }
  return end === str.length ? str : str.slice(0, end)
}

/** Bounds text before it is handed to a regex that is not linear. Display labels are never this long. */
export function capLength(str, max = MAX_LABEL_LENGTH) {
  return str.length > max ? str.slice(0, max) : str
}

// Keys that must never be used to index a plain object that user input can write to: assigning through
// obj['__proto__'] reaches Object.prototype.
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isSafeObjectKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 200 && !UNSAFE_OBJECT_KEYS.has(key)
}

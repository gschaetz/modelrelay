// Dashboard search and filter logic. Plain script (no imports/exports) so the browser can load it with a
// <script> tag; it attaches `ModelRelaySearch` to globalThis, which is also how the unit tests reach it.
(function (root) {
  // Min-context presets offered by the filter bar, in tokens.
  const CTX_PRESETS = [8000, 16000, 32000, 64000, 128000, 256000, 1000000];

  // Same rules as parseContextSize in lib/utils.js: a plain token count or a k/m suffix.
  function parseContextSize(value) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    const str = String(value).trim().toLowerCase();
    if (!str || str === '—') return null;
    const match = str.match(/^(\d+(?:\.\d+)?)\s*([km])?$/);
    if (!match) return null;
    const num = Number(match[1]);
    if (!Number.isFinite(num) || num <= 0) return null;
    const multiplier = match[2] === 'm' ? 1000000 : match[2] === 'k' ? 1000 : 1;
    return Math.round(num * multiplier);
  }

  function formatTokens(tokens) {
    if (!Number.isFinite(tokens) || tokens <= 0) return 'N/A';
    if (tokens >= 1000000) return `${Math.round(tokens / 100000) / 10}M`;
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
    return String(Math.round(tokens));
  }

  // The largest preset that does not exceed `tokens`, or null when the model is below the smallest preset.
  function presetForTokens(tokens) {
    if (!Number.isFinite(tokens)) return null;
    let best = null;
    for (const preset of CTX_PRESETS) if (preset <= tokens) best = preset;
    return best;
  }

  const KEY_ALIASES = {
    tag: 'tags', tags: 'tags',
    provider: 'providers', prov: 'providers',
    status: 'statuses',
    min_ctx: 'minCtx', ctx: 'minCtx', context: 'minCtx',
  };

  /**
   * Splits a search box value into plain terms and structured terms:
   *   tag:coding            model must carry that tag (several allowed, or tag:a,b)
   *   provider:groq         provider key contains the text
   *   status:up             exact status
   *   min_ctx:64k | ctx:64k | ctx>=64k   effective context at least this large
   * Anything else (including an unknown `key:value`) is a plain text term. All terms must match.
   */
  function parseSearch(text) {
    const parsed = { terms: [], tags: [], providers: [], statuses: [], minCtx: null, structured: 0 };
    for (const token of String(text || '').trim().toLowerCase().split(/\s+/).filter(Boolean)) {
      const match = token.match(/^([a-z_]+)(?::|>=)(?:>=)?(.+)$/);
      const field = match ? KEY_ALIASES[match[1]] : null;
      if (!field) { parsed.terms.push(token); continue; }
      const value = match[2];
      if (field === 'minCtx') {
        const tokens = parseContextSize(value);
        if (tokens == null) { parsed.terms.push(token); continue; }
        parsed.minCtx = parsed.minCtx == null ? tokens : Math.max(parsed.minCtx, tokens);
      } else {
        parsed[field].push(...value.split(',').map(v => v.trim()).filter(Boolean));
      }
      parsed.structured += 1;
    }
    return parsed;
  }

  function modelTagSet(model) {
    return new Set([...(model.tags || []), ...(model.userTags || [])].map(tag => String(tag).toLowerCase()));
  }

  /**
   * Does `model` pass the search box plus the filter-bar controls? `ui` = { tags: [...], minCtx: number|null }.
   * Everything combines with AND: all plain terms, all tags (from the box and the chips), the larger of
   * the two min-context values.
   */
  function matchesModel(model, parsed, ui = {}) {
    const requiredTags = [...parsed.tags, ...(ui.tags || [])].map(tag => String(tag).toLowerCase());
    if (requiredTags.length > 0) {
      const have = modelTagSet(model);
      if (!requiredTags.every(tag => have.has(tag))) return false;
    }
    if (parsed.providers.length > 0) {
      const provider = String(model.providerKey || '').toLowerCase();
      if (!parsed.providers.every(value => provider.includes(value))) return false;
    }
    if (parsed.statuses.length > 0 && !parsed.statuses.includes(String(model.status || '').toLowerCase())) return false;

    const minCtx = Math.max(parsed.minCtx || 0, ui.minCtx || 0);
    if (minCtx > 0) {
      const info = model.ctxInfo;
      if (!info || !info.usable || !(info.tokens >= minCtx)) return false;
    }

    if (parsed.terms.length > 0) {
      const haystack = [model.label, model.providerKey, model.modelId, ...modelTagSet(model)]
        .filter(Boolean).join(' ').toLowerCase();
      if (!parsed.terms.every(term => haystack.includes(term))) return false;
    }
    return true;
  }

  // How many things are narrowing the table right now (for the "Clear filters (n)" label).
  function activeFilterCount(parsed, ui = {}, narrowedGroups = 0) {
    return (parsed.terms.length > 0 ? 1 : 0) + parsed.structured + (ui.tags || []).length + (ui.minCtx ? 1 : 0) + narrowedGroups;
  }

  const STATE_VERSION = 1;
  const SORT_COLUMNS = ['model', 'qos', 'intell', 'ctx', 'ping', 'availability', 'reliability', 'status'];

  function serializeUiState(state) {
    return JSON.stringify({
      v: STATE_VERSION,
      search: String(state.search || ''),
      sort: state.sort || null,
      unchecked: state.unchecked || {},
      tags: state.tags || [],
      minCtx: state.minCtx || null,
    });
  }

  // Defensive parse: anything malformed falls back to defaults rather than breaking the dashboard.
  function parseUiState(raw) {
    const empty = { search: '', sort: null, unchecked: {}, tags: [], minCtx: null };
    if (!raw) return empty;
    let data;
    try { data = JSON.parse(raw); } catch { return empty; }
    if (!data || typeof data !== 'object' || data.v !== STATE_VERSION) return empty;
    const sort = data.sort && SORT_COLUMNS.includes(data.sort.col) && (data.sort.dir === 'asc' || data.sort.dir === 'desc')
      ? { col: data.sort.col, dir: data.sort.dir } : null;
    const unchecked = {};
    for (const group of ['provider', 'ping', 'avail', 'status']) {
      const values = data.unchecked && data.unchecked[group];
      if (Array.isArray(values)) unchecked[group] = values.filter(v => typeof v === 'string');
    }
    return {
      search: typeof data.search === 'string' ? data.search : '',
      sort,
      unchecked,
      tags: Array.isArray(data.tags) ? data.tags.filter(t => typeof t === 'string') : [],
      minCtx: Number.isFinite(data.minCtx) && data.minCtx > 0 ? data.minCtx : null,
    };
  }

  root.ModelRelaySearch = {
    CTX_PRESETS, SORT_COLUMNS,
    parseContextSize, formatTokens, presetForTokens,
    parseSearch, matchesModel, activeFilterCount,
    serializeUiState, parseUiState,
  };
})(globalThis);

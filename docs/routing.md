# Routing

## Model tags

Every model carries one or more capability tags, combined from two sources:

- **Curated tags** come from a fixed vocabulary — `coding`, `reasoning`, `general`, `fast`, `agentic` — maintained by project maintainers in `tags.js`.
- **Custom tags** are freeform labels you assign yourself. In the Web UI, open a model row and edit **Custom Routing Tags**. Assignments are keyed to the canonical model, shared across its providers, and stored in `~/.modelrelay.json`.

Use `model: "tag:<name>"` in `/v1/chat/completions` to route to the best currently available model carrying that tag — curated or custom — instead of naming a specific model. For example, assign `coding` to a few models in the UI, then request `model: "tag:coding"`; normal QoS ranking, availability filtering, and retry behavior choose the best currently eligible tagged model.

### Minimum context window (`min_ctx`)

Tag membership alone doesn't guarantee a model can fit your prompt — a tag can span models with very different context windows. Append `+min_ctx:<size>` to filter those out before QoS ranking runs:

- `tag:general+min_ctx:32000` — best available `general`-tagged model with at least 32,000 tokens of context
- `tag:coding+min_ctx:128k` — same, for `coding`, using the `k` shorthand
- `auto-fastest+min_ctx:1m` — fastest model overall with at least 1,000,000 tokens of context, no tag restriction

`<size>` accepts a plain token count (`32000`) or a `k`/`m` suffix (`32k`, `1m`). Models with no known context window, or a smaller one than requested, are excluded from consideration. An unparseable or unrecognized modifier is ignored, falling back to the unmodified `tag:<name>` or `auto-fastest` behavior rather than erroring.

Modelrelay uses context data reported by the selected provider when it is available. Otherwise, it uses a provider-specific curated value from `sources.js`. It does not copy a context size between providers. It also keeps the context unknown when neither source has a value. For Ollama, the allocated or configured context is usable for this filter. The model maximum alone is not sufficient.

A provider's reported (or curated) context window is an upper bound, not a guarantee — some providers advertise a much larger window than a given account can actually push through in one request (seen live on newly-listed Groq models whose real per-minute token quota was a fraction of their reported context). When modelrelay has already observed a live rate-limit reading for a model (from that provider's response headers, captured on any prior request whether it succeeded or failed), `min_ctx` matching uses the smaller of the reported context and that observed quota. This is populated automatically as requests happen; there's nothing to configure, and it only ever makes filtering stricter, never looser.

### Excluding specific models (`exclude`)

Append `+exclude:<id1|id2>` to `tag:<name>` or `auto-fastest` to steer a request away from one or more specific models, by bare model ID or provider-qualified `provider/modelId` key, separated by `|`:

- `tag:general+exclude:groq/qwen/qwen3.8-27b` — best `general`-tagged model, never that exact provider row
- `auto-fastest+exclude:qwen/qwen3.8-27b|qwen/qwen3.6-27b` — fastest model overall, excluding those two by bare ID across any provider

This composes with `min_ctx` in either order (e.g. `tag:general+min_ctx:32000+exclude:groq/qwen/qwen3.8-27b`), and follows the same matching and case-insensitivity rules as modelrelay's own internal per-request retry exclusion. Note: nothing in modelrelay's own proxy config today populates this dynamically on your behalf — it's a primitive for a caller that already knows a specific model ID it wants to avoid (for example, a retry layer that read the failed model out of a prior response), not something that reacts to failures automatically by itself. For automatic retry-with-a-different-model behavior on a single request, see how `auto-fastest`/`tag:<name>` already retry internally across candidates when a request fails.

## QoS: how speed and quality are weighed

`auto-fastest`, grouped-ID, and `tag:<name>` routing all rank eligible candidates by a QoS score that blends a model's quality (its `intell` percentile among all known models) with its recently observed average latency. Latency is scored continuously and never fully bottoms out at zero — a model averaging 1.1s and one averaging 4 minutes are not treated as equivalent just because both are technically "up" and returning HTTP 200. The latency discount is `target / (target + avg)`: an instant response scores 1.0, a model averaging exactly the configured target scores 0.5, and the score keeps decaying continuously past that — but it always remains a nonzero (last-resort) candidate rather than being excluded outright. Exclusion is still a separate, explicit action (ban a model, or set a minimum coding score / excluded providers list).

The target is `qosLatencyTargetMs`, configurable in the Web UI under **Settings → QoS Latency Target (ms)** (default: 3000ms). Lower it to weight speed more heavily against quality; raise it to let quality dominate over a wider range of observed latencies. It applies uniformly to `auto-fastest`, `tag:<name>`, grouped-ID, and pinned-model routing.

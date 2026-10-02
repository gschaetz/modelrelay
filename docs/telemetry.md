---
title: Telemetry
nav_order: 7
---

# Telemetry

modelrelay records how each provider/model behaves on your **real proxied requests** and uses that to demote models that keep failing, even when their background health pings look fine. Everything stays local: only counts and timings are stored, never prompt or response content.

## What is recorded

For every request routed through `/v1/chat/completions`, per `provider/modelId`:

- **Successes**, with smoothed time to first token and (when the provider reports token usage) tokens per second.
- **Failures**, by kind:
  - `rateLimit` — HTTP 429, or a 400/403 whose body looks like a rate-limit or quota error
  - `serverError` — HTTP 5xx or 410
  - `network` — the request never got a response
  - `midstream` — the upstream returned 200 but ended the stream on an error-shaped first chunk
  - `unsupported` — the provider rejected the request's schema or tools with a 400/422 (for example an unsupported JSON Schema keyword in a tool definition); see [automatic failover](endpoints.md#automatic-failover)

Caller-side errors (400, 401, 404, 422 and similar) are **not** counted against a model, since they would fail on any model.

## How it affects routing

Routing multiplies a model's QoS score (see [Routing](routing.md#qos-how-speed-and-quality-are-weighed)) by a reliability factor between `0.25` and `1`:

- The factor is exactly `1` until a model has about 5 recent samples, so new models and fresh installs route as before.
- It scales toward the observed success rate as samples accumulate, reaching full effect around 30 samples.
- A smoothed success rate of 95% or higher counts as fully healthy.
- It never boosts a model above `1` — telemetry only demotes unreliable models.
- Observations decay with a 24-hour half-life, so a model that recovers is trusted again.

## Viewing it

`GET /api/telemetry` returns the current per-model summary:

```json
{
  "nvidia/meta/llama-3.3-70b-instruct": {
    "samples": 41.5,
    "successRate": 0.97,
    "confidence": 1,
    "multiplier": 1,
    "ttftMs": 820,
    "tokensPerSec": 64.2,
    "failures": { "rateLimit": 1 },
    "updatedAt": 1790000000000
  }
}
```

An empty object (`{}`) just means no traffic has been recorded yet.

## Persistence

Stats are saved to `~/.modelrelay-telemetry.json` every 30 seconds and on exit, and reloaded on startup. A corrupt or missing file is ignored and starts fresh. When running in a container, make sure the home/config directory is writable (and on a volume if you want stats to survive restarts); if it isn't, telemetry still works in memory but resets on restart.

## Limitations

- A stream that fails *after* content has already started reaching the caller is not counted as a failure.
- Token rate is only recorded when the provider returns usage data.

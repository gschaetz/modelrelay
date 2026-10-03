---
title: Dashboard
nav_order: 8
---

# Dashboard

The router serves a web dashboard at `http://localhost:7352/` (or whatever `--port` you chose). It shows live model health, lets you steer routing, and keeps a log of recent requests.

## Models table

Each row is one provider/model. Besides the model name, tags, QoS, coding score, ping, availability and status, two columns explain how the router will treat it:

| Column | What it shows |
|---|---|
| **Context** | The *effective* context window: the reported window, capped by the per-minute token quota the router has observed for that model. This is exactly the value `min_ctx` routing matches on. A `⚠` means the quota capped it (for example `8K ⚠`, "of 131K reported"). `N/A` means the window is unknown, or only the model's maximum is known rather than what the provider allocates, so `min_ctx` routing skips the model. |
| **Reliability** | Success rate on **real requests** through the router (see [Telemetry](telemetry.md)), with the sample count and typical time to first token. A `×0.26` badge means recent failures are demoting the model in routing. Hover for the failure breakdown. Dimmed values have too few samples to affect routing yet; `—` means nothing has been recorded. |

Both columns sort, and unknown values always sort last. On narrow screens they fold into a small line under the model name.

Click a model row to open its drawer: the effective context with the reason behind it, a reliability summary (success rate, samples, time to first token, tokens per second, routing multiplier, failures by kind), your custom tags, and the recent ping history.

## Searching and filtering

The search box matches plain words against the model name, provider, id and tags. Add structured terms to narrow further; every term must match:

| Term | Matches |
|---|---|
| `tag:coding` | models carrying that tag (curated or your own); `tag:coding,fast` requires both |
| `provider:groq` | provider key containing the text |
| `status:up` | exact status (`up`, `down`, `disabled`, `excluded`, `banned`, `noauth`) |
| `ctx>=64k`, `ctx:64k` or `min_ctx:64k` | effective context of at least that size (`k` and `m` suffixes work) |

For example `qwen tag:coding ctx>=64k provider:groq`.

The **Filters** panel adds:

- **Tags**: toggle tags on or off; a model must have all selected tags (the same as several `tag:` terms).
- **Min context**: a preset floor on the effective context (8K to 1M).
- **Provider, Ping, Availability, Status**: the existing checkbox groups.

Clicking a tag chip in the table toggles that tag filter, and clicking a context value sets the Min context filter to the nearest preset at or below it. A count on the **Filters** button shows how many filters are active, and **Clear filters** resets them all.

Your search, sort order, filters and Min context choice are remembered in the browser across reloads. Press `/` anywhere to focus the search box and `Esc` to clear it.

## Request Logs

Each request card shows what the caller **asked for** next to what it was routed to, for example `asked: auto-fastest+min_ctx:32000` or `asked: tag:coding`, plus the routing attempts and any failovers. Use the filter row to search by model, provider, selector or status, or to show only failovers or only errors.

## Setup Instructions

The Setup Instructions tab has copy-paste configuration for OpenClaw and OpenCode, including the optional [routing presets](openclaw.md#routing-options-for-openclaw-tags-min_ctx-and-exclude).

## Theme

The dashboard follows your system light/dark setting until you use the theme button, after which your choice is remembered.

---
title: Free tier notes
nav_order: 12
---

# Free tier notes

What free tiers do in practice, measured against real providers in October 2026. Limits and model lists change often, so treat these as a snapshot and check the provider's own page before relying on a number.

## Providers

| Provider | What we saw |
|---|---|
| OpenRouter | Free models are limited to 20 requests per minute, and 50 per day on a key with no credits. A one-time purchase of $10 or more in credits raises the daily limit to 1,000. A key limit of $0 still allows `:free` models. |
| OpenCode Zen | The free models answer `403 FreeTierError` ("the free tier can only be used from within OpenCode") for any other client. By default modelrelay does not imitate the OpenCode client, so these models are listed as `unsupported` and are not routed to. See [OpenCode Zen free models](#opencode-zen-free-models). |
| Ollama Cloud | The free plan answers `402` for the premium models. |
| Cerebras | Answers `402` for models outside the free allowance. |
| Google AI | Free quotas are very small, or zero for some models. |
| Requesty | 200 requests per day. Most of its free models may train on prompts. |

Free models on several providers may train on the prompts you send. Do not route private code or data through them.

## OpenCode Zen free models

OpenCode's free models are not restricted by account or entitlement. They are restricted by
*request shape*: the Zen endpoint only answers requests that look like they came from the official
OpenCode client. A request that does not is refused with `403 FreeTierError` and the message
"OpenCode's free tier can only be used from within OpenCode".

**By default modelrelay respects that restriction.** The free models appear in the model list with
status `unsupported` and are never routed to. A `403` from OpenCode describes the request, not a
retired model, so it is not a "try another model" signal either — the model is alive, the request
is not what it wants.

### Opt-in compatibility mode

If you want the free models anyway, you can turn on the compatibility mode. It makes modelrelay
imitate the official OpenCode client: it sends a matching User-Agent, a session id in the format
the endpoint expects, `stream: true`, and a tool named exactly `read`.

Set `opencodeFreeTierCompat` in `~/.modelrelay.json`, or the `MODELRELAY_OPENCODE_FREE_COMPAT=1`
environment variable. The environment variable wins over the config file. See
[Configuration](configuration.md) for details.

**Read this before you enable it.** The mode:

- imitates the official OpenCode client, which may conflict with OpenCode's terms of service;
- can stop working at any time, without a notice from OpenCode;
- means that you are responsible for using it.

modelrelay prints a warning at startup and shows one in the dashboard for as long as the mode is on.

Note: OpenCode's Zen documentation (https://opencode.ai/docs/zen) states that for some free models collected data may be used to improve the model, that the NVIDIA endpoints are trial use only ("do not submit personal or confidential data"), and that some models are geographically restricted. The existing line above that free models may train on prompts does not mention the trial or regional limits.

### What the endpoint checks

Four elements are required. Each one was verified individually against the live endpoint by
changing a single element at a time:

| Element | Required value |
|---|---|
| `User-Agent` | `opencode/<version>` (any version from 1.18.0 upwards) |
| `x-opencode-session` | `ses_` + 12 lowercase hex characters + 14 base62 characters = 30 characters in total |
| `stream` | `true` |
| `tools` | a function named exactly `read` |

A `You are opencode` system message is *not* required — the request is accepted without it.

Two details are easy to get wrong:

- The session id is validated by **shape**, not by value. The 12-character hex block is a 48-bit
  millisecond timestamp, and only the format is checked. A 32-character hex id, or an id of 28, 29
  or 31 characters, is refused.
- The `read` tool must be named exactly `read`. A differently named function does not satisfy the
  gate.

modelrelay handles the shape for you: it rewrites the request, converts the upstream's stream back
into a single JSON body for callers that asked for `stream: false`, and removes calls to the
injected `read` tool from the answer, so a caller that never declared that tool does not see an
unknown tool call in its response.

### No API key is required for the free models

The key is not what makes them work — the request shape is. Measured against the live endpoint:

| `Authorization` header | Result |
|---|---|
| absent | accepted |
| `Bearer public` | accepted |
| `Bearer ` (empty) | accepted |
| a key that is not a real OpenCode key | `500` "Invalid credential" |

A missing key is therefore harmless, but a *wrong* key is not: it fails with a server error
rather than being ignored. modelrelay sends no `Authorization` header when no OpenCode key is
configured, which is the correct behavior for the free tier. A key is still required for the paid
Zen models.

## Model ids go stale

A free variant can disappear while its slug still lists elsewhere. For example, OpenRouter answers `404` ("this model is unavailable for free") for a `:free` slug that has become paid, and names the paid slug. A model list is not proof that the model is usable, so check with a real request.

## Slow endpoints

A free endpoint that accepts a request and then stalls can hold a client for 90 seconds or more. A request timeout of about 45 seconds with a fallback to the next model removed those hangs, at the cost of an occasional one-timeout delay.

## Errors that mean "try another model"

Rate limits (`429`) and server errors (`5xx`) are not the only reasons to move on. These client errors describe the endpoint, not the request, so a retry on the same endpoint cannot succeed:

- `401`, `402`, `403`: the key or plan cannot use that model.
- `404`, `410`: the model is missing or retired. A `400` that names a missing model counts too.

A router that treats them as final answers returns the failure to the user instead of trying the next candidate. In our tests a tier built from free models failed 5 of 5 requests on `410 Gone` until it was classified this way.

## Checking a model before you rely on it

Send a tiny request and a few questions with known answers (for example "a bat and a ball cost $1.10 in total, the bat costs $1.00 more, what does the ball cost in cents?"), and record the status, the latency and whether the answer is right. Many models in a free list answer a greeting but fail simple reasoning or take far too long.

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
| OpenCode Zen | The free models answer `403 FreeTierError` ("the free tier can only be used from within OpenCode") for any other client. A router cannot use them with any key. |
| Ollama Cloud | The free plan answers `402` for the premium models. |
| Cerebras | Answers `402` for models outside the free allowance. |
| Google AI | Free quotas are very small, or zero for some models. |
| Requesty | 200 requests per day. Most of its free models may train on prompts. |

Free models on several providers may train on the prompts you send. Do not route private code or data through them.

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

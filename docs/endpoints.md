---
title: Endpoints
nav_order: 5
---

# Endpoints

## `/v1/chat/completions`

`POST /v1/chat/completions` is an OpenAI-compatible chat completions endpoint.

- Use `model: "auto-fastest"` to route to the best model overall
- Use a grouped model ID such as `minimax-m2.5`, `kimi-k2.5`, or `glm4.7` to route within that model group
- For grouped IDs, modelrelay selects the provider with the best current QoS for that group
- Use `model: "tag:<name>"` (e.g. `tag:coding`) to route to the best currently available model carrying that tag — either a curated capability tag or a custom tag you've assigned in the Web UI (see [Model tags](routing.md#model-tags)). This is useful because the free models behind modelrelay come and go as availability changes — routing by tag survives a given model disappearing, where routing by a specific model/group ID does not.
- Append `+min_ctx:<size>` to `tag:<name>` or `auto-fastest` to additionally require a minimum context window, e.g. `tag:general+min_ctx:32000` or `auto-fastest+min_ctx:128k`. `<size>` accepts a raw token count or a `k`/`m` suffix. Models whose context window can't be determined, or is smaller than the requirement, are excluded. See [Model tags](routing.md#model-tags).
- In the Web UI, pinned models can now use either `Canonical Group` mode (default, pins the same model across providers) or `Exact Provider Row` mode from `Settings`
- Streaming and non-streaming requests are both supported

## Automatic failover

If the chosen model fails, modelrelay retries the same request on a different candidate (up to 6 attempts in total, never repeating a model within one request). It fails over on:

- HTTP 429, 5xx and 410 responses
- network errors
- a 400/403 whose body looks like a rate-limit or quota error (some providers report over-capacity this way)
- a stream that returns 200 but ends on an error-shaped first chunk
- a 400/422 where the provider can't handle part of the request itself, such as a tool definition using a JSON Schema keyword its structured-output compiler doesn't support (e.g. `uniqueItems`) or a model that doesn't support tools

Other client errors, such as a genuinely malformed request, are returned to the caller immediately. If every attempt fails, the last error is returned. See [Telemetry](telemetry.md) for how failures count against a model's routing score.

## `/v1/models`

`GET /v1/models` returns the models exposed by the router.

- Model IDs are grouped slugs such as `minimax-m2.5`, `kimi-k2.5`, and `glm4.7`
- Each grouped ID can represent the same model across multiple providers
- When you select one of these IDs in `/v1/chat/completions`, modelrelay routes the request to the provider with the best current QoS for that model group
- `auto-fastest` is also exposed and routes to the best model overall
- Each entry includes a `tags` array combining curated capability tags with any user-defined tags (see [Model tags](routing.md#model-tags))

Example:

```json
{
  "object": "list",
  "data": [
    { "id": "auto-fastest", "object": "model", "owned_by": "router" },
    { "id": "minimax-m2.5", "object": "model", "owned_by": "relay", "tags": ["agentic", "general", "coding"] },
    { "id": "kimi-k2.5", "object": "model", "owned_by": "relay", "tags": ["agentic", "coding", "general"] },
    { "id": "glm4.7", "object": "model", "owned_by": "relay", "tags": ["agentic", "coding", "general"] }
  ]
}
```

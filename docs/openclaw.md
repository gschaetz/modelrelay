# OpenClaw Integration

`modelrelay onboard` can auto-configure OpenClaw.

If you want manual setup, merge this into `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "modelrelay": {
        "baseUrl": "http://127.0.0.1:7352/v1",
        "api": "openai-completions",
        "apiKey": "no-key",
        "models": [
          { "id": "auto-fastest", "name": "Auto Fastest" }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "modelrelay/auto-fastest"
      },
      "models": {
        "modelrelay/auto-fastest": {}
      }
    }
  }
}
```

## Routing options for OpenClaw: tags, `min_ctx` and `exclude`

`auto-fastest` picks the best model overall, but an agent usually needs more than that: a model whose context window actually fits OpenClaw's prompt (system prompt + tool definitions + history), and often one suited to a particular job. modelrelay's routing selectors cover this, and OpenClaw doesn't need to know anything about them — it sends whatever model ID you register under the provider as the request's `model` field, so each selector is just another entry in the provider's `models` list.

```json
{
  "models": {
    "providers": {
      "modelrelay": {
        "baseUrl": "http://127.0.0.1:7352/v1",
        "api": "openai-completions",
        "apiKey": "no-key",
        "models": [
          { "id": "auto-fastest", "name": "Auto Fastest" },
          { "id": "auto-fastest+min_ctx:128k", "name": "Auto Fastest (128k+)", "contextWindow": 131072 },
          { "id": "tag:coding+min_ctx:64k", "name": "Coding (64k+)", "contextWindow": 65536 },
          { "id": "tag:general+min_ctx:32000", "name": "General (32k+)", "contextWindow": 32000 }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "modelrelay/tag:coding+min_ctx:64k"
      },
      "models": {
        "modelrelay/tag:coding+min_ctx:64k": {},
        "modelrelay/auto-fastest+min_ctx:128k": {},
        "modelrelay/tag:general+min_ctx:32000": {}
      }
    }
  }
}
```

How the selectors behave (full details under [Endpoints](endpoints.md) and [Model tags](routing.md#model-tags)):

- **`tag:<name>`** routes to the best currently available model carrying that tag. The free models behind modelrelay come and go, so a tag keeps working when a specific model disappears. Curated tags are `coding`, `reasoning`, `general`, `fast` and `agentic`; you can add your own in the Web UI.
- **`+min_ctx:<size>`** drops models whose context window is smaller than `<size>` (a token count, or a `k`/`m` suffix) or unknown, before ranking. Pick a value comfortably above what your OpenClaw sessions send — agent prompts with tools grow quickly, so `32k` is a floor and `64k`–`128k` is safer for long sessions. modelrelay also tightens this automatically: if it has seen a provider's real rate-limit quota for a model and it's lower than the advertised context, the lower number is used.
- **`+exclude:<id1|id2>`** steers away from specific models, by bare model ID or `provider/modelId`, e.g. `tag:coding+min_ctx:64k+exclude:groq/qwen/qwen3.8-27b`. Modifiers combine in either order.
- **Set `contextWindow` to match `min_ctx`.** Without it OpenClaw assumes a default window (128k) for these entries, which can be larger than the floor you asked modelrelay for; setting it to the same size keeps OpenClaw's own context budgeting honest.
- **Models you want to use must be listed under `agents.defaults.models`** as well as under the provider — a provider entry that isn't also in that map doesn't appear in `openclaw models list`.
- A modifier modelrelay doesn't recognize is ignored rather than rejected, so check the Web UI's request log if a selector doesn't seem to be filtering as you expect.

After editing `~/.openclaw/openclaw.json`, restart OpenClaw so it picks up the new model entries. `modelrelay onboard` only writes the plain `auto-fastest` entry today; the selectors above are added by hand.

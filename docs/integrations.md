---
title: Integrations
nav_order: 2
---

# Integrations

Use `modelrelay onboard` to save provider keys and auto-configure integrations for OpenClaw or OpenCode.

```bash
modelrelay onboard
```

If you prefer manual setup, use the examples below.

## OpenCode Integration

`modelrelay onboard` can auto-configure OpenCode.

If you want manual setup, put this in `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "modelrelay",
      "options": {
        "baseURL": "http://127.0.0.1:7352/v1",
        "apiKey": "dummy-key"
      },
      "models": {
        "auto-fastest": {
          "name": "Auto Fastest"
        }
      }
    }
  },
  "model": "router/auto-fastest"
}
```

See also: [OpenClaw](openclaw.md).

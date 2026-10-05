---
title: Home
nav_order: 1
permalink: /
---

# modelrelay documentation

**modelrelay** is an OpenAI-compatible local router that benchmarks free coding models across providers and forwards your requests to the best available one. This is the reference documentation; for install and a quick start, see the [README](https://github.com/gschaetz/modelrelay#readme).

## Contents

- [Integrations](integrations.md) — `modelrelay onboard` and OpenCode setup
- [OpenClaw](openclaw.md) — setup, plus routing with `tag:`, `min_ctx` and `exclude`
- [CLI](cli.md) — commands, autostart, auto-update, config export/import
- [Endpoints](endpoints.md) — `/v1/chat/completions` and `/v1/models`
- [Routing](routing.md) — model tags, `min_ctx`, `exclude`, and how QoS weighs speed and quality
- [Telemetry](telemetry.md) — real-traffic reliability tracking and `/api/telemetry`
- [Dashboard](dashboard.md) — the web UI: Context and Reliability columns, search syntax, filters, request logs
- [Security](security.md) — admin token, host and origin checks, binding to this machine only
- [Configuration](configuration.md) — config file, environment variables, OpenAI-compatible endpoints, config migration
- [Troubleshooting](troubleshooting.md) — updates and local testing

## Links

- [GitHub](https://github.com/gschaetz/modelrelay)
- [npm](https://npmjs.com/package/@schaetzkc/modelrelay)
- [Discord](https://discord.gg/AqX6Sawq5w)

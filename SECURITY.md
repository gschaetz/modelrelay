# Security Policy

## Supported Versions

Only the latest published version of `@schaetzkc/modelrelay` is supported. Please update before reporting an issue to confirm it's still reproducible.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private reporting: go to the [Security tab](https://github.com/gschaetz/modelrelay/security) on this repository and click "Report a vulnerability." This opens a private advisory visible only to maintainers until a fix is ready.

Since modelrelay runs a local HTTP server and proxies requests (and API keys) to third-party model providers, please include in your report:
- Whether the issue involves the local server (e.g. `/v1/chat/completions`, the web dashboard), the config/key-storage handling, or a specific provider integration.
- Steps to reproduce, and the potential impact (e.g. credential exposure, request smuggling, arbitrary file access).

We'll acknowledge reports as quickly as we can and credit reporters in the fix's release notes unless you'd prefer otherwise.

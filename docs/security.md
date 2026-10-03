---
title: Security
nav_order: 9
---

# Security

modelrelay has two kinds of endpoints with different jobs, and they are protected differently.

| Endpoint | What it is | Protection |
|---|---|---|
| `/v1/*` | The OpenAI-compatible proxy your tools talk to | Open by design (any `Authorization` value is accepted and ignored). CORS is allowed so browser-based clients work. |
| `/api/*` | The admin API behind the dashboard: settings, provider keys, tags, logs | Host and origin checks, plus an optional admin token. **No CORS.** |

The admin API can read and change your provider API keys, so it is the part to protect. Anyone who can use `/v1` can spend your free-tier quota, but only the admin API can see or redirect your keys.

## What is enforced

- **Host check.** The admin API only answers requests addressed to `localhost`, an IP address, this machine's own name, or a name you list in `MODELRELAY_ALLOWED_HOSTS`. This stops *DNS rebinding*, where a web page re-points its own domain at `127.0.0.1` to talk to your router.
- **Origin check.** Browser requests from another origin (or `Sec-Fetch-Site: cross-site`) are refused. Without this, a page on any website could call the admin API with a simple request that needs no CORS preflight.
- **No CORS on `/api`.** Only `/v1` sends `Access-Control-Allow-Origin`.
- **No raw keys in lists.** `GET /api/config` returns masked keys only (`gsk_...cdef`). The dashboard fetches one full key at a time, only when you click **Show** or **Copy** (`GET /api/config/keys/:provider/:index`). Adding and removing an account key happens on the server.
- **No caching.** Admin responses are sent with `Cache-Control: no-store`.
- **Admin token (optional).** See below.
- Every response carries `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.

## Admin token

Set `MODELRELAY_ADMIN_TOKEN` to require sign-in for the admin API:

```bash
export MODELRELAY_ADMIN_TOKEN="$(openssl rand -hex 24)"
modelrelay
```

- The dashboard shows a **Sign in** screen. A successful sign-in sets an `HttpOnly`, `SameSite=Strict` session cookie (marked `Secure` when the request arrived over HTTPS) that lasts 12 hours. **Sign out** ends it.
- Scripts can send `Authorization: Bearer <token>` instead:

  ```bash
  curl -H "Authorization: Bearer $MODELRELAY_ADMIN_TOKEN" http://localhost:7352/api/models
  ```
- After 10 wrong guesses a client is locked out for 15 minutes.
- Use at least 16 random characters. The router warns at startup if the token is shorter.
- The token is read from the environment only; it is never written to the config file. The `/v1` proxy is not affected.

## Host names, reverse proxies and Docker

The host check only needs configuring when you open the dashboard through a **name** that is not `localhost`, an IP address, or the machine's own host name. In that case the admin API answers `403` with a hint until you add the name:

```bash
# comma separated; port numbers are ignored; "*" turns the host check off
export MODELRELAY_ALLOWED_HOSTS="modelrelay.example.com"
```

If a reverse proxy rewrites the `Host` header, the browser's `Origin` no longer matches it. List the public origin as well:

```bash
export MODELRELAY_ALLOWED_ORIGINS="https://modelrelay.example.com"
```

| Setup | What to do |
|---|---|
| Local use at `http://localhost:7352` | Nothing. |
| LAN access by IP address (`http://192.168.1.20:7352`) | Nothing for the checks. Set a token, because the dashboard is reachable by every device on the network. |
| LAN access by machine name (`http://mybox.local:7352`) | Nothing (the machine's own name is allowed). |
| Docker Compose with a published port | Nothing for `localhost` or IP access. Add `MODELRELAY_ADMIN_TOKEN` to the service's environment. |
| Behind a reverse proxy or Kubernetes ingress | Set `MODELRELAY_ALLOWED_HOSTS` (and `MODELRELAY_ALLOWED_ORIGINS` if the proxy changes `Host`), and a token. The `/v1` traffic from other services is not affected. |

Health checks that only open a TCP connection are not affected by any of this.

## Binding to this machine only

By default the router listens on every network interface, because the dashboard and proxy are often used from other devices, containers and VMs. To keep it reachable from this machine only:

```bash
modelrelay --host 127.0.0.1
# or
export MODELRELAY_HOST=127.0.0.1
```

Starting without `--host` and without a token prints a warning that the admin API is reachable from your network.

The default has **not** been changed, because making loopback the default would break working setups:

| Who | Effect of a loopback default |
|---|---|
| One machine, tools on the same machine | None. |
| Dashboard or proxy used from another device (the startup message prints the LAN address) | Breaks until they start with `--host 0.0.0.0`. |
| OpenClaw or another tool in Docker or a VM reaching the host (`host.docker.internal`, a bridge IP) | Breaks: those connections do not arrive on the loopback interface. |
| The Docker image | Would have to set `MODELRELAY_HOST=0.0.0.0` for published ports to work. |
| Kubernetes | Same as Docker. |

Recommendation: if everything runs on one machine, use `--host 127.0.0.1`. Otherwise keep the default and set an admin token.

## Reporting a problem

See the repository's [security policy](https://github.com/gschaetz/modelrelay/blob/master/SECURITY.md).

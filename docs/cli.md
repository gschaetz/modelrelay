---
title: CLI
nav_order: 4
---

# CLI

```bash
modelrelay [--port <number>] [--host <address>] [--log] [--ban <model1,model2>]
modelrelay onboard [--port <number>]
modelrelay install --autostart
modelrelay start --autostart
modelrelay uninstall --autostart
modelrelay status --autostart
modelrelay update
modelrelay autoupdate [--enable|--disable|--status] [--interval <hours>]
modelrelay autostart [--install|--start|--uninstall|--status]
modelrelay config export
modelrelay config import <token>
```

Request terminal logging is disabled by default. Use `--log` to enable it.

`--host <address>` sets the network interface the router listens on (default: all interfaces). Use `--host 127.0.0.1` to keep the router reachable from this machine only. See [Security](security.md).

`modelrelay install --autostart` also triggers an immediate start attempt so you do not need a separate command after install.

During `modelrelay onboard`, you will also be prompted to enable auto-start on login.

`modelrelay update` upgrades the global npm package and, when autostart is configured, stops the background service first and starts it again after the update.

Auto-update is enabled by default. While the router is running, modelrelay checks npm periodically (default: every 24 hours) and applies updates automatically.

Use `modelrelay autoupdate --status` to inspect state, `modelrelay autoupdate --disable` to turn it off, and `modelrelay autoupdate --enable --interval 12` to re-enable with a custom interval.

Use `modelrelay config export` to print a transferable config token (base64url-encoded JSON), and `modelrelay config import <token>` to load it on another machine.
You can also import by stdin:

```bash
modelrelay config export | modelrelay config import
```

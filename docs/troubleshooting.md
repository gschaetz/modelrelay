# Troubleshooting

## Clicking the update button or running `modelrelay` won't perform an update

To trigger a manual npm update and restart the service, run:

```bash
npm i -g @schaetzkc/modelrelay@latest
modelrelay autostart --start
```

## Testing updates locally without publishing to npm

You can point the updater at a local tarball instead of the npm registry:

```bash
npm pack
MODELRELAY_UPDATE_TARBALL=./modelrelay-1.8.3.tgz pnpm start
```

If you want the Web UI to always show an update while testing, set a higher forced version:

```bash
MODELRELAY_FORCE_UPDATE_VERSION=9.9.9
```

If the tarball filename does not contain a semantic version, also set:

```bash
MODELRELAY_UPDATE_VERSION=1.8.3
```

When `MODELRELAY_UPDATE_TARBALL` is set, the Web UI update flow and `modelrelay update`
install from that tarball and bypass the normal Git checkout update block. This is for
local testing only. `MODELRELAY_FORCE_UPDATE_VERSION` only affects version detection; the
actual install still comes from the tarball path.

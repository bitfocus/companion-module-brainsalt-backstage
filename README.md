# companion-module-brainsalt-backstage

A [Bitfocus Companion](https://bitfocus.io/companion) module for controlling a
**Brainsalt Backstage** media server over its show-control protocol.

See [`companion/HELP.md`](companion/HELP.md) for the end-user setup and the full list
of actions, feedbacks and variables. Full Backstage documentation:
[help.brainsalt.com](https://help.brainsalt.com).

## Quick start (users)

1. In Backstage: **Settings → Remote Control → Enable Show-Control Protocol** (then
   *Apply / Restart Protocol Server*). Leave **Enable Bitfocus Companion** on.
2. In Companion: add the **Brainsalt: Backstage** connection and enter the Backstage
   host, TCP port (default **7400**) and — if set in Backstage — the auth token.

All show-control entities (steppers, sequencers, broadcast schedulers, calibrators,
audio mixers, NDI inputs, node endpoints) are discovered automatically.

## Development

```sh
corepack enable  # once per machine - provides the pinned yarn version
yarn             # install dependencies (required — node_modules is not committed)
yarn build       # compile TypeScript src/ -> dist/
yarn dev         # watch-compile while developing
yarn lint        # eslint
yarn package     # build + pack an importable .tgz (companion-module-build)
```

`yarn package` writes `pkg/` and a `.tgz` (both gitignored). The `.tgz` can be imported
into any Companion ≥3.4 via **Modules → Import module package** — useful for sharing test
builds without the module store or a dev setup.

- Source: `src/` (TypeScript, ES2022). Compiled output: `dist/`.
- Built against `@companion-module/base` `~1.14.0` (Companion 3.x / 4.x, node18 runtime).

### Loading a local build into Companion

In the Companion **launcher** window → gear/**Settings** → **Developer modules path**,
point it at the folder that *contains* this module directory, then restart Companion.
The connection appears in **Connections → Add connection** with a *Dev* badge.

> Dependencies are not committed. After cloning, run `yarn` before loading the
> module in Companion, or it will fail with `Cannot find module '@companion-module/base'`.

## License

MIT — see [LICENSE](LICENSE). © 2026 Brainsalt Media GmbH

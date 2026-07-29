# Easy Candle (Electron)

Desktop port of Easy Candle — Binance candle chart with UTC replay, indicators, drawings, and paper trading.

## Stack

- Electron + electron-vite
- React 19 + TypeScript
- Zustand, lightweight-charts, Tailwind CSS
- electron-builder + electron-updater (GitHub Releases)

## Develop

```bash
yarn install
yarn dev
```

## Test

```bash
yarn test
```

## Package locally (no publish)

```bash
yarn dist          # current platform
yarn dist:win      # Windows NSIS (GitHub Releases installer)
yarn dist:win:appx # Windows AppX for Microsoft Store (local only)
yarn dist:mac
yarn dist:linux
```

Artifacts land in `release/`.

### Microsoft Store (AppX) — local only

GitHub Releases stay **NSIS-only**. Build the Store package on a Windows machine:

```bash
yarn dist:win:appx
```

Upload the `.appx` from `release/` in Partner Center (MSIX/AppX product). Before submission, set `appx.identityName` and `appx.publisher` in `electron-builder.yml` to match Partner Center package identity.

Store / AppX builds skip GitHub `electron-updater` (`process.windowsStore`); the Store delivers updates for that install. NSIS installs keep GitHub auto-update.

## Release (auto-build + auto-update)

Publishes to [easy-candle/easy-candle](https://github.com/easy-candle/easy-candle) GitHub Releases.

1. Bump `version` in `package.json`
2. Commit and tag: `git tag v2.0.2 && git push origin v2.0.2`
3. GitHub Actions builds Windows (**NSIS** x64 only), macOS (zip arm64), and Linux (AppImage x64) **in parallel with `--publish never`**
4. A single `publish` job then creates one GitHub Release and uploads all installers + `latest*.yml` update metadata (avoids multi-job release races)
5. NSIS/macOS/Linux packaged apps check for updates on startup, ask before downloading, show progress, then offer restart (or install on quit)

Requires `contents: write` on the workflow (already set) so `GITHUB_TOKEN` can create the release.

If a previous tag’s release is incomplete, delete that GitHub Release before tagging a new version.

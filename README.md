# Easy Candle

Desktop port of Easy Candle — Binance candle chart with UTC replay, indicators, drawings, and paper trading.

## Stack

- Tauri 2 + Vite
- React 19 + TypeScript
- Zustand, lightweight-charts, Tailwind CSS
- Rust backend commands (klines via reqwest, import store, updater)

## Prerequisites

- Node.js 20+ and Yarn
- Rust (stable) via [rustup](https://rustup.rs)
- Windows: Visual Studio 2022 Build Tools with the "Desktop development with C++" workload
- Linux: WebKitGTK 4.1 dev packages (see `.github/workflows/ci.yml`)
- macOS: Xcode command line tools

## Develop

```bash
yarn install
yarn tauri dev
```

## Test

```bash
yarn test
```

Rust unit tests (MT text decoder):

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## Package locally (no publish)

```bash
yarn dist          # default bundles for current platform
yarn dist:win      # Windows NSIS
yarn dist:mac      # macOS app + dmg
yarn dist:linux    # Linux AppImage + deb
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Release (auto-build + auto-update)

Publishes to [easy-candle/easy-candle](https://github.com/easy-candle/easy-candle) GitHub Releases.

1. Bump `version` in `package.json` **and** `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`
2. Commit and tag: `git tag v2.6.0 && git push origin v2.6.0`
3. GitHub Actions builds Windows (NSIS x64), macOS (aarch64 app + dmg), and Linux (AppImage + deb) **in parallel** and creates one GitHub Release
4. `tauri-action` uploads installers plus the signed updater manifest (`latest.json`) used by `tauri-plugin-updater`

### Auto-update signing

Releases are signed so the in-app updater can verify them. Requires two repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — the base64 private key (no password)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — optional password (empty for the generated key)

Generate a keypair locally (never commit the private key):

```bash
yarn tauri signer generate -w ~/.tauri/easy-candle.key
yarn tauri signer print -w ~/.tauri/easy-candle.key.pub
```

Copy the printed public key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

If the secrets are missing, release builds still succeed but the updater manifest is not produced and the app will show "You are up to date".
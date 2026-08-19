<p align="center">
  <img src="build/icon.png" alt="Easy Candle" width="128" height="128">
</p>

# Easy Candle (Electron)

Desktop port of Easy Candle — a Binance-powered charting and trading-practice workstation. It pulls real Binance candles across many symbols (BTC, ETH, SOL, …) and timeframes (1m–1d), then lets you step through history candle by candle in UTC to study price action. Built-in indicators, drawing tools (trend lines, horizontal lines, rectangles, Fibonacci retracement) and split-pane charts make analysis flexible, while the paper-trading engine lets you practice long/short entries with position sizing, risk/reward guides, stop-loss/take-profit and live PnL tracking. Import your own CSV data, snapshot the chart as an image, and enjoy a fast dark UI with themes, keyboard shortcuts and automatic updates.

[![Version](https://img.shields.io/github/v/release/easy-candle/easy-candle?label=Version&color=blue)](https://github.com/easy-candle/easy-candle/releases/latest)
[![Download](https://img.shields.io/github/downloads/easy-candle/easy-candle/total?label=Downloads)](https://github.com/easy-candle/easy-candle/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/easy-candle/easy-candle)

## Stack

- Electron + electron-vite
- React 19 + TypeScript
- Zustand, lightweight-charts, Tailwind CSS
- electron-builder + electron-updater (GitHub Releases)

## Download

<div align=left>
    <table>
        <thead align="left">
            <tr>
                <th>OS / Arch</th>
                <th>Compatibility</th>
            </tr>
        </thead>
        <tbody align="left">
            <tr>
                <td>
                    <a href="https://github.com/easy-candle/easy-candle/releases/latest/download/easy-candle-2.7.0-setup.exe"><img src="https://img.shields.io/badge/Windows-Setup x64-0C88D8.svg?logo=gitforwindows"></a>
                </td>
                <td>10+</td>
            </tr>
            <tr>
                <td>
                    <a href="https://apps.microsoft.com/detail/9n91gnr9sj14?cid=DevShareMCLPCS&hl=en-US&gl=NL"><img src="https://img.shields.io/badge/Microsoft_Store-Get it from Microsoft-0D8BF0.svg?logo=microsoftstore"></a>
                </td>
                <td>10+</td>
            </tr>
            <tr>
                <td>
                    <a href="https://github.com/easy-candle/easy-candle/releases/latest/download/easy-candle-2.7.0-arm64-mac.zip"><img src="https://img.shields.io/badge/macOS-ZIP arm64-F0F0F1.svg?logo=apple"></a>
                </td>
                <td>10.15+</td>
            </tr>
            <tr>
                <td>
                    <a href="https://github.com/easy-candle/easy-candle/releases/latest/download/easy-candle-2.7.0.AppImage"><img src="https://img.shields.io/badge/GNU/Linux-AppImage x64-EDC204.svg?logo=linux"></a>
                </td>
                <td>
                    GNU/Linux (glibc)
                </td>
            </tr>
        </tbody>
    </table>
</div>

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
yarn dist:mac
yarn dist:linux
```

Artifacts land in `release/`.

## Release (auto-build + auto-update)

Publishes to [easy-candle/easy-candle](https://github.com/easy-candle/easy-candle) GitHub Releases.

1. Bump `version` in `package.json`
2. Commit and tag: `git tag v2.0.2 && git push origin v2.0.2`
3. GitHub Actions builds Windows (**NSIS** x64 only), macOS (zip arm64), and Linux (AppImage x64) **in parallel with `--publish never`**
4. A single `publish` job then creates one GitHub Release and uploads all installers + `latest*.yml` update metadata (avoids multi-job release races)
5. NSIS/macOS/Linux packaged apps check for updates on startup, ask before downloading, show progress, then offer restart (or install on quit)

Requires `contents: write` on the workflow (already set) so `GITHUB_TOKEN` can create the release.

If a previous tag’s release is incomplete, delete that GitHub Release before tagging a new version.

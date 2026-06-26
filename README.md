# OpenFit Ultrahuman

A private, desktop-first Electron dashboard for the **Ultrahuman Ring** (via the UltraSignal Partner API), with an AI health assistant.

> This is a personal fork of [FlavioAdamo/openfit](https://github.com/FlavioAdamo/openfit), rebuilt around the Ultrahuman Ring instead of Google Fitbit/Health. All credit for the original dashboard architecture, data normalization layer, and Electron scaffolding belongs to the upstream authors.

## Screenshots

**Today** — overview of movement, sleep, and resting heart rate, with per-hour step activity, sleep stages and score, and nightly signals (HRV):

![Today dashboard](screenshots/today-dashboard.png)

**Health** — cardiac and physiological signals over time: heart rate trend with resting and range markers, plus nightly metrics (HRV) and other measurements (cardio fitness, irregular-rhythm checks):

![Health view](screenshots/health-view.png)

## What changed from upstream

| | Original (openfit) | This fork (openfit-ultrahuman) |
|---|---|---|
| Health data | Google Fitbit / Fitbit devices | **Ultrahuman Ring** via UltraSignal Partner API |
| Authentication | OAuth 2.0 (Google Cloud) | Static API key (UltraSignal Partner token) |
| AI assistant | Codex Desktop (local subprocess) | **MiniMax HTTP API** (any model via HTTP) |
| Credentials | OAuth tokens in Keychain | API key + email in Electron safeStorage |

The core architecture — IPC contract, React UI, encrypted cache, and the Fitbit-to-DashboardData normalization layer — is preserved unchanged.

## Data path

```
Ultrahuman Ring → Ultrahuman app cloud
                         │
                         v
              UltraSignal Partner API → openfit-ultrahuman
```

## Quick start

Requirements: Node.js 22+, npm 10+

```bash
git clone https://github.com/light-saber/openfit-ultrahuman.git
cd openfit-ultrahuman
npm install
export MINIMAX_API_KEY=***        # your MiniMax API key
npm run dev
```

On first launch the app prompts for your **Ultrahuman email** and **UltraSignal Partner token**. These are stored in your system's credential store via Electron's `safeStorage` — never written to disk or exposed to the renderer.

## Credentials

- **UltraSignal Partner Token** — from your UltraSignal Partner account
- **Partner Code** — your UltraSignal Partner ID
- **MiniMax API Key** — for the chat assistant (any OpenAI-compatible model works via the HTTP adapter)

## Useful commands

```bash
npm run build       # Type-check and bundle the renderer
npm test            # Run normalizer and adapter tests
npm run check:electron  # Syntax-check all Electron .cjs files
npm run dist        # Package for macOS / Windows / Linux
```

## Project structure

```
electron/
  main.cjs                    Electron shell, IPC, encrypted credential storage
  preload.cjs                 Minimal typed IPC bridge
  ultrahuman-service.cjs      UltraSignal Partner API → Fitbit Legacy format adapter
  minimax-service.cjs         HTTP adapter for MiniMax (CodexService-compatible interface)
  codex-service.cjs           [retained from upstream]
  google-health-service.cjs   [retained from upstream]
  fitbit-legacy-service.cjs   [retained from upstream]
  health-cache.cjs            Encrypted local health cache
src/
  components/                 Views, charts, and assistant-ui chat
  data/                       Demo data and provider-independent normalization
  hooks/                      React data-loading and state hooks
  lib/                        Formatting, health assistant, and pure utilities
  App.tsx                     UI and connection-state orchestration
  types.ts                    Shared renderer/preload contracts
docs/
  ARCHITECTURE.md
  DATA_COVERAGE.md
  GOOGLE_HEALTH_SETUP.md
  HOME_DASHBOARD_MODEL.md
  RELEASE.md
screenshots/                  README images
```

## Health assistant

The chat panel uses the **MiniMax HTTP API** (configurable to any model). On each message, openfit-ultrahuman sends a compact context window: normalized metrics for the selected day, available date range, and summary stats. No credentials or raw API responses are ever sent to the LLM.

## Original openfit references

- [FlavioAdamo/openfit](https://github.com/FlavioAdamo/openfit) — the upstream project
- [Google Health API documentation](https://developers.google.com/health)
- [Ultrahuman Partner API docs](https://ultrahumanapp.notion.site/API-Documentation-5f32ec15ef6b4fa5bc8249f7b875d212)

Icons: Nucleo Essential Outline (c) Nucleo, used under the [Nucleo license](https://nucleoapp.com/license/).

The information displayed is not a diagnosis or medical advice.

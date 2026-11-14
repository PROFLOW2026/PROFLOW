# EXLFY full regression — isolated Playwright harness

| Setting | Value |
|---------|--------|
| **Date** | 2026-11-14 |
| **DB mode (effective)** | `postgres` — local disposable `projectflow_e2e` |
| **DB URL** | `postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e` |
| **PGlite attempt** | Ports `56542`, `56432`, `56650`, `55433` — **failed** (`ECONNRESET` / sign-in error boundary on Windows) |
| **PGlite port (documented isolation)** | `56542` intended when PGlite is stable |
| **Auth port** | `55321` (harness stand-in) |
| **App port** | `3100` (`http://127.0.0.1:3100`) |
| **Workers** | `1` (Playwright config + CLI) |
| **Build** | Reuse existing `.next` (`E2E_SKIP_BUILD=1`) |
| **Fresh servers** | `E2E_FORCE_FRESH_SERVER=1` |
| **Production** | Not used |

## Commands

```powershell
$env:E2E_DATABASE_PORT='56542'
$env:E2E_FORCE_FRESH_SERVER='1'
$env:E2E_SKIP_BUILD='1'
$env:NODE_OPTIONS='--max-old-space-size=10240'
npx playwright test --config docs/audits/evidence/exlfy-full-regression-2026-11/runtime/playwright.regression.config.ts --workers=1 ...
```

Artifacts: `playwright-results.json`, `playwright-report/`, `playwright-output/`, `screenshots/viewports/`, `RUN_LOG.txt`.

# Route & nav verification ledger summary (2026-10-09)

| Layer | Denominator | Accounted | Evidence file |
|-------|------------:|----------:|---------------|
| **Inventory** | 387 | 387 | `_verification-routes-resolved.json` |
| **Owner `(app)` browser** | 246 | 246 | `_verification-route-matrix-results.json` |
| **Public** | 14 | 0 browser | **NOT VERIFIED** — persona sweep blocked (harness session ended after 1h owner sweep) |
| **Contractor** | 35 | 0 browser | same blocker; prior partial login fail `ECONNRESET` |
| **Employee** | 92 | 0 browser | same blocker; employee login timeout in 136462 |
| **NAV_ITEMS** | 60 | 60 | `_verification-nav-matrix-results.json` |

## Owner browser outcomes (246)

| Status | Count | Typical cause |
|--------|------:|----------------|
| VERIFIED_LOAD | 104 | HTTP 200, main visible, no overflow @320 |
| ERROR (timeout) | 78 | `page.goto` 45s exceeded (RSC / PGlite load under sweep) |
| ERROR (closed target) | 45 | browser/context closed mid-sweep (1h run) |
| ERROR (other) | 19 | ERR_ABORTED, stream closed, MISSING_MESSAGE pages |

## NAV (60)

| Status | Count | Keys |
|--------|------:|------|
| VERIFIED_LOAD | 58 | all except reports, settings |
| OVERFLOW_BROKEN | 1 | `reports` @320 |
| ERROR | 1 | `settings` — ERR_ABORTED (redirect stuck on `/overhead`) |

Per-row detail: JSON files above. No screenshots.

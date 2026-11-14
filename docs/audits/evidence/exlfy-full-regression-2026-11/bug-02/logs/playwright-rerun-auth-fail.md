# BUG-02 Playwright re-run — auth gate FAIL

**When:** 2026-11-14 ~00:33Z  
**Log:** `runtime/RUN_LOG_BUG02.txt`  
**Result:** `setup-owner` timeout 45s on `waitForAuthenticatedShell` (`sign-in.ts:24`). **3 bug02-payroll tests did not run.**

**Classification:** **HARNESS FAILURE** (owner sign-in flake / settle) — not a BUG-002 product reproduction.

**Follow-up:** Retry after `node scripts/.reset-e2e-postgres-db.mjs` + `E2E_HARNESS_SETTLE_MS≥15000` on a quiet port 3100 (avoid concurrent Playwright workers).

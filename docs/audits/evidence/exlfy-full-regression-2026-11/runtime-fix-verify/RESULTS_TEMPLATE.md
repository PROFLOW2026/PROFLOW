# EXLFY fix-verify — runtime results (lead fill-in)

**Run command:**

```powershell
npx playwright test --config docs/audits/evidence/exlfy-full-regression-2026-11/runtime-fix-verify/playwright.fix-verify.config.ts --workers=1
```

**Commit SHA:**  
**Harness:** `E2E_DATABASE_MODE` / `DATABASE_URL` / date  
**Playwright report:** `runtime-fix-verify/playwright-report/index.html`  
**JSON:** `runtime-fix-verify/playwright-results.json`

## Verdict summary

| Area | Bugs | Verdict | Notes |
|------|------|---------|-------|
| payroll confirm UI / three concepts | 001,002,004 | | |
| applied cost correction path | 002 | | |
| paid amount update UI | 002 | | |
| retro history | 002 | | |
| past-month roll-forward | 001 | | |
| PDF zoom/pan | 003 | | |
| FAB hide on composer | 005 | | |
| Live Share authz | 011 | | |
| BOQ sheet-mark link | 013 | | |
| multi-org badges | 012 | | |
| global search | 014 | | |
| project goals main | 009,015 | | |
| project goals employee | 015 | | |
| project goals contractor | 015 | | |
| Today lens + errors | 010,016 | | |
| money ₪ display | 004 | | |

## Classification counts

| Verdict | Count |
|---------|-------|
| VERIFIED_PASS | |
| VERIFIED_FAIL | |
| HARNESS | |
| UNVERIFIED | |
| UNVERIFIED_E2E | |
| DEVICE_UNAVAILABLE | |

## Harness blockers

- 

## Product regressions (VERIFIED_FAIL)

- 

## Follow-ups

- 
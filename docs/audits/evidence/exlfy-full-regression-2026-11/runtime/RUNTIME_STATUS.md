# Runtime / E2E status (wave completion)

**Updated:** 2026-11-14 (wave2 business / PDF / viewport gaps)

## Completed in this completion wave (isolated / no Production)

| Item | Result | Path |
|------|--------|------|
| Flight Date props probe (BUG-02) | PASS — 7 Date paths | `bug-02/flight-incompatible-props.json` |
| PDF transform vs scroll model (BUG-03) | PASS model | `bug-03/scroll-extent-probe.json` |
| drawing-visibility unit | PASS | tests log |
| infra permissions-parity unit | PASS | tests log |
| quick-create-fab unit | PASS (also proves `isFocusedComposerPath` unused) | tests |
| owner accrual invariant | PASS | tests |
| BUG-001 business semantics write-up | DONE | `bug-01/BUSINESS_SEMANTICS.md` |
| Live Share authz write-up | DONE | `surfaces/LIVE_SHARE_AUTHZ.md` |
| E2E DB reset (`projectflow_e2e`) | PASS recreate | local postgres only |
| Playwright single-shot (partial) | **12 PASS / 16 FAIL** | `RUN_LOG_FULL.txt` |
| Viewport smoke (320–1280 + dark) | **17/17 PASS** | `RUN_LOG_VIEWPORT.txt`, `screenshots/viewports/` |
| Viewport gaps 360/430/1920 | **3/3 PASS** | `exlfy-viewport-gaps.spec.ts` |
| Business flows audit | Soft PASS; deep steps HARNESS/UNVERIFIED | `BUSINESS_FLOWS_RESULTS.md` |
| PDF interactive wave2 | HARNESS / UNVERIFIED | `PDF_MOBILE_WAVE2.md` |
| Portal smoke (contractor/employee) | **FAIL** | `RUN_LOG_PORTAL.txt` |
| FAB vs bottom-nav (isolated) | **PASS** | `FOCUSED_E2E_RESULTS.md` |
| Coverage matrix | DONE | `RUNTIME_COVERAGE_MATRIX.md` |
| BUG-02 deep-link re-run | **HARNESS FAIL** at setup-owner (45s auth timeout); 3 tests not run | `RUN_LOG_BUG02.txt`, `bug-02/logs/playwright-rerun-auth-fail.md` |
| BUG-02 retry (auth rewrite) | **HARNESS FAIL** — port `55321` already in use by concurrent harness | `RUN_LOG_BUG02.txt` (exit 1) |
| Parallel portal harness start | Auth stub/server came up then killed (`exit -1`); Next `start` failed — **no production `.next` build** (`BUILD_EXIT=-1` interrupted) | `portal-diagnosis/*` |
| BUG-02 after port clear | **HARNESS FAIL** — webServer: missing `.next` build id | `RUN_LOG_BUG02.txt` |
| E2E `npm run build` (auth public env) | **FAIL** exit 1 (~7s) — see `bug-02/logs/e2e-build.txt` | rebuild required before deep-link E2E |
| Poll for `.next/BUILD_ID` (PID 28952) | Process ended; **FINAL_NO_BUILD_ID** | harness still blocked for `next start` |
| BUG-02 next-dev E2E | **with paymentId: PASS** (no crash); without: **HARNESS** DB timeout | `bug-02/logs/playwright-with-paymentId-verdict.json` |
| Full `next build` for E2E | Compiled OK (~8m) then **killed during TypeScript** (`exit -1`) — no clean BUILD_ID path | portal/BUG-02 agents used `next dev` instead |
| Portal `next start` | **FAIL** — missing production `.next` BUILD_ID | same harness gap |
| Three-surface diagnosis | contractor + employee `single99` login **PASS**; prior FAILs = **HARNESS** | `THREE_SURFACE_RUNTIME.md` |
| Business + PDF/mobile wave2 | viewports 360/430/1920 **PASS**; expenses/hubs **PASS**; deep writes/PDF live **HARNESS/UNVERIFIED** | `BUSINESS_FLOWS_RESULTS.md`, `PDF_MOBILE_WAVE2.md` |

## Playwright single-shot result (2026-11-14)

**Command:** reset e2e postgres → config `runtime/playwright.regression.config.ts`, workers=1.  
**Duration:** ~35.8m · **exit 1**

| Project / area | Result |
|----------------|--------|
| `setup-owner` authenticate | **PASS** (1.5s) — auth blocker from earlier wave **cleared** in this run |
| `desktop-he-authenticated` release-smoke + overnight | **PASS** (dashboard, projects, hubs, expenses, nav, overnight RTL) |
| `mobile-he` early shell audit (dashboard…project-documents) | **PASS** (5) |
| `mobile-he` from `project-files-alias` onward + mobile.spec + workforce + overnight mobile | **FAIL 16** — timeouts 60–180s; `page.goto` → `net::ERR_ABORTED` / frame detached on `127.0.0.1:3100` |
| `regression-viewport` / `regression-portal` | **לא הורצו בפועל** (אין התאמות בסינון הקבצים / לא הופיעו בסיכום) |

**פרשנות:** כשלים מרוכזים ב־`mobile-he` אחרי סדרת PASS נראים כ**חוסר יציבות webServer / ניווט** (ERR_ABORTED), לא כהוכחת באג מוצר ספציפי לכל מסך שנכשל. אין stack ל־BUG-002 מריצה זו (לא כלל deep-link אישור שכר).

WebServer log במהלך הריצה: `authorization_denied` / `Not allowed` על revalidate org-authz cache (digest `pf:authorization_denied`) — לתיעוד; לא סווג כממצא P0 בנפרד ללא שחזור ממוקד.

## Blocked / still open

| Item | Status | Blocker |
|------|--------|---------|
| BUG-02 browser stack / «משהו השתבש» | **UNVERIFIED** | לא נכלל בריצה; צריך ספק deep-link EMC |
| BUG-02 Flight Date-only crash | **DISPROVEN as sole cause** | `bug-02/flight-harness-output.json` |
| Viewport 360/430/1920 dashboard | **PASS** | Wave2 gaps |
| Live PdfJsViewer pointer/touch | **HARNESS** | Storage reconnect / OCR job |
| Business deep writes (expense create, task status, RFQ) | **UNVERIFIED / HARNESS** | See `BUSINESS_FLOWS_RESULTS.md` |
| Contractor portal E2E | **FAIL** (prior) | `RUN_LOG_PORTAL.txt` |
| Production SHA | BLOCKED | Vercel team SSO consent |
| Production migrations | BLOCKED | No approved read-only DB session |
| Real Android/iOS PDF | UNVERIFIED | No device lab |

## Policy

All runtime work uses E2E harness / local `projectflow_e2e` / PGlite / in-memory storage only. No Production writes.

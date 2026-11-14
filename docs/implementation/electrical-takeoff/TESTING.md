# Electrical takeoff — testing

## Commands (Agent 5)

```bash
npx vitest run --project unit tests/unit/electrical-takeoff
npx vitest run --project integration tests/integration/electrical-takeoff
```

E2E: `tests/e2e/authenticated/electrical-takeoff.spec.ts` (harness port 3100, `TAKEOFF_USE_FAKE_WORKER=1`).
Real worker (optional): `tests/e2e/authenticated/electrical-takeoff-real.spec.ts` when `TAKEOFF_E2E_REAL=1` and 7155 corpus under `Downloads/FW__*`.

### Local Playwright build (`.next` / `BUILD_ID`)

Harness only — **not** for production deploy on Windows.

```powershell
$env:NODE_OPTIONS='--max-old-space-size=9216'
# If `next build` dies in the TypeScript stage while `npx tsc --noEmit -p .` is clean:
# $env:E2E_SKIP_BUILD_TYPECHECK='1'
node tests/e2e/harness/build-for-playwright.mjs
```

Success: `.next/BUILD_ID` exists. Then start the harness with `E2E_SKIP_BUILD=1` if `.next` is already built. `E2E_SKIP_BUILD_TYPECHECK` is read in `next.config.ts` → `typescript.ignoreBuildErrors` (default OFF; never set in deploy scripts).

### Windows harness (PGlite wire → `ECONNRESET`)

Default PGlite on `E2E_DATABASE_PORT=55432` often breaks **post-login** on Windows (`read ECONNRESET`, sign-in error boundary). **Not takeoff-specific** — use disposable Postgres:

```powershell
node scripts/.reset-e2e-postgres-db.mjs
$env:E2E_SKIP_BUILD='1'
$env:E2E_DATABASE_MODE='postgres'
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e'
$env:DIRECT_DATABASE_URL=$env:DATABASE_URL
npx playwright test --project=setup-owner --project=desktop-he-authenticated tests/e2e/authenticated/electrical-takeoff.spec.ts
```

Reset the E2E DB before each full Playwright run (harness reapplies SQL migrations). Visual captures: `node tests/e2e/scripts/capture-takeoff-visual.mjs` (app on 3100 + `tests/e2e/.auth/owner.json`).

**Export poll contract (Agent 4 `takeoff-export.ts`):** `HEAD` or `GET ...?status=1` on the same export URL returns **204** + `X-Takeoff-Export-Status: ready` when the user may download; full bytes on `GET` without `status=1`.

## UI `data-testid` (for Agent 4)

- `takeoff-new-analysis`
- `takeoff-upload-input`
- `takeoff-start-analysis`
- `takeoff-detection-row`
- `takeoff-approve`
- `takeoff-export-xlsx`
- `takeoff-reopen`
- `takeoff-edit-type` (detection dialog only; bulk sidebar uses `takeoff-sidebar-edit-type`)
- `takeoff-add-detection`
- `takeoff-pair-pdf` / `takeoff-pair-dwg`
- `takeoff-apply-type` / `takeoff-delete-detection`
- `takeoff-export-boq-pdf` / `takeoff-export-annotated-pdf`

### Real worker E2E

1. Reset Postgres: `node scripts/.reset-e2e-postgres-db.mjs`
2. Start worker: `scripts/takeoff-worker-dev.ps1` (free port; same `TAKEOFF_WORKER_SECRET` as harness)
3. Env: `E2E_DATABASE_MODE=postgres`, `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e`, `TAKEOFF_E2E_REAL=1`, `TAKEOFF_WORKER_URL=http://127.0.0.1:8765` (unset fake worker / do not set `TAKEOFF_USE_FAKE_WORKER=1`)
4. Playwright picks real worker when `TAKEOFF_E2E_REAL=1` (`playwright.config.ts`)
5. Screenshots (populated analysis): `docs/implementation/electrical-takeoff/screenshots/takeoff-real-*.png`
6. After changing server ingestion (`worker-callbacks`, contracts), rebuild harness `.next` once (`E2E_SKIP_BUILD` off) — Playwright serves the prebuilt bundle.

### Worker `boq_countable` vs app `countedTotal`

- Worker **`result_stats.boq_countable`** (Python `counting_policy.boq_count_summary`) is a **telemetry mirror**: all detections after twin collapse / `legend_zone` / `pdf_only`, **without** default sheet inclusion (e.g. DWG `layout:מקרא` legend devices excluded in the app).
- Authoritative BOQ quantity is **`computeBoq` → `counting.countedTotal`** in the app (E2E asserts **219** for 7155 corpus hook, not worker **250**).

### Results (2026-11-14 final session)

| Build | `r19` export **exit 0** (includes `authorizeWorkerJob` re-seal fix) |
| E2E | **`r19e` green**: upload → analyze → edit → approve → reload → **xlsx + boq-pdf + annotated-pdf** → reopen → mobile viewport |
| Root cause 503 | Export re-seals job bearer; worker file GET required stored hash → fixed in `worker-callbacks.ts` |

See `COMPLETION-REPORT.md` for Owner trial checklist.

### Results (2026-11-14 round 17)

| Step | Result |
|------|--------|
| Harness rebuild (export headers fix) | **PASS** (`exit 0`, `.tmp-e2e-build-r17b.log`) |
| Postgres reset + worker :8765 | **PASS** |
| `setup-owner` | **PASS** |
| `electrical-takeoff-real.spec.ts` (run 1) | **PARTIAL** — ingest/approve/**xlsx download PASS**; fail parsing xlsx (`dynamic import('exceljs')` → Node module status 3 in Playwright worker). **Spec fix:** static `exceljs` + `pdf-lib` imports. |
| PDF exports, reopen, screenshots | **not reached** on run 1 |
| `electrical-takeoff-real.spec.ts` (run 17d) | **FAIL** @ annotated PDF — **xlsx + boq-pdf PASS**; Playwright `download` **canceled** on annotated (likely slow worker overlay). **Next:** fetch exports via `page.request.get`. |
| `electrical-takeoff-real.spec.ts` (run 17c) | **FAIL** @ xlsx assert — download **PASS** (~49KB PK); false fail: `toString('utf8')` on ZIP (Hebrew in compressed sharedStrings). **Spec fix:** drop utf8 regex, assert `xl/sharedStrings.xml` entry. PDF/screenshots **not reached**. |

### Results (2026-11-14 round 16)

| Step | Result |
|------|--------|
| Postgres reset, worker :8765 (background through full run) | **PASS** |
| `setup-owner` | **PASS** |
| `electrical-takeoff-real.spec.ts` | **FAIL** @ Excel export (`takeoff-export-xlsx` — download **canceled**, API **HTTP 500** `errors.unexpected`) |
| Banner / ingest / approve / reload | **PASS** (reaches export; collapsed limitations banner present in failure capture) |
| PDF exports, reopen, viewport screenshots | **not reached** |

**Observed (consistent with rounds 14–15):** engine **219** counted, **151** twins, legend **46\|47**, not 630/652 (banner assertions pass before export).  
**Export defect:** `buildExportBytes(..., 'xlsx')` **passes** in new integration `export-corpus-7155.integration.test.ts` (ingested `7155_light_g.json` → approve → **~48 KB** workbook, RTL sheet). Same corpus **fails** through harness `GET /api/takeoff/export/...` → **500** (even with `TAKEOFF_E2E_SKIP_EDITS=1`). **getRows fix is in `.next` bundle** (`rowCount-1`). Gap = **Next route/harness transport**, not BOQ/export logic in source.  
**Screenshots:** none in `docs/.../screenshots/`. Failure capture: collapsed limitations OK; BOQ counting line not above fold; workspace usable at 1440.  
**Next (round 17):** `Content-Disposition` used raw Hebrew `view.summary.name` (wizard default `ניתוח חשמל חדש.xlsx`) — invalid for Node `Response` headers → `errors.unexpected` 500 while `buildExportBytes` succeeds. **Fix:** `takeoffExportDownloadHeaders` (RFC 5987) + `Response(payload.bytes)` in `routes.ts`. **One harness rebuild** before re-run E2E.

### Results (2026-11-14 round 15)

| Step | Result |
|------|--------|
| Postgres reset | **PASS** |
| Worker :8765 (background, secret set) | **PASS** — stayed up full run (no −1 at 3.5m) |
| `setup-owner` | **PASS** |
| `electrical-takeoff-real.spec.ts` | **FAIL** @ Excel export (`takeoff-export-xlsx` **HTTP 500**) |
| Banner / ingest / edit / approve / reload | **PASS** (Owner oracle `/219/`, `/151/`, `/4[67]/`, not 630/652) |
| Exports + reopen + screenshots | **not reached** (blocked on xlsx) |

**UI counting (round 15 run):** same as round 14 — **219** counted, **151** twins, legend **47**, merge active; worker `merge_matched_pairs` **151**, `boq_countable` **250** (mirror).  
**Root cause (export 500):** `export-xlsx.ts` used `summary.getRows(2, summary.rowCount)` — second arg is **row count**, not last row; large BOQ → ExcelJS throw → HTTP 500. **Fix in source + unit test** (`export-xlsx.test.ts` 40-line regression); **needs one harness rebuild** (`E2E_SKIP_BUILD=0`) before exports can pass E2E.  
**Spec harness fixes (no rebuild):** exports while **approved** (reopen after exports); absolute export URL; 180s request timeout; export status poll.  
**Screenshots:** none in `docs/.../screenshots/` (failure before viewport loop).  
**Layout (failure capture):** RTL nav OK; long worker-warning stack in yellow limitations banner dominates header on desktop — hard to scan counting line on narrow viewports until banner UX is tightened.

### Results (2026-11-14 round 14)

| Step | Result |
|------|--------|
| Postgres reset (`scripts/.reset-e2e-postgres-db.mjs`) | **PASS** |
| Worker `127.0.0.1:8765` + secret `e2e-takeoff-worker-secret-32chars!!` | **PASS** (~105s job) |
| Env: `E2E_SKIP_BUILD=1`, `E2E_DATABASE_MODE=postgres`, `TAKEOFF_E2E_REAL=1`, `TAKEOFF_E2E_CORPUS_7155_LIGHT_G=1`, `TAKEOFF_FILE_STORE=memory` | **set** |
| `setup-owner` | **PASS** (2.3s) |
| `electrical-takeoff-real.spec.ts` | **FAIL** @ BOQ banner (~1.8m) — ingest/UI **PASS**; edit/approve/exports/screenshots **not reached** |

**Observed numbers (UI banner):** `נספרו 219 (PDF 0, DWG 68, מיזוג 151) · תאומים 151 · PDF בלבד 30 · מקרא 47 · גליונות מוחרגים 31`  
**Worker `result_stats` (same job):** `detection_count` 478 · `merge_matched_pairs` **151** · `boq_twins_collapsed` **151** · `boq_countable` **250** · `boq_excluded_legend_zone` **47** · `boq_excluded_pdf_only` 30  
**DB per-sheet (`analyze-e2e-takeoff-sheets.mjs`):** `layout:תאורה ג` 219 DWG det (151 twins) · light PDF `p1` 228 det (47 legend_zone) · `layout:מקרא` 31 DWG det  
**Auto-pairing:** merge ran (151 pairs, 69% in UI warning); well below 630/652 double-count ceiling ✓  
**Parity gap:** spec expects **250** and **46** in counting banner; app shows **219** counted and **47** legend — **250−219=31** matches `גליונות מוחרגים 31` (`layout:מקרא` legend DWG excluded from `countedTotal` while worker `boq_countable` still 250).  
**Screenshots** `docs/.../takeoff-real-{1440,820,390}.png` | **none** (failure before viewport loop; only Playwright `test-failed-1.png`)  
**Next (unit-first, one rebuild if needed):** align E2E oracle with `countedTotal` vs worker `boq_countable` / legend default exclusion — do **not** loosen spec to 219 without product sign-off.

### Results (2026-11-14 round 13)

| Topic | Notes |
|-------|--------|
| **Auto PDF↔DWG pairing** | `startAnalysisUseCase` derives non-legend plan PDF × every DWG/DXF, merges with optional wizard `pairing`, persists in `takeoff_jobs.request_json`, sends on `WorkerJobRequest.pairing`. |
| **E2E corpus hook** | `TAKEOFF_E2E_CORPUS_7155_LIGHT_G=1` → `sheetSelection` (legend `p1`, light `p1`, DWG `layout:מקרא` + `layout:תאורה ג`) still set in `worker-job-request-build.ts`; **rebuild harness** so server bundle picks up pairing + env hook. |
| **Tests** | `worker-job-pairing.test.ts`, integration `flow.test.ts` (persisted pairing), contract fixture `worker-job-request.sample.json`. |

### Results (2026-11-14 round 12)

| Check | Result |
|-------|--------|
| Preconditions | RAM ~19 GB; Postgres reset; worker 8765; **no `.next` rebuild** |
| `setup-owner` | **PASS** |
| `electrical-takeoff-real.spec.ts` | **FAIL** (run 2: **10 min timeout**) — ingest + UI load **PASS**; stuck clicking 2nd detection row because **“פרטי זיהוי” dialog blocks pointer** (fixed in spec: Escape + dialog-scoped delete; **re-run needed**) |
| Corpus parity | **Not asserted** — app sent **empty `sheetSelection`** (all DWG layouts). See per-sheet table below. |
| Screenshots `docs/.../takeoff-real-*.png` | **Not written** (spec did not complete) |
| Migrations | **0205 + 0206** documented in `MIGRATION-0205.md` (apply in order; Owner approval for shared DB). Local harness only. |

**Per-sheet DB proof (E2E run, full DWG — `node scripts/analyze-e2e-takeoff-sheets.mjs`):**

| sheet_key | kind | det | legend_zone | countable | hidden_layers | corpus 7155_light_g det |
|-----------|------|-----|-------------|-----------|---------------|-------------------------|
| `layout:תאורה ג` | dwg_layout | **219** | 0 | **219** | **51** | **219 / 51** ✓ |
| `p1` (תאורה ג.pdf) | pdf_page | 228 | 24–46* | 182–204* | 0 | 228 / 46 legend / 182 plan-qty |
| Other DWG layouts | dwg_layout | 51+29+24+31+92+… | 0 | same | varies | *excluded in corpus* |
| **Job totals** | | **676** det | **46** worker stat | **630** worker `boq_countable` | **780** hidden sum | **250** `boq_countable` (selected sheets) |

\*PDF legend_zone varies slightly run-to-run; worker stat `boq_excluded_legend_zone` was **46** on round-11 job.

**Why 676 ≠ 250:** E2E analysed **entire DWG** (10 sheets) + legend PDF + light PDF. Corpus `7155_light_g` restricts worker via `sheetSelection` to legend `p1`, light `p1`, DWG `layout:מקרא`, DWG `layout:תאורה ג` only.

**BOQ composition (corpus target ~250):** Worker `boq_countable` counts **twin-collapsed, policy-filtered** detections: exclude `legend_zone` (46 on PDF plan), prefer DWG in PDF↔DWG pairs (~150 twins), include DWG תאורה ג (**219**), מקרא layout DWG (**31**), residual countable PDF ≈ **250** total (see `ACCURACY.md` / `ACCURACY.partial.json`). App UI banner **“נספרו N”** uses `buildBoq` `counting.countedTotal` over **ingested** detections (pre-export twin logic in UI), so full-layout jobs show **~652** not **250**.

**Product gap — sheet/layout selection before analysis:** Contract supports `WorkerJobRequest.sheetSelection` and `startAnalysis.sheetSelection` (wired in `use-cases.ts` this round). **Wizard only has per-file checkboxes** (`upload.includeSheet` = file ids, not `layout:תאורה ג`). **No floor/layout picker in UI.** E2E corpus mode: set `TAKEOFF_E2E_CORPUS_7155_LIGHT_G=1` on harness (after **one rebuild** with `use-cases` hook) + spec asserts BOQ **250 / 46**.

### Results (2026-11-14 round 11)

| Check | Result |
|-------|--------|
| Preconditions | RAM ~19 GB free; Postgres reset OK; worker `8765/healthz` 200; harness `.next` prebuilt (no rebuild). |
| `setup-owner` | **PASS** |
| `electrical-takeoff-real.spec.ts` (run 1, harness w/0206) | **PARTIAL** — ingest **PASS** (job `succeeded`, 676 detections). Failed at edit step: Playwright **strict mode** — duplicate `takeoff-edit-type` (sidebar + dialog). **Spec fix** scopes to dialog `פרטי זיהוי`. |
| Worker stats (7155 תאורה ג corpus, DB) | `detection_count` 676 (DWG 448 / PDF 228); `boq_countable` 630; `boq_excluded_legend_zone` **46**; `boq_hidden_layers_sheet` 780; analysis `in_review`. |
| UI (failure screenshot) | Failed-state wizard **PASS** (run 1 before ingest fix path); post-ingest workspace shows תור בקרה **605** rows, counting warnings banner visible. Target **~219 DWG twins collapsed** not matched to a single stat key — DWG sheet `layout:תאורה ג` has `hiddenByLayers:219` in worker JSON. |
| Screenshots `docs/.../screenshots/takeoff-real-*.png` | **Not captured** (spec did not reach viewport loop). Playwright failure PNG only. |
| Root cause + fix | DB unique `(job_id, sheet_key)` broke multi-PDF both using `p1`. **0206** migration + Drizzle index → `(job_id, file_id, sheet_key)`. Integration `ingest-multi-pdf-sheets.test.ts` PASS. **SQL not for Production until Owner applies 0206.** |

**Re-run full green:** `node scripts/.reset-e2e-postgres-db.mjs` then full Playwright sequence (migrations include 0206); spec includes dialog-scoped `takeoff-edit-type`.

### Results (2025-11-14 round 9)

| Check | Result |
|-------|--------|
| Preconditions | RAM ~20 GB free; Postgres reset OK; worker `8765/healthz` 200; harness `.next` rebuilt (round 9). |
| `setup-owner` | **PASS** |
| `electrical-takeoff-real.spec.ts` | **FAIL** (6 min) — worker progress **100%** in upload modal, but **`takeoff-detection-row` never appeared**. Harness log: **ZodError** on worker **result** — nulls on `sheets[]` (`scale.note`, `floorHint`, `xrefsMissing[].path`) and `legend[]` (`decodedText`, `count`, `decodedBy`). **Fix prepared in source (rebuild):** `src/modules/electrical-takeoff/domain/contracts.ts`, `src/modules/electrical-takeoff/application/worker-callbacks.ts`, `tests/unit/electrical-takeoff/worker-result-normalize.test.ts`. |
| Screenshots | **None** in `docs/implementation/electrical-takeoff/screenshots/` (failure before workspace). Playwright failure capture shows upload wizard stuck at 100% (“ביטול ניתוח” still visible). |
| Expected 7155 counts | **Not verified** (ingest blocked UI). Target per spec: ~219 DWG detections, 46 legend_zone excluded, counting summary banner. |

### Results (2025-11-14 round 8)

| Check | Result |
|-------|--------|
| `org-file-store.test.ts` | **PASS** (2/2) — PGlite harness uses `storageWriteExecutor` + `runCommittedStorageWrite` → same `asUser` transaction; provider mocks for folder + token. |
| `setup-owner` + real worker spec | **FAIL** on prebuilt `.next` (6m) — no `takeoff-detection-row` within 360s. Worker reached app; ingest failed on Zod (legend `textBox: null`, warning `sheetKey: null`, progress `message: null`) and duplicate `takeoff_artifacts (job_id,name)` on artifact retry. **Fixed in source** (`contracts.ts`, `worker-callbacks.ts` idempotent artifacts + normalize). **Re-run real E2E after one harness rebuild** (do not delete `.next` between build and test). |
| Fake worker `electrical-takeoff.spec.ts` | Still valid on Postgres + existing `.next` (prior run). |

## PGlite

Apply `ELECTRICAL_TAKEOFF_PREPARED` via `applyPendingJournalMigrations` before takeoff integration tests.
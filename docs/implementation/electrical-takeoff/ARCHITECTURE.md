# Electrical takeoff module - architecture & ownership (lead-owned)

Status: in development on branch `feature/electrical-takeoff` (local only: no push/merge/deploy, no SQL run on any shared DB).
Research basis: `docs/audits/blueprint-takeoff-research-2026-11/REPORT_FINAL.md` and `.../phase2/*` (experimental code: `engine.py`, `generic.py`, `cluster_exp.py`, `run7155*.py`, `dwg_deep.py`, `dwg_truth.py`, `align.py`).
Scope: ELECTRICAL only (lighting, fire detection, communication, low voltage, power, panels, control). No other trades.

## 1. Shape of the system

```
Browser (main app / employee app / contractor app)  - same shared UI, capability by permission
   |  server actions (TakeoffClientApi)  +  chunked upload route  +  artifact/export routes
Next.js app  (src/modules/electrical-takeoff)  -- DB (drizzle, org-isolated) -- organization private cloud storage (existing policy)
   |  HTTP (job request, signed download URLs, callback token)
Python worker (takeoff-worker/, Docker, EU)   pdf_engine + dwg_engine + pipeline(classify, merge, ai) + export
```

* Files (plans, previews, exports) live ONLY in the organization's connected private storage through the existing
  storage mechanism (see `src/modules/external-storage`, `src/modules/evidence`). No new storage, no personal cloud accounts
  for employees/contractors, no provider token ever reaches a browser or the worker.
* The worker is stateless: it downloads inputs from short-lived URLs served by the app, posts progress/result/artifacts back
  with a single-job bearer token, keeps nothing after the job. Worker URL/secret come from env
  (`TAKEOFF_WORKER_URL`, `TAKEOFF_WORKER_SECRET`); unset => analysis is refused with `worker_unavailable` (honest, never fake data).
* BOQ is computed in TypeScript (pure domain) from effective detections so that every user edit recalculates instantly
  without the worker. Effective detections = worker base detections + append-only user edits (`applyEdits`).
* Three surfaces: ONE capability resolver (`domain/permissions.ts`), ONE UI, ONE set of server actions. Surface wrappers wire
  route/transport only. Document intentional differences in `docs/product/infra-three-surface-parity-matrix.md` style.
* Nothing is shown as verified before the user approves; quantities are never invented; partial sheets / missing Xrefs /
  unverified scale are surfaced as warnings and `needsReview`.

## 2. Contracts (do not change without the lead)

* TS: `src/modules/electrical-takeoff/domain/contracts.ts`
* Python mirror: `takeoff-worker/takeoff_worker/models.py`; engine interfaces: `takeoff-worker/takeoff_worker/engine_api.py`
* Coordinates: detections live in the PREVIEW PIXEL space of the sheet raster the engine produced.
* Catalog source of truth: `src/modules/electrical-takeoff/domain/catalog.default.json` (agent 3) - read by TS and by Python.

## 3. Ownership (each path has exactly ONE owner - do not edit another agent's files)

| Agent | Owns |
|---|---|
| 1 PDF engine | `takeoff-worker/takeoff_worker/pdf_engine/**`, `takeoff-worker/takeoff_worker/export/**`, `takeoff-worker/tests/pdf/**`, `takeoff-worker/tests/export/**` |
| 2 DWG engine | `takeoff-worker/takeoff_worker/dwg_engine/**`, `takeoff-worker/tests/dwg/**`, `takeoff-worker/tools/**` (LibreDWG install/fetch scripts) |
| 3 BOQ + AI | `takeoff-worker/takeoff_worker/{classify,merge,ai}/**`, `takeoff-worker/takeoff_worker/pipeline.py`, `takeoff-worker/takeoff_worker/data/**`, `takeoff-worker/tests/pipeline/**`, `src/modules/electrical-takeoff/domain/**` EXCEPT `contracts.ts` and `permissions.ts`, `src/modules/electrical-takeoff/application/export-xlsx.ts`, `tests/unit/electrical-takeoff/domain/**` |
| 4 UI | `src/modules/electrical-takeoff/ui/**`, new page files under `src/app/[locale]/**/takeoff/**`, locale strings for the module (only agent 4 edits `src/locales/*`), navigation entry, `tests/ui/electrical-takeoff/**` |
| 5 Integration/security/tests | `drizzle/schema/electrical-takeoff.ts` (+ export line in `drizzle/schema/index.ts`), `drizzle/migrations/0205_*` + journal/meta, `src/modules/electrical-takeoff/{data,application (except export-xlsx.ts),actions.ts,routes.ts,server.ts,index.ts,ports.ts}`, `src/modules/electrical-takeoff/domain/permissions.ts`, `src/app/api/**/takeoff/**`, permission catalog / role template edits, `takeoff-worker/takeoff_worker/server.py`, `takeoff-worker/{Dockerfile,pyproject.toml,requirements*.txt,README.md}`, `tests/{unit,integration,e2e}/electrical-takeoff*/**`, `docs/implementation/electrical-takeoff/{SECURITY,LICENSES,TESTING,PARITY}.md` |

Shared files that several agents may need (e.g. `src/locales/*`, `drizzle/schema/index.ts`, permission catalog): ONLY the
owner above edits them; others send the lead a request in their final report.

## 4. Hard rules for every agent

1. Workspace-only writes. Never touch files outside the repo (except Python site-packages via pip install, `%TEMP%`).
2. NEVER run SQL/migrations against any real/shared database. Prepare migration files only; use PGlite (in-process, isolated)
   for tests. Do not read or print `.env.local` secrets. Do not run `next build`, `vercel`, `git push/merge/commit` (lead commits).
3. No new paid services or API keys. AI provider is an adapter, OFF by default, with a deterministic mock for tests.
4. Licenses: only permissive/compatible (MIT/BSD/Apache/MPL, LGPL via dynamic use). AGPL/GPL libraries must not be linked into the
   worker or the app. PyMuPDF (AGPL) is allowed ONLY as a dev/test oracle, never imported by shipped code or listed in the
   runtime requirements. LibreDWG (GPLv3) is allowed only as an EXTERNAL CLI process (aggregate, not linked).
5. Hebrew-first RTL UI text; no hard-coded user-facing strings outside the module's text constants/locale files.
6. Targeted checks only: `npx tsc --noEmit -p .` (may be slow: run it once at the end of your work), `eslint` on touched files,
   focused vitest/pytest on your own tests. No full CI, no wide E2E sweeps (agent 5 owns the module's E2E).
7. Never invent accuracy. Any number you report must come from a command you ran; label ground truth source.
8. Keep Windows compatibility (dev machine is Windows, PowerShell) AND Linux (Docker). Use `pathlib`, no shell-isms in Python.
9. Do not delete user files. Corpus of real plans is read-only in `C:\Users\ERAN YOSEF\Downloads` (7155 DWG+PDF pair, 3643, 2267, 4285,
   AS1749, 2302, 1727, 21160 PDFs; DWGs: 3031 x6, 3096, 3621, G1/G2, 7155). Tests using the corpus must skip cleanly when it is absent.
10. Final report to the lead: what you built (paths), what works (with commands + numbers), what does NOT, interface changes you
    need, open risks. Short and factual.

## Counting policy (BOQ quantities)

Authoritative rules live in `src/modules/electrical-takeoff/domain/counting-policy.ts`; Python pipeline stats mirror them in `classify/counting_policy.py`.

| Scenario | What counts |
|----------|-------------|
| PDF sheet **paired** with a DWG layout | **DWG** detections are primary. Matched twins → **one** row (prefer DWG). `pdf_only` PDF rows are **not counted** until the user **confirms** them (`TakeoffEdit` confirm). `dwg_only` rows **count** (with review). |
| PDF-only analysis (no DWG) | PDF detections count (subject to confidence/review); `legend_zone` excluded. |
| DWG-only | DWG detections count; hidden/frozen layers are not emitted as detections (`hiddenByLayers` on sheet). |

Never double-count unmatched PDF + DWG symbols on the same paired sheet. `computeBoq` emits a warning when `pdf_only` items were excluded from quantities.

## 5. Local run

* Worker: `cd takeoff-worker; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt; python -m takeoff_worker.server --port 8765`
* App env (local only): `TAKEOFF_WORKER_URL=http://127.0.0.1:8765`, `TAKEOFF_WORKER_SECRET=<random>`.
* E2E uses the existing harness (`tests/e2e/harness/*`: PGlite + in-memory storage) plus a real local worker process.

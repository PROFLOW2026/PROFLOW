# Electrical takeoff — status snapshot

Updated: 2026-11-14 (lead agent). Branch: `feature/electrical-takeoff`. Latest harness build: `.tmp-e2e-build-r17b.log` exit 0.

## Owner trial readiness

**Almost** — core 7155 flow works with real worker in E2E harness (upload → worker → BOQ 219/151 twins). **Blockers for declaring “green”:** full E2E not yet passed end-to-end after export fix (round 17c running); PDF exports not fully asserted in real E2E; no production migration applied; org cloud store E2E uses `TAKEOFF_FILE_STORE=memory`.

## Last verified numbers (7155 תאורה ג, corpus hook)

- App counted: **219**, twins **151**, legend_zone **46–47**, sheets excluded **31** (not 630/652 double count).
- Worker mirror `boq_countable` **250** (includes מקרא DWG excluded in app).

## Export

- **Fixed (round 17):** `takeoffExportDownloadHeaders` + route uses RFC 5987; xlsx download succeeded in E2E run 1 after rebuild.
- **Round 16:** HTTP 500 on xlsx (raw Hebrew `Content-Disposition`).

## Active job

- E2E: `electrical-takeoff-real.spec.ts` round **17c** → log `.tmp-e2e-round17c-real.log`.

## Evidence paths

- Testing journal: `TESTING.md`
- Partial viewport PNGs (not full real run): `tests/e2e/.artifacts/takeoff-*.png`
- Playwright failures: `test-results/authenticated-electrical-t-*/`
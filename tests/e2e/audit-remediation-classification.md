# EXLFY audit — Playwright classification

Worktree only. Product behavior was not changed to satisfy an old test.
`playwright.config.ts` was not edited. The suite was not executed.
ESLint on the touched `tests/e2e` files passed. Every spec still needs a live harness to run.

## Counts

| Class | Specs |
| --- | ---: |
| Stale against current UI — updated | 16 |
| Closed month must not block the owner — none found in `tests/e2e` | 0 |
| Internal drawing must stay hidden from a contractor — none found in `tests/e2e` | 0 |
| OCR cases pointed at the storage fixture (4 tests × desktop-he-authenticated and mobile-he) | 8 cases, 1 file |
| T-03 wiring fixed inside `tests/e2e` | 2 |
| Already correct | 16 |
| Still cannot run without a live server | 34 (all specs) |

T-07 assumptions (calendar CRM mock, closed-period read in the same failed transaction, evidence-and-plans visibility, contractor-access timing) are not in `tests/e2e`. They live under `tests/integration` and were left untouched. No e2e spec still says a closed month blocks the organization owner, or that `plan.view` shows an internal drawing to a contractor.

## Stale against current UI — updated

- `tests/e2e/shell.spec.ts` — password required check uses `#sign-in-password`.
- `tests/e2e/mobile.spec.ts` — project create keeps the corner quick-create control.
- `tests/e2e/authenticated/owner.spec.ts` — financial panel is an `h2`; expense save is "שמור כטיוטה".
- `tests/e2e/authenticated/overnight-surfaces.spec.ts` — scheduling title is "שיבוץ משאבים".
- `tests/e2e/authenticated/pwa-startup.spec.ts` — shell cache is `projectflow-shell-v8`.
- `tests/e2e/authenticated/hebrew-runtime-closure.spec.ts` — draft button and project sections (links under hubs).
- `tests/e2e/authenticated/jobs-flows.spec.ts` — job price textbox; work-mix label is not strict-unique.
- `tests/e2e/authenticated/billing-plan.spec.ts` — empty-state button is "יצירת תוכנית".
- `tests/e2e/authenticated/master-completion-journeys.spec.ts` — employee edit is a collapsed section; client archive is on `?tab=details`.
- `tests/e2e/authenticated/worker.spec.ts` — attendance link is present; financial detail is not a hub tab.
- `tests/e2e/authenticated/workforce-discoverability.spec.ts` — More → אנשים; team is a section under עבודה.
- `tests/e2e/authenticated/mobile-money-journeys.spec.ts` — overview heading "תמונת הפרויקט"; vendor tab "הסכמים"; draft button.
- `tests/e2e/authenticated/project-centric-money-chain.spec.ts` — same money/vendor/draft updates; setup checklist is no longer on the overview.
- `tests/e2e/authenticated/regression.spec.ts` — financials is a section link under the כספים hub.
- `tests/e2e/authenticated/performance-signoff.spec.ts` — hops open a hub tab, then a section link.
- `tests/e2e/authenticated/performance-verify.spec.ts` — same hub model. Overview shows hubs, not the old section tabs.
- `tests/e2e/authenticated/regression.spec.ts` also holds the persona matrix (see T-03).

## T-03 — project wiring, no `playwright.config.ts` edit

- Personas now run inside `tests/e2e/authenticated/regression.spec.ts`, which `desktop-he-authenticated` already matches and which depends on `setup-owner`. `tests/e2e/authenticated/persona-matrix.spec.ts` was removed so `desktop-he-personas` no longer runs them without setup. Sign-in clears cookies, then uses the form.
- `tests/e2e/mobile-shell-audit.spec.ts` moved to `tests/e2e/authenticated/mobile-shell-audit.spec.ts`. `desktop-he` ignores `authenticated/`. `mobile-he` still matches the file name.

## OCR — eight cases, fixture, no live OAuth

`tests/e2e/authenticated/ocr-review.spec.ts` journeys that were at lines 198, 261, 331, and 356 (upload/review, queue, one-item, formats) run on both `desktop-he-authenticated` and `mobile-he`.

They use the same connected-org row as `seedOrganizationStorageConnection` in `tests/setup/external-storage-fixture.ts`, seeded by `tests/e2e/harness/seed-organization-storage.ts`. Byte upload and download go through `tests/e2e/harness/e2e-graph-storage-hook.mjs`, loaded by `tests/e2e/harness/start-app-for-playwright.mjs`, together with `OCR_E2E_MOCK_PROVIDER`. Nothing calls a live provider. These tests are not skipped.

## Already correct

Reviewed and left as they are:

- `tests/e2e/audit/verification-route-matrix.spec.ts`
- `tests/e2e/audit/verification-route-personas.spec.ts`
- `tests/e2e/authenticated/boq-happy-path.spec.ts`
- `tests/e2e/authenticated/branding.spec.ts`
- `tests/e2e/authenticated/capture-marketing-screenshots.spec.ts` (skips unless `CAPTURE_MARKETING=1`; that skip is intentional)
- `tests/e2e/authenticated/locale-profile-persistence.spec.ts`
- `tests/e2e/authenticated/project-time-mobile-gate.spec.ts`
- `tests/e2e/authenticated/release-smoke.spec.ts`
- `tests/e2e/dg-tender-to-claim.spec.ts` (`describe.skip` until the EB-8 seed exists; not treated as a pass)
- `tests/e2e/regression/employee-multi-org-browser.spec.ts`
- `tests/e2e/regression/homepage-public.spec.ts`
- `tests/e2e/regression/legal-public-routes.spec.ts`
- `tests/e2e/regression/locale.spec.ts`
- `tests/e2e/regression/marketing-locales-public.spec.ts`
- `tests/e2e/regression/overflow-public.spec.ts`
- `tests/e2e/regression/seo-public-runtime.spec.ts`

## Cannot run without a live server

All 34 specs. This pass did not start Playwright. OCR also needs the harness seed and the Graph stand-in above; it does not need live OAuth.

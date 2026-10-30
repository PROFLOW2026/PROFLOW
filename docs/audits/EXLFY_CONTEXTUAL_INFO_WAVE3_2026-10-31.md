# EXLFY — Contextual info wave 3 (2026-10-31)

Final pass: Contractor Access, workforce/permissions, OCR/submittals, project create tip. **Dashboard untouched.**

## Modules

| Area | Change |
|------|--------|
| Contractor Access | `whereHint`, invite/link hints, capability template text, financial lock note → (i) |
| Employee app access | Field hints, section hints (scope, folders, doc categories, presets, legacy PIN) |
| Workforce | Time filters work-date hint, weekdays hint, salary/assignment hints; approvals `queueHint` on `PageHeader`; attendance `scopeDisclaimer` → (i) |
| OCR | Review honesty, recommendations, draft target; settings queue + drafts-only hints |
| Submittals | Create card description → (i) on title |
| Projects | Recommended templates tip → (i) in header meta |

## Left visible (intentional)

- OCR: provider config/offline/errors, live `info` status, empty inbox, multi-VAT, in-flight job alerts
- Quick capture: `manageRequired`, storage not configured, runtime info/error alerts
- Workforce: `noEmployees` and operational time-form info alerts; payroll `readOnlyHint` (permission)
- Contractor access: empty vendor list, contact data, financial **warning** styling
- Today/tasks/other list pages: access-denied, counts, empty states (no extra wave-3 file diffs beyond prior waves)

## Tests

- ESLint on touched UI paths
- E2E: `ocr-review.spec.ts` — honesty via (i) dialog

## Deploy

Record Production SHA after push.

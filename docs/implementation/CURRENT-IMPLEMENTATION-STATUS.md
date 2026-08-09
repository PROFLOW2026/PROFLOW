# ProjectFlow — Current Implementation Status

**Updated:** 2026-08-09 · Pre-launch program · Local HEAD ahead of origin · **Remote migrations:** through `0008` · **Local migrations:** through `0012_ap_vendor_portal`

## OWNER — before next push

```
REMOTE MIGRATIONS REQUIRED
- 0009_wave2_foundations
- 0010_procurement_foundations
- 0011_field_ops_assets
- 0012_ap_vendor_portal
```

Do not push dependent code until these are applied. Local development continues.

## Wave 1 — complete (0008 remote applied)

CI, CSV exports, light scheduling, presets, reports, documents drag/drop.

## Wave 2 — local integrated

| Stream | Status |
|--------|--------|
| Migration 0009 + schema | Done locally |
| Richer AR (summary, payment history, credit/void disclosure) | Done |
| Cash flow Actual vs Forecast (org + project) | Done |
| Structured CSV import (clients/vendors/employees/projects) | Done |
| CRM lifecycle + won conversion | Done |
| Compliance registry | Done |
| Customer portal grants + safe projection | Done |
| Governed custom fields | Done |
| API keys + webhooks foundation | Done |
| Security / financial / UX reviews | In progress |

## Wave 3 — started locally

| Stream | Status |
|--------|--------|
| Migration 0010 procurement + committed cost ≠ expense | Schema + module + UI |
| Migration 0011 field ops / assets / inventory | Schema done; module in progress |
| Vendor portal / AP–PO matching | Not started |

## Deferred

Notifications / doc 26; marketing/pricing; native apps; fake OCR integrations.

## Notes

- Subagent policy: Auto/Composer allowed; subagent APIs forbidden.
- Lead owns migration numbering; CommittedCost ≠ Expense preserved.

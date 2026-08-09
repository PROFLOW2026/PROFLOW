# Wave 1+2 gap audit

**Date:** 2026-08-09 (re-audit pass)  
**Scope:** Wave 1+2 workflows — CRM, portal, compliance, custom fields, import, API, reports, scheduling, presets, exports.  
**Policy:** Close safe HIGH/MEDIUM gaps. No schema invention. No push. No notifications. Avoid Wave 3 RFQ/AP/assets/field-ops WIP.

Legend: **usable** · **foundation-only** · **blocked**

---

## Status table

| Area | Status | Fixes applied (this / prior pass) | Remaining |
|------|--------|-----------------------------------|-----------|
| CRM lead→opportunity→quote→won | **usable** | Lead status UI; opportunity `leadId` link; won convert; **lead auto-status → `converted` on opportunity create / won convert** | Public quote send still out of scope |
| Customer portal | **foundation-only** | Grants + revoke; admin **customer-safe summary preview** (project + optional grant) | Public customer login / scoped portal UX deferred |
| Compliance create/edit/link/view | **usable** | List/filters/new/edit/archive; **subject pickers** (employee/vendor/project) instead of raw UUID | Document evidence attach still subject to docs module + subject gating |
| Custom fields definitions + values | **usable** | Settings definitions create/archive; values on client + project panels | Entity coverage beyond client/project not expanded |
| Import map→validate→preview→confirm→result | **usable** | Full wizard; kinds permission-gated | Additional entity kinds later |
| API / webhooks | **usable** (keys) / **foundation-only** (delivery) | Clients/keys/webhooks UI; key revoke; test enqueue; `/api/v1/whoami` Bearer auth | Webhook endpoint revoke UI; outbound delivery worker not productized |
| Reports metrics | **usable** | Org rollup + Actual vs Forecast cash view; FX exclusion disclosure | Outgoing cash only when AP due dates exist |
| Scheduling project/WP/milestone | **usable** | Project progress; milestone create/achieve/archive; **WP progress edit** when work areas visible | Missed/cancelled milestone UI still minimal |
| Presets select/apply/edit | **usable** (apply) | Profession preset select + apply on business settings | Per-preset content editor not in scope (apply replaces pack) |
| Exports entity + auth | **usable** | `/exports/[kind]` permission-gated; **clients/vendors links** added on reports | Project-financials export still needs `?projectId=` |

---

## Fixes in this re-audit pass

1. **CRM** — mark lead `converted` when creating an opportunity from a lead (and on won convert if still linked).
2. **Scheduling** — work-package progress save on project Work tab (`updateWorkPackageProgressAction`).
3. **Compliance** — subject entity selects for employee / vendor / project (no raw UUID required).
4. **Exports** — clients + vendors CSV links on `/reports`.
5. **Locales** — he-IL CRM `navLabel` + `quoteOpportunityMismatch`; compliance subject picker copy.

## Explicit non-goals

- Wave 3 RFQ / AP / assets / field-ops heavy WIP
- Schema / migration invent
- Notifications (doc 26)
- Public portal login
- Git push

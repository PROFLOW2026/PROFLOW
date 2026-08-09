# WAVE4 Audit B — Future capabilities docs 19–38

**Date:** 2026-08-09  
**Auditor:** Auto/Composer (PART B / AUDITOR B)  
**Rule:** Do **not** leave safe pre-launch work deferred just because doc timing said V2/V3.  
**Forced class:** Notifications (doc **26**) = **DEFERRED BY OWNER**.

Classification keys:

| Class | Meaning |
|-------|---------|
| **IMPLEMENTED** | Usable end-to-end for the capability’s V1-slice |
| **PARTIAL** | Schema/UI/foundation present; gaps remain |
| **SAFE TO BUILD NOW** | Can ship without owner credentials, product fork, or conflicting migrations |
| **DEFERRED BY OWNER** | Explicitly parked |
| **REQUIRES EXTERNAL CREDENTIAL** | Provider keys / verified domains / buckets |
| **REQUIRES PRODUCT DECISION** | Open UX/policy fork |
| **POST-LAUNCH** | Intentionally later |

---

## Master classification (by detail doc)

| Doc | Capability | Class | Evidence / notes |
|-----|------------|-------|------------------|
| **19** | Future map (meta) | — | Planning index only |
| **20** | CRM / sales / pre-project | **IMPLEMENTED** (core lifecycle) | Leads, prospects, opportunities, quotes link, won→client/project convert |
| **20** | Public quote send / portal approve | **REQUIRES PRODUCT DECISION** / POST-LAUNCH | C3 = internal approval |
| **21** | RFQ + supplier quotes + PO + committed cost | **IMPLEMENTED** (local) | `/procurement`, RFQ, PO issue, committed ≠ expense |
| **21** | Materials catalog + vendor prices | **IMPLEMENTED** | Materials routes + prices |
| **21** | Inventory issues/returns depth | **PARTIAL** | Inventory items + movements exist; warehouse UX thin |
| **22** | Light scheduling / milestones / progress % | **IMPLEMENTED** | Project schedule + milestones + WP progress |
| **22** | Tasks / Gantt / critical path | **POST-LAUNCH** | Explicitly deferred |
| **22** | Daily logs / punch / inspections | **IMPLEMENTED** (local) | `/field-ops/*` |
| **23** | Asset registry / maintenance / fleet | **PARTIAL→near IMPLEMENTED** | Assets, maintenance, fleet pages; cost-per-distance depth limited |
| **24** | Insurance / licenses / compliance | **IMPLEMENTED** | Compliance registry + subject pickers; evidence attach improving |
| **25** | Customer portal | **PARTIAL** | Grants + safe summary/docs/billing preview + IDOR tests; **no** public customer login |
| **25** | Vendor portal | **PARTIAL** | Vendor-scoped RFQ/PO + candidates (≠ ledger); public login foundation-only |
| **25** | E-signature | **POST-LAUNCH** | Integration |
| **26** | In-app / email notifications / automations | **DEFERRED BY OWNER** | Do not build product surface this wave |
| **26** | SMS / WhatsApp / push | **POST-LAUNCH** | |
| **27** | OCR review path (stub) | **PARTIAL** | Stub provider + review UI; no fabricated amounts |
| **27** | Real OCR / AI suggestions | **REQUIRES EXTERNAL CREDENTIAL** + POST-LAUNCH | `OCR_PROVIDER_API_KEY` |
| **28** | Richer AR (credit/void, aging honesty) | **IMPLEMENTED** | Billing integrity + disclosures |
| **28** | AP + PO matching | **IMPLEMENTED** (local) | `/procurement/ap` |
| **28** | Cash Actual vs Forecast | **IMPLEMENTED** | Org + project cash views |
| **28** | Accounting connectors | **POST-LAUNCH** / **REQUIRES EXTERNAL CREDENTIAL** | |
| **29** | Reporting / org rollup | **IMPLEMENTED** | `/reports` + coverage |
| **29** | Configurable BI / custom report builder | **POST-LAUNCH** | |
| **30** | Extra country packs / FX conversion | **POST-LAUNCH** | Israel pack in V1 |
| **31** | PWA / offline drafts | **PARTIAL** | SW registrar, drafts panel, sync mutations |
| **31** | Native mobile apps | **POST-LAUNCH** | |
| **32** | API keys + whoami + webhook register/enqueue | **PARTIAL** | Keys usable; delivery worker not productized |
| **32** | Webhook revoke UI | **SAFE TO BUILD NOW** → implementing | Repo + schema exist |
| **32** | Outbound delivery worker | **SAFE TO BUILD NOW** (foundation) / PARTIAL | JobPort sync stub; HTTP fan-out later |
| **32** | Payroll/maps connectors | **POST-LAUNCH** | |
| **33** | MFA / SSO / SCIM / legal hold | **POST-LAUNCH** | Enterprise |
| **34** | Other vertical packs | **POST-LAUNCH** | |
| **35** | Governed custom fields | **IMPLEMENTED** | Definitions + client/project values |
| **35** | Broader entity coverage | **SAFE TO BUILD NOW** | Extend values panels to vendor/expense cautiously |
| **36** | Profession presets apply | **IMPLEMENTED** | Business settings apply pack |
| **36** | Per-preset content editor | **REQUIRES PRODUCT DECISION** / POST-LAUNCH | |
| **37** | Structured CSV import | **IMPLEMENTED** | Wizard map→validate→confirm |
| **37** | Broader entity kinds / migration tooling | **SAFE TO BUILD NOW** (kinds) / POST-LAUNCH (ETL) | |
| **38** | SaaS subscription billing | **POST-LAUNCH** | Separate domain |

---

## Prioritized SAFE TO BUILD NOW backlog

Do not invent migrations `0014+`. Prefer application/UI/tests.

### P0 — Pre-launch integrity (this wave)

1. **Webhook endpoint revoke use case + Settings UI** — schema/repo ready; closes API platform gap (doc 32).  
2. **EN terminology: “work package” → “work area”** in user-facing strings (docs 01/48).  
3. **Milestone mark missed / cancelled** controls for planned milestones (doc 22 / Wave-gap).  
4. **Production env guards** — strengthen `assertProductionGuards` (service role / non-local APP_URL already partial).  
5. **Route `loading.tsx`** for high-traffic lists still missing (projects, clients, workforce, reports, CRM).

### P1 — High value, no credentials

6. **Webhook secret rotate** application + UI (`rotateWebhookSecretSchema` exists).  
7. **Filter disabled webhooks** already via archive; show status badge consistency.  
8. **Custom field values** on vendor (and optionally expense) detail — reuse panel.  
9. **Export links completeness** — project-financials `?projectId=` discovery on project financials page.  
10. **Offline draft empty-state CTA** polish + Hebrew parity check on new Wave3 strings.  
11. **API delivery attempt recorder** admin/debug path using existing domain `applyDeliveryAttempt` (no real HTTP yet).  
12. **Compliance evidence attach** finish on all subject types where documents owners allow.

### P2 — Safe but larger

13. **Inventory warehouse UX** (bins/locations) — may need product decision before schema; stay UI-only if possible.  
14. **Fleet cost-per-distance** reporting slice using existing maintenance/usage fields.  
15. **Customer portal read-only public route** — **REQUIRES PRODUCT DECISION** on auth model (ExternalPrincipal). Move out of SAFE until decided.  
16. **Import kinds**: cost categories / employees rates — extend validate-rows carefully.  
17. **Reports**: committed + AP inclusion toggles with coverage copy.  
18. **Unit tests** for procurement committed-cost ≠ expense invariants (expand).  
19. **Activity log labels** for Wave3 audit actions missing in `settings.json`.  
20. **E2E smoke** for procurement list + API settings revoke (Playwright).

### Explicitly NOT SAFE / excluded

| Item | Class |
|------|-------|
| Notifications / digests / escalation UI | **DEFERRED BY OWNER** |
| Resend domain verification / production email | **REQUIRES EXTERNAL CREDENTIAL** |
| Real OCR provider | **REQUIRES EXTERNAL CREDENTIAL** |
| Private storage bucket console steps | **REQUIRES EXTERNAL CREDENTIAL** (see `STORAGE-BUCKET-OWNER-ACTION.md`) |
| Remote apply `0009`–`0013` | Owner/Lead ops — not code |
| SaaS packaging / Stripe | **POST-LAUNCH** + product |
| MFA/SSO | **POST-LAUNCH** |
| Gantt / native apps | **POST-LAUNCH** |

---

## Architecture protections still holding

- CommittedCost ≠ Expense  
- External portal grants ≠ Membership (foundation)  
- OCR proposals ≠ ledger truth (stub)  
- SaaS billing isolated (no subscription entities in customer billing)  
- Progressive module visibility via `noteModuleUsage`

---

## Implemented from this backlog (same wave)

- P0.1 Webhook revoke + rotate secret (application already present; **Settings UI wired**; activity labels)
- P0.2 EN work-area terminology (fieldOps / procurement / workforce; expenses already aligned)
- P0.3 Milestone missed/cancelled actions (present in UI)
- P0.4 Production env guard: require `SUPABASE_SERVICE_ROLE_KEY` (+ tests)
- P0.5 List `loading.tsx` for projects, clients, workforce, reports, CRM
- P1.9 Project financials CSV export link with `?projectId=` on project financials page

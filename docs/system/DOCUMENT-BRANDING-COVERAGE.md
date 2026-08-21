# Document Branding Coverage

Portal stays **OFF**. Document branding ≠ UI theme.

**Company Identity SoT:** `organization_company_profiles` (canonical). `organization_settings.legal_identity` is kept in sync for OCR / legacy reads only — never the reverse.

**Draft / live outputs** resolve the live brand (org default → project → document override).  
**Terminal / issued / approved / finalized / completed / sent / closed** outputs freeze a **brand snapshot** on transition (first write wins). Regenerating a locked document prefers that snapshot.

| Output | Kind / path | Theme | Brand source when locked | Snapshot capture (lifecycle) |
| --- | --- | --- | --- | --- |
| Project status | `project_status` | internal | live | — (management snapshot report) |
| Project financial summary | `project_financial_summary` | internal | live | — |
| BOQ progress | `boq_progress` | customer | snapshot when progress batch approved | Progress batch → `approved` (`boq_progress_batch`); BOQ → `activate` (`boq`) |
| Change order summary | `change_order_summary` | customer | snapshot when CO exists | Change request → `approved` (immutable CO) |
| Quote / estimate (Product Quote) | `quote_estimate` | customer | snapshot when status ≠ draft/ready | Product Quote (`estimates`) → `sent` |
| Commercial Change Quote | change negotiation quote | customer | live / optional brand override on `quotes` | Brand column on `quotes`; snapshots use change_order entity |
| Field daily log | `field_daily` | customer | snapshot when finalized | Daily log → `finalized` |
| Punch / inspection | `punch_inspection` | customer | snapshot when terminal | Inspection → `passed` / `failed` |
| Vendors / subcontracts | `vendor_subcontract_summary` | internal | live rollup | Subcontract agreement → `completed` (entity snapshot) |
| Client 360 | `client_360` | customer | live | — |
| Vendor 360 | `vendor_360` | internal | live | — |
| Contract portfolio | `contract_portfolio` | internal | live rollup | — |
| Subcontract cash | `subcontract_cash` | internal | live | — |
| Labor utilization | `labor_utilization` | internal | live | — |
| Retention schedule | `retention_schedule` | customer | live | — |
| Inventory movement | `inventory_movement` | internal | live | — |
| Compliance expiry | `compliance_expiry` | internal | live | — |
| CRM funnel | `crm_funnel` | internal | live | — |
| Month-close completeness | `month_close_completeness` | internal | live | — |
| Safety open actions | `safety_open_actions` | internal | live rollup | Safety record → `closed` (entity snapshot) |
| Purchase order | `purchase_order` | customer | snapshot when issued | PO → `issued` |
| Procurement RFQ | `procurement_rfq` | customer | snapshot when sent | RFQ → `sent` |
| Customer statement | `customer_statement` | customer | live AR view | — (point-in-time statement) |
| Contract summary | `contract_summary` | customer | snapshot when active/closed | Contract → `active` / `closed` |
| Work order | `work_order` | customer | snapshot when completed | WO serviceStatus → `completed` |
| **Service completion report** | `service_completion` | customer | snapshot (`service_report`) | Same WO completion (no separate entity) |
| Timesheet | `timesheet` | internal | snapshot when approved | Timesheet → `approved` |
| **Billing record** | billing finalize / PDF path | customer | snapshot | Billing record → `finalized` |
| **Form submission** | forms export / print | customer | snapshot | Form submission → `submitted` |
| **Safety record** | safety document | customer | snapshot | Safety record → `closed` |
| **Closeout** | closeout package | customer | snapshot | Closeout → `closed` |
| **Warranty** | warranty coverage / issue | customer | snapshot | Coverage → `active`/`expired` (`warranty`); Issue → `resolved` (`warranty_issue`) |
| Communications email | `send.ts` wrap | customer | live wrap + snapshot on send | Communication → `sent` |

## Important outputs with branding = required (Unbranded = 0)

Mapped and branded: Product Quote (`estimates`), Commercial Change Quote brand override (`quotes`), PO, RFQ, Change order, BOQ + BOQ progress batch, Contract, Work order, **Service completion**, Timesheet, Billing record, Form submission, Safety record, Closeout, Warranty coverage + issue, Daily log, Inspection, Subcontract (completed), Communication (sent), plus the 19+ report kinds above.

## Rules

- Composite brand FKs use **ON DELETE RESTRICT** (never `SET NULL` on `(brand_profile_id, organization_id)` — that would nullify `organization_id`). Brand profiles are **archive-only**.
- Product Quote brand column lives on **`estimates`**. Commercial Change Quote brand column lives on **`quotes`**. Do not mix.
- Exactly one **active default** brand whenever brand profiles exist; default swap is transactional; cannot archive default or last active without a replacement.
- Logo / signature / stamp keys are **immutable versioned** (`buildKey` UUID). Replace updates the live profile pointer only — historical snapshots keep old keys.
- Export / download always goes through `assertReportKindPermission`.
- Wrong-org `brandProfileId` / storage keys → `DomainRuleError`.
- Brand footer / email signature text is plain text only.
- Signature / stamp images are visual acknowledgement only — not legal e-sign.
- Mutating company/branding requires **`org.update`** (Worker has `org.read` only). Enforced in application + RLS (`install_org_table_rls(..., 'org.read', 'org.update', NULL)`).
- **`document_brand_snapshots`** are historical and **immutable** for `authenticated`: no direct INSERT / UPDATE / DELETE (even with `org.update`). Capture is only via `app.freeze_document_brand_snapshot` (SECURITY DEFINER): membership + domain permission + issued subject + project access when scoped. Snapshot JSON is built server-side from canonical company/brand profiles (client JSON is never accepted). Helpers like `document_brand_snapshot_subject_ok` are **not** executable by `authenticated`. First write wins.
- Timesheet historical branding freezes only on **`approved`** (not `returned`). Communication freezes only on **`sent`** (not `failed` / retryable).

## Key modules

- `src/modules/branding/` — resolve / capture / company / brand profiles / assets
- `src/modules/reports/application/generate-report.ts` — attaches `ReportPayload.brand`
- `src/modules/reports/application/generate-branded-entity-reports.ts` — PO / RFQ / statement / contract / WO / service completion / timesheet
- `src/modules/reports/application/branded-document-shell.ts` — PDF/HTML letterhead
- `drizzle/migrations/0062_organization_branding.sql` — schema (UNAPPLIED until Owner)

# ProjectFlow — Core Functional Modules Maturity Audit

**Date:** 2026-09-22  
**Scope:** `src/modules/*` (67 folders) + `drizzle/schema/*` table coverage  
**Method:** Code inspection (indexes, application/data/ui, `src/app/[locale]/(app)` routes, API routes). Not marketing copy.  
**Maturity:** FULL = durable CRUD/workflows + routes or clear product surface · PARTIAL = real logic/schema but incomplete UX, dual paths, or gated slices · STUB = thin shell / hard-disabled / unconfigured-only · PLANNED = schema/foundations without usable product path

**Route root:** `src/app/[locale]/(app)/…` · Employee: `src/app/[locale]/employee/(shell)/…` · Server actions often live beside pages (`**/actions.ts`), not only in modules.

---

## Master table

| Module | Purpose | Key tables | Maturity | Notes |
|--------|---------|------------|----------|-------|
| **tenancy** | Org create, memberships, settings, module prefs, numbering, saved views | `organizations`, `organization_memberships`, `invitations`, `organization_settings`, `organization_module_preferences`, `document_number_sequences`, `saved_list_views`, `org_member_document_category_grants` | FULL | `/onboarding`, `/settings/*`; core platform |
| **identity** | Auth profile bootstrap | `profiles`, `user_preferences` | FULL | Thin (`ensure-profile.ts`); required foundation |
| **rbac** | Roles/permissions | `permissions`, `roles`, `role_permissions`, `role_assignments` | FULL | `/settings/roles`; dual with employee grants |
| **clients** | Customer master + contacts | `clients`, `clientContacts`, `partyIdentifiers` | FULL | `/clients`, employee clients |
| **vendors** | Suppliers + engagements + **subcontracts/advances** | `vendors`, `vendorContacts`, `vendorEngagements`; platform-ops `subcontractAgreements`, advances/refunds | FULL | `/vendors`, `/subcontracts` |
| **projects** | Jobs/projects, milestones, phases, domains | `projects`, `workPackages`, `projectMilestones`, `phases`, `organizationDomains`, `projectDomains` | FULL | `/projects`, `/jobs` (service jobs) |
| **commercial** | Change requests, in-project quote versions, change orders, contract value | `changeRequests`, `changeRequestLines`, `quotes`, `quoteVersions`, `quoteVersionLines`, `approvals`, `changeOrders`, `contracts`, `contractValueEvents` | FULL | `/changes`, `/contracts` |
| **quotes** | Owner-facing commercial bids (product path) | `estimates`, `estimateLineItems` (`next-gen`) — not CRM sales quotes | FULL | `/quotes`; `/sales` redirects here |
| **crm** | Pre-project pipeline | `crmProspects`, `crmProspectContacts`, `crmLeads`, `crmOpportunities`, `crmOpportunityNotes`, `crmEstimates`, `crmSalesQuotes` (+ versions/lines) | FULL | `/crm/*`; CRM estimates/sales quotes are **internal** alongside `/quotes` |
| **billing** | AR invoices/billing records + customer payments | `billingRecords`, `billingLines`, `payments`, `paymentApplications` | FULL | `/billing`, employee billing |
| **billing-plan** | Project billing plans/cycles | `billingPlanTemplates`, `projectBillingPlans`, sections/lines/cycles/revisions | FULL | Project billing-plan UI + print |
| **ap** | Vendor bills, PO match, AP payments, credits | `apBills`, `apBillLines`, `apPoMatches`, `apPayments`, `apPaymentApplications`, `apBillProjectAllocations`, `apVendorCredits`, `apCreditApplications` | FULL | `/procurement/ap/*` |
| **procurement** | Materials, RFQs, supplier quotes, POs, receipts, commits | `materialItems`, `materialVendorPrices`, `procurementRfqs`/`Lines`, `supplierQuotes`/`Lines`, `purchaseOrders`/`Lines`, `poReceipts`/`Lines`, `committedCosts` | FULL | `/procurement/*` |
| **expenses** | Cost categories, expenses, allocations, overhead | `costCategories`, `expenses`, `expenseAllocations`, `allocationRuns`, `allocationRunLines` | FULL | `/expenses`; `/overhead` → expenses filter |
| **workforce** | Employees, time, timesheets, attendance, labor cost, payroll payments | `employees`, `employeeProjectAssignments`, `rateVersions`, `employeeMonthCosts`, labor allocation tables, `timeEntries`, `attendanceDays`/`Events`; `timesheets` (platform-ops); `employeePayrollPayments`, `employeeAttendanceOutcomes` (owner-financial) | FULL | `/workforce/*`, employee `/time` `/attendance` `/hours` |
| **employee-app** | Field employee shell + grants | `employeeAppAccounts`, `employeePermissionGrants`, `employeeDocumentCategoryGrants`, `employeeAppAuditEvents` | FULL | `/employee/(shell)/*` (~42 pages) |
| **documents** | Document registry + links | `documents`, `documentLinks`; platform-ops `documentFolders`, `documentVersions` | FULL | `/documents`, `/company-files` |
| **external-storage** | Drive/OneDrive OAuth, folder map, files | `organizationStorageConnections`, `storageFolderMappings`, `storageFiles` | FULL | `/settings/storage`; `api/org-storage/*` |
| **ocr** | Receipt/doc extraction + review | `ocrExtractionJobs`, `ocrCorrectionMemory`; platform-ops `ocrBatches` | FULL | `/documents/ocr-review`, `/settings/ocr`; worker API |
| **financials** | Org/project P&L, cash flow, general cost months, true-cost reads | true-cost: `generalCostMonths`/`Allocations`/`Sources`, `expenseManagerialScheduleLines`, inventory cost layers; reads many finance tables | FULL | `/financials/*`, `/cash-flow`, project financials |
| **boq** | Bill of quantities, progress, sub valuations | `projectBoqs`, `boqNodes`, progress/batch/billing-link, subcontractor schedule/valuation tables | FULL | `/projects/[id]/boq-measure` |
| **tasks** | UWM boards/tasks/labels/templates/portfolio | `taskBoards`…`taskTemplates`, `projectTemplates*`, activity | FULL | `/work/*`, `/portfolio`, `/tasks/[id]`, project boards |
| **meetings** | Meeting records → tasks | `meetingRecords`, `meetingAttendees`, `meetingDecisions`, `meetingActionItems` | FULL | `/meetings/*` |
| **workspaces** | Teams, workspaces, stage defs | `orgTeams`, `orgTeamMembers`, `workspaces`, `workspaceMembers`, `projectWorkspaceLinks`, `projectStageDefinitions`, `projectStageTransitions` | FULL | `/workspaces/*`, `/settings/stages` |
| **field-ops** | Daily logs, punch, inspections | `dailyLogs`, `punchListItems`, `inspections` + catalog join tables | FULL | `/field-ops/*` |
| **assets** | Assets, fleet, maintenance, inventory | `assets`, `fleetVehicles`, `maintenanceRecords`, `inventoryItems`/`Movements`/`Locations`/`Balances`; platform-ops reservations/counts | FULL | `/assets/*` |
| **safety** | HSE records, CAPA, toolbox talks | `safetyRecords`, `safetyCorrectiveActions`, `safetyToolboxTalks`, `safetyToolboxAttendees` | FULL | `/safety/*` |
| **compliance** | Expiring artifacts/certificates | `complianceArtifacts` | FULL | `/compliance/*` |
| **forms** | Templates + submissions | `formTemplates`, `formSubmissions` | FULL | `/forms`, `/settings/forms` |
| **service** | Work orders, dispatch, recurrence | `projectServiceDetails`, `recurrenceDefinitions`/`Occurrences`; `workOrderBillingSources`; bookings via scheduling | FULL | `/work-orders`, `/dispatch`, `/service/recurring` |
| **scheduling** | Resource bookings + unavailability | `resourceBookings`, `employeeUnavailability` | FULL | `/scheduling`, `/workload` related |
| **calendar** | Aggregated calendar events | `calendarEvents` (+ source date reads) | FULL | `/calendar`, project calendar |
| **approvals** | Multi-step approval rules/inbox | `approvalRules`, `approvalRequests`, `approvalRuleSteps`, `approvalRequestSteps`; also commercial `approvals` | FULL | `/approvals`, `/settings/approvals` |
| **notifications** | In-app notifications | `notifications` | FULL | `/notifications` |
| **command-center** | Today/actionable inbox | `commandCenterItemStates` + collectors | FULL | `/today` (`/inbox` alias) |
| **budgets** | Project budgets + variance | `projectBudgets`, `projectBudgetLines`, `projectBudgetRevisions` | FULL | Project budget panels |
| **month-close** | Period close + completeness | `monthClosePeriods`, `monthCloseAdjustments` | FULL | `/month-close` |
| **recurring-drafts** | Recurring financial drafts | `recurringFinancialDrafts`, `recurringFinancialDraftRuns`, `recurringDraftAmountVersions` | FULL | `/recurring-drafts/*` |
| **banking** | Bank accounts, import, match | `bankAccounts`, `bankImportBatches`, `bankTransactions`, `bankMatchSuggestions`, `bankMatchDecisions` | FULL | `/settings/banking` |
| **reports** | PDF/print report packs | (reads many domains; no dedicated report tables) | FULL | `/reports`, `/reports/preview` |
| **branding** | Company/brand profiles, doc snapshots | `organizationCompanyProfiles`, `organizationBrandProfiles`, `documentBrandSnapshots` | FULL | `/settings/branding`, org-profile |
| **custom-fields** | Custom field defs/values | `customFieldDefinitions`, `customFieldValues` | FULL | `/settings/custom-fields` |
| **business-catalog** | Org catalogs, doc requirement rules | `organizationCatalogEntries`, `vendorCatalogLinks`, `documentRequirementRules`, daily-log join tables | FULL | `/settings/business-catalogs`, `/settings/catalog` |
| **tax** | Tax rules/overrides | `taxRules`, `taxOverrides` | FULL | `/settings/tax`; used by billing/expenses/quotes |
| **search** | Global command search | (read aggregation; no search tables) | FULL | Shell search UI |
| **closeout** | Project close readiness | `projectCloseouts`, `projectCloseoutEvents` | FULL | Project closeout panel + actions |
| **warranty** | Coverages + issues | `warrantyCoverages`, `warrantyIssues` | FULL | `/warranty`, project panels |
| **communications** | Outbound message drafts/send log | `outboundCommunications`, attempts, attachments | FULL | `/communications/*` |
| **ops-finance** | Ops record → linked expense bridge | `opsExpenseLinks` | FULL | Forms on assets/etc.; persistence flag `true` |
| **imports** | CSV import kinds | (no dedicated import tables; writes domain tables) | FULL | `/imports` |
| **exports** | CSV/XLSX export utility | none | FULL | Shared download control |
| **invoicing-integration** | Statutory provider docs (e.g. Sumit) | `externalStatutoryDocuments`, `externalInvoicingProviderConnections` | PARTIAL | Persistence ready; provider-gated; PDF APIs under `api/invoicing/*` |
| **expense-ingestion** | External expense import pipeline | `externalExpenseImports` | PARTIAL | Worker path + settings; org-gated Sumit |
| **ocr** *(see above)* | — | — | FULL | Listed once |
| **assistant** | Org AI chat + tools | `assistantConversations`, `assistantMessages` | PARTIAL | `/assistant`; defaults to **unconfigured** provider (tool summaries, no LLM) |
| **automations** | Rule presets + runs | `automationRules`, `automationRuns` | PARTIAL | `/automations`; some actions are **safe stubs** (`draft_expense` / `planning_followup`) |
| **integrations** | Accounting adapter façade | `organizationIntegrations`, `integrationEntityMappings`, `integrationSyncJobs` | PARTIAL | `/integrations`, `/settings/integrations`; default **UnconfiguredAccountingAdapter** |
| **api** | API keys + webhooks + public v1 | `apiClients`, `apiKeys`, `webhookEndpoints`, `webhookDeliveries` | PARTIAL | `/settings/api`; routes: `api/v1/health|whoami|projects` only |
| **portal** | External customer/vendor access | `externalPrincipals`, `externalAccessGrants`, vendor portal candidate tables | STUB* | Public `/portal/*` **hard-disabled** (`isExternalPublicAccessEnabled(): false`). Settings grant UI exists → treat product public portal as STUB; internal candidate APIs PARTIAL |
| **planning** | Gantt/timeline work items | `planningWorkItems`, `planningDependencies` | PARTIAL | Project timeline; critical path explicitly **unsupported** |
| **forecast** | Early financial warnings | none dedicated | PARTIAL | Embedded on project overview only |
| **field** | Field cockpit aggregator | none | PARTIAL | `/field` tiles + attendance clock + note draft |
| **retention** | Retention capture/release | `retentionReleases` (+ retention fields on bills/billing) | PARTIAL | No hub route; panels/AP actions |
| **payment-instruments** | Org payment methods | `organizationPaymentInstruments` | PARTIAL | Manage/list only; no dedicated settings page found as primary hub |
| **offline** | PWA draft queue (client) | none (IndexedDB) | PARTIAL | `/settings/offline-drafts`; no financial finalize offline |
| **operations** | UWM ops dashboard | reads tasks/scheduling | PARTIAL | `/operations` aggregator |
| **generated-documents** | Save report artifacts to storage | uses `documents` | PARTIAL | Actions for report packs |
| **marketing** | Public landing UI | none | FULL | Marketing pages only (no domain schema) |
| **rbac / identity / tenancy** | *(platform — listed above)* | | | |

\*Portal: grant/candidate application code is real; **external public auth surface is intentionally off**.

---

## Detail bullets (modules needing nuance)

### Dual quote / commercial paths
- **Owner bids:** `src/modules/quotes` → tables `estimates` / `estimateLineItems`; routes `/quotes`. Documented in `quotes/domain/product-path.ts`.
- **In-project commercial quotes:** `src/modules/commercial` → `quotes` / `quoteVersions` under `/changes/.../price`.
- **CRM:** `crm_estimates` / `crm_sales_quotes` used from opportunity UI/actions; convert-won targets owner `/quotes` (`estimates`), not CRM sales quotes.

### Workforce vs payroll
- Time/attendance/timesheets/labor allocation: `src/modules/workforce` + routes under `/workforce/*`.
- Owner payroll payment / attendance outcomes: `drizzle/schema/owner-financial.ts` consumed by workforce (`payroll-payments.ts`, attendance outcomes).

### Portal (STUB product surface)
- Policy: `src/modules/portal/domain/external-access-policy.ts` — `EXTERNAL_PUBLIC_ACCESS_STATUS = 'disabled'`.
- Pages `src/app/[locale]/portal/{customer,vendor}/page.tsx` always `notFound()`.
- Internal: `/settings/portal` + vendor candidate repositories remain.

### Assistant / automations / integrations
- Assistant: real chat UI + tool execution; LLM provider often unconfigured → `unconfigured-provider.ts`.
- Automations: manage/run presets; comment in `run-rules.ts` — some action kinds are stubs.
- Integrations: schema + list UI; accounting adapter defaults to not configured (statutory invoicing is separate module).

### Schema files without a matching module folder
| Schema file | Consumed mainly by |
|-------------|-------------------|
| `drizzle/schema/audit.ts` (`auditEvents`) | Cross-cutting (tenancy/settings activity) |
| `drizzle/schema/platform-ops.ts` | Split: notifications, timesheets, safety, scheduling, OCR batches, document versions, subcontracts, inventory counts/reservations, project access grants, work-order billing sources |
| `drizzle/schema/true-cost.ts` | `financials`, `expenses`, `recurring-drafts`, inventory costing |
| `drizzle/schema/owner-financial.ts` | `workforce` |
| `drizzle/schema/next-gen.ts` | quotes (`estimates`), service recurrence, approvals, month-close, budgets |
| `drizzle/schema/next-gen-ops.ts` | forms, usage records, command-center, recurring-drafts, retention |
| `drizzle/schema/next-gen-experience.ts` | closeout, warranty, communications, calendar, automations, integrations, assistant |
| `drizzle/schema/contracts.ts` / `changes.ts` | `commercial` (+ vendors/contracts UI) |
| `drizzle/schema/workspaces.ts` / `tasks.ts` | `workspaces`, `tasks`, `meetings` |

### Notable route aliases / redirects
- `/sales` → `/quotes`
- `/overhead` → `/expenses?costFamily=business_overhead`
- `/inbox` → `/today`
- Jobs (`/jobs`) share project/service models with work-order flavored UX

### API surface (module `api`)
- Authenticated platform: keys/webhooks at `/settings/api`
- Public HTTP: `src/app/api/v1/{health,whoami,projects}` only — not a full REST ERP

### Employee App (parallel product)
- Not a domain module list item beyond `employee-app`, but exposes billing, AP, expenses, tasks, documents, attendance, etc. with **separate permission grants** (`employee_permission_grants`).

---

## Counts (approx.)

| Maturity | Count (of ~67 module folders) |
|----------|-------------------------------|
| FULL | ~50 |
| PARTIAL | ~14 |
| STUB | ~1–2 (public portal; marketing N/A for ERP) |
| PLANNED | ~0 as empty folders (planning critical-path is the closest “planned” slice inside PARTIAL) |

**Strongest FULL cores:** tenancy/RBAC, clients/vendors/projects, commercial+billing+AP+expenses+workforce, documents/storage/OCR, tasks/UWM, field-ops/assets/safety, financials/BOQ/billing-plan.

**Weakest product gaps:** public portal (disabled), assistant without configured LLM, accounting integrations adapter, thin public API v1, automation action stubs, planning critical path.

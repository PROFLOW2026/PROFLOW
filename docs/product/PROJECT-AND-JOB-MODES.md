# Project and Job Modes

**Owner (wave):** Agent 2 (Jobs UX/domain) + Lead integration  
**Binding contract:** `docs/product/_WAVE-LEAD-CONTRACT.md`  
Legend: **CURRENT** | **NEW** | **RULE** | **LIMITATION**

---

## CURRENT

- One persisted entity: `projects` row.
- Lead migration `0019` adds:
  - `projects.work_kind` ∈ `project` | `job` (default `project`)
  - `projects.pricing_mode` ∈ `fixed` | `open` | `NULL`
- Classic projects keep `pricing_mode = NULL` (fixed once a managed contract exists).
- Financial engine (contracts, value events, expenses, billing, payments, time) is shared.
- Default work package is still created for jobs (structural invariant) but job UX does not surface work packages / phases / milestones.

---

## NEW

| Surface | Path / API | Notes |
|---------|------------|--------|
| Quick job create | `/jobs/new` + `createJob` | Client (existing or walk-in via `clients`), name, fixed price **or** open pricing, start date; optional end / notes / workers note |
| Module auto-surface | `createJob` → `noteModuleUsage('jobs')` | First job surfaces Jobs nav for projects-first orgs |
| Job list | `/jobs` + `listJobsForOrg` | Customer, job, date, status, price, **compose-batch actual/profit**, billing/payment status; search + facets |
| Job workspace | `/jobs/[jobId]` | Simplified tabs via `resolveJobTabs` / `JOB_TAB_PRIORITY` |
| Set open → fixed | `setJobFixedPrice` | Calls `upsertPrimaryContractAmount` (opening reduction 0) |
| Convert job → project | `convertJobToProject` | See RULE below |
| Home / reports filter | `?workKind=all\|project\|job` | Default `all`; Hebrew chrome: הכל / פרויקטים / עבודות |
| Locales | `jobs` namespace (en + he-IL) | Hebrew open-price copy: **המחיר טרם נקבע** |

Job tab priority (ops first; large-project setup hidden by default):

1. overview  
2. expenses  
3. time  
4. billing  
5. documents  
6. financials  
7. details  

Classic project tab order (`PROJECT_TAB_PRIORITY`) is unchanged.

---

## RULE

1. **One entity** — never a second jobs table, customer DB, or cost engine.
2. **`work_kind=job` + `pricing_mode=open`** — no fake zero revenue; profit UI shows price-not-set (`המחיר טרם נקבע`); costs may still accumulate.
3. **`pricing_mode=fixed`** — managed revenue via existing contract upsert APIs (Agent 1 owns opening-reduction formula).
4. **Conversion YES (only with revenue basis)** — `convertJobToProject` is blocked for open-price jobs and jobs without a managed primary contract / original CCV event (UI disabled + Hebrew error). When allowed: flips `work_kind` → `project`, **clears `pricing_mode` → `NULL`**, keeps the same row so contracts / expenses / billing / time / documents are preserved. Full project tabs appear after redirect to `/projects/[id]`.
5. **Walk-in clients** — lightweight `createClient({ name })` on the existing clients/party model.
6. **Pickers (expenses / procurement)** — default to **all** work kinds (`project` + `job`). Same financial entity.
7. **Audit** — keep `project.*` with payload flags (`workKind`, `pricingMode`). No parallel `job.created` vocabulary this wave.
8. **Nav wiring** — Agent 4 owns shell `NAV_ITEMS`; Agent 2 ships `/jobs` routes; Lead wires `noteModuleUsage('jobs')` on create.

---

## LIMITATION

1. **Workers on create** — free-text `workersNote` merged into notes only. Formal crew assignment remains on the Time / workforce flows (no new assignment table in this wave).
2. **Opening reduction on jobs** — quick job create uses contract upsert with reduction 0; mid-project entry baseline UX stays on classic project create/edit (Agent 1).
3. **Job → project is one-way in this wave** — no automatic `project → job` down-conversion (would hide structure the user may have built after convert).
4. **CRM convert-won-opportunity + reduction** — out of this wave; convert keeps reduction `0` / omitted.
5. **Onboarding profession → `work_mix`** — out of this wave; manual Features / work_mix setting is enough for V1.
6. **No backfill** — pre-wave contracts keep `display_original_*` / `opening_reduction_*` NULL (= equals managed).

---

## Navigation IA (Agent 4)

### Destinations (Hebrew)

| Destination | Route | Label |
|-------------|-------|-------|
| Projects | `/projects` | פרויקטים |
| Jobs | `/jobs` | עבודות |
| Quick create | `/jobs/new` | עבודה |

Lists are split by `work_kind`. Same financial engine; separate chrome.

### Org `work_mix` (no migration)

Stored in `organization_settings.key = work_mix`:

| Value | Mobile prominence |
|-------|-------------------|
| `projects` (default) | Projects primary; Jobs only if Features → Jobs is on / auto-surfaced via first `createJob` |
| `jobs` | Jobs primary; Projects demoted under More (still reachable) |
| `mixed` | Both Projects and Jobs primary (≤4 bottom-bar slots + More) |

Settings → Features → **סוג העסק / Business focus**. Optional module `jobs` still controls auto-surface when `work_mix=projects`.

### Job quick-create visibility (**RULE**)

Show when Jobs nav is visible (`work_mix` ≠ projects-only demotion path, or `jobs` module enabled / noted). Do **not** always expose Job quick-create on pure projects-first orgs with Jobs hidden.

### List facets (shared Projects + Jobs)

| Facet | Maps to |
|-------|---------|
| חדש / New | `status=draft` |
| פעיל / Active | `status=active` |
| הושלם / Completed | `status=completed` |
| ממתין לתשלום / Awaiting payment | Derived outstanding billing > 0 (not a new core status) |

Do not invent dozens of statuses. Existing enum stays.

### Mobile path

עבודות → עבודה חדשה → walk-in client (default) → description → price/mode → save → expense/time/doc/bill/payment. RTL; money `52,000 ₪`.

### Quick-create order

Follows `work_mix` (Job before Project when jobs/mixed).

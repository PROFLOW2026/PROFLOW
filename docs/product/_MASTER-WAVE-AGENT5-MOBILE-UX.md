# Master Wave — Agent 5: Simple Mobile Daily UX

**Agent:** 5 — Mobile / field UX  
**Status:** COMPLETE (proposal + schema-agnostic scaffolding notes)  
**Contract:** `_MASTER-WAVE-LEAD-CONTRACT.md`  
**Schema:** `0021` UNAPPLIED / Lead-owned — **no migration edits**. Temporal assignment columns are **not** on current `project_team_members` draft (role/notes only). Date-range UX below is **target**; wire only after Lead temporal model lands (Agent 2).

---

## 1. Product stance (binding for this agent)

| Mode | What the org must do | Daily mobile job |
|------|----------------------|------------------|
| **Simple** | Client → Project → Expenses / Billing / basic Time | Assign people, log hours, capture spend |
| **Advanced (optional)** | Compensation history, employer true-cost, monthly allocation, vendor cost split | Review one compact month strip; open details only when needed |

**Rule:** Org can skip **all** advanced workforce setup. Never gate Simple create flows on compensation, burden, allocation keys, or “setup incomplete” empty states for unused modules.

**Locked separations (never collapse in UI copy):**

- EMPLOYEE MASTER ≠ COMPENSATION HISTORY ≠ PROJECT ASSIGNMENT ≠ TIME ENTRY ≠ MONTHLY EMPLOYER COST ≠ COST ALLOCATION  
- ASSIGNMENT ≠ Actual. Time (with rate) / AP recognition may create Actual — assignment alone must not.

---

## 2. Daily mobile flows (simplest path)

### Flow A — Employee → assign to project → date range → save

**Entry (mobile):** Workforce → Employees → `{name}` → **Projects** card → **Assign to project**  
*(Today: panel is read-only; assign currently starts from Project → Team. Bidirectional entry is target UX.)*

| Step | Screen | Required fields | Optional / Advanced |
|------|--------|-----------------|---------------------|
| 1 | Pick project | Project (searchable list) | — |
| 2 | Dates | **From** (default: today) | **To** (default: open-ended / empty = ongoing) |
| 3 | Save | Primary CTA **Save** / **שמירה** | Role, notes under **More details** |

**Success:** Toast — “Assigned. No labor Actual created.” / “שויך. לא נוצרה עלות עבודה בפועל.”  
**Back:** Employee detail, Projects list shows new row with date span.

**Schema ask (Lead / Agent 2):** `starts_on` (date, required), `ends_on` (date, nullable). Until then: do **not** block save on dates; current V1 membership is open-ended roster only.

---

### Flow B — Project → team → add employee → dates → save

**Entry (mobile):** Projects → `{project}` → **Time & team** (or dedicated **Team** tab) → **Add employee**

| Step | Screen | Required fields | Optional / Advanced |
|------|--------|-----------------|---------------------|
| 1 | Pick employee | Employee (team-first if any; else active org list) | Link out: New employee |
| 2 | Dates | **From** (today) | **To** (open-ended) |
| 3 | Save | **Add** / **הוסף** | Role on project, notes |

**Success:** Same Actual disclaimer as Flow A.  
**List row:** Name · date span · optional role · secondary hours summary (time evidence only).

**Current code:** `ProjectTeamRoster` — employee + optional role; **no dates** (schema pending). Role should stay optional/collapsible (scaffolded).

---

### Flow C — Monthly allocation: one compact review

**Audience:** Owner / finance-capable roles only (`workforce.costs` / finance read — reuse existing permission gates).  
**Entry:** Reports or Project financials → **Month review** (not on bottom primary nav).

**First viewport — four facts only (one strip / one card):**

| Metric | Meaning | Hebrew label (suggested) |
|--------|---------|---------------------------|
| Cost | Monthly employer true-cost for the period (Agent 3 domain) | עלות חודשית |
| Allocated | Sum already allocated to projects / buckets | הוקצה |
| Unallocated | Cost − Allocated (must never be silently hidden) | לא הוקצה |
| Status | Balanced / Partial / Over / Not started | סטטוס |

**Details (collapsed by default):** per-project lines, vendor allocations (Agent 4), compensation basis, calculation disclosure. Use existing Advanced Disclosure / `<details>` pattern (“More details ›” / “פרטים נוספים”).

**Not a daily field task.** Foremen and site workers should not land here from Quick Create or bottom nav.

---

## 3. Screen map (mobile)

```
Bottom nav (unchanged V1): Home | Projects | Expenses | More
Quick Create (+): Project | Expense | Time  — NOT compensation / allocation / vendor split

More → Workforce
  ├─ Employees (list)
  │    ├─ New employee          [SIMPLE: name (+ optional title); rates OPTIONAL / collapsible]
  │    └─ Employee detail
  │         ├─ Profile (master)
  │         ├─ Projects         [Flow A — assign / list with dates when schema ready]
  │         ├─ Time (shortcut)
  │         └─ Compensation     [ADVANCED — hidden or deep link; never required]
  └─ Time entries / Quick log   [daily; creates Actual only with rate]

Projects → Project workspace
  ├─ Overview / Details / …
  └─ Time & team
       ├─ Team roster           [Flow B]
       └─ Recent time           [daily log]

Reports / Financials (permissioned)
  └─ Monthly employer cost review   [Flow C — compact strip + collapsible details]
```

### Field density rules

| Surface | Show daily | Hide / collapse |
|---------|------------|-----------------|
| Assign / Add to team | Person, From, To (when schema), Save | Role, notes, % allocation, burden, overtime rules |
| Log time | Employee, date, hours, project/code | Rate override, burden %, work package/phase unless already used on project |
| New employee | Name | Job title optional; rate/burden/employment style under Advanced (org may skip forever) |
| Month review | 4 metrics + status | Line drilldowns, vendor splits, true-cost formula |

---

## 4. Hebrew terminology suggestions

Prefer short field verbs; avoid accounting jargon on site phones.

| Concept | EN (UI) | HE (suggested) | Avoid on daily screens |
|---------|---------|----------------|------------------------|
| Employee master | Employee | עובד | “משאב אנושי”, “כרטיס עלות” |
| Project assignment | Assign / On team | שיוך לפרויקט / בצוות | “הקצאת עלות”, “allocation” translit |
| Date from / to | From / To (or Start / End) | מתאריך / עד תאריך | “תוקף תעריף” (that’s compensation) |
| Open-ended end | Ongoing | ללא תאריך סיום | — |
| Time entry | Log time | דיווח שעות | “רישום עבודה לחיוב” |
| Labor Actual | Labor cost (after time) | עלות עבודה בפועל | Don’t imply assignment created it |
| Monthly employer cost | Monthly cost | עלות מעסיק חודשית | Keep off roster screens |
| Allocated / Unallocated | Allocated / Unallocated | הוקצה / לא הוקצה | — |
| Status balanced | Balanced | מאוזן | — |
| Compensation history | Pay / rate history | היסטוריית תגמול / תעריף | Advanced only |
| Role on project | Role | תפקיד בפרויקט | Optional |
| Save | Save | שמירה | — |
| More details | More details | פרטים נוספים | — |

**Disclaimer microcopy (keep, one line):**  
EN: “Assignment ≠ labor Actual.”  
HE: “שיוך ≠ עלות עבודה בפועל.”  
(Already in `workforce` locales — retain; do not expand into a tutorial on daily screens.)

---

## 5. What NOT to show daily (field / mobile)

Do **not** surface on bottom nav, Quick Create, team add, or default employee create:

1. Compensation versioning / rate history editors  
2. Employer burden %, overtime multipliers, statutory true-cost worksheets  
3. Monthly allocation editors or “you must allocate before continuing” blockers  
4. Vendor bill → project cost allocation wizards  
5. Spreadsheet-style cost matrices, multi-currency converters, GL accounts  
6. Work package / phase / planning WBS unless the org already uses them on that project  
7. “Setup incomplete” empty states for unused advanced modules  
8. Dual jargon: never label assignment as “cost allocation”  
9. Forcing **To** date, role, or notes as required  
10. Creating or implying Actual from roster membership alone  

---

## 6. Advanced = optional forever

```
Simple path (always works):
  Client · Project · Expense · Billing · Time · Team roster (membership)

Optional layers (collapsible / separate routes / permissioned):
  Compensation history → Monthly true-cost → Cost allocation (labor)
  Vendor bill recognition → Vendor project allocation
```

Empty states for optional layers: quiet + single “Set up later” / “הגדרה בהמשך”, never red error chrome.

---

## 7. Target UI structure (wire-level)

### 7.1 Assign / Add sheet (shared pattern)

```
┌─────────────────────────────┐
│ Add to project / Assign     │  title
│ [ Employee ▾ ] or [ Project ▾ ] │  one picker
│ From [ YYYY-MM-DD ]         │  required when temporal schema exists
│ To   [ YYYY-MM-DD ]  optional│  empty = ongoing
│ ▸ More details              │  collapsed
│   Role  […………]              │
│   Notes […………]              │
│ [ Cancel ]     [ Save ]     │  Save = primary, full width on phone
│ Assignment ≠ labor Actual.  │  one muted line
└─────────────────────────────┘
```

### 7.2 Month review (compact)

```
┌─────────────────────────────┐
│ August 2026          ‹ ›    │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ │
│ │Cost│ │Alloc│ │Unalloc│ │Stat│ │  equal weight; status as badge
│ └────┘ └────┘ └────┘ └────┘ │
│ ▸ Details                   │  collapsed: lines / vendors / basis
└─────────────────────────────┘
```

---

## 8. Code touchpoints (current vs target)

| File | Today | Target after Lead temporal model |
|------|-------|----------------------------------|
| `src/modules/workforce/ui/project-team-roster.tsx` | Add employee + optional role | + From/To; role under More details (scaffolded now) |
| `src/modules/workforce/ui/employee-projects-panel.tsx` | Read-only list | + Assign CTA → Flow A |
| `src/modules/workforce/domain/types.ts` | No `startsOn` / `endsOn` on membership | Extend when Agent 2 / Lead freeze columns |
| `drizzle/.../0021_*.sql` | Membership without dates | Lead may redesign — **agents must not edit** |
| Month review UI | Not built | New permissioned surface; depends Agents 3–4 |

**Scaffolding policy this wave:** Prefer this proposal over fake date inputs that cannot persist. Existing panels get **comments** (`schema pending / Lead temporal model`) and optional role collapse only — no broken required fields.

---

## 9. Schema asks for Lead (tables/columns only)

From UX (Agent 5) — align with Agent 2 temporal proposal:

| Table (proposed) | Columns needed for mobile flows | Notes |
|------------------|----------------------------------|-------|
| `project_team_members` **or** temporal successor | `starts_on date NOT NULL`, `ends_on date NULL` | Open-ended = NULL end; validate `ends_on >= starts_on` |
| Same | Keep `role`, `notes` nullable | Never required in UI |
| *(no UX ask)* | Compensation / true-cost / allocation tables | Owned by Agents 1/3/4 — mobile only consumes month strip DTO |

Do **not** invent overlapping tables here. Assignment must remain ≠ Actual.

---

## 10. Tests run

| Check | Result |
|-------|--------|
| Migration / `db:migrate` | **Not run** (forbidden) |
| App compile / e2e for date assignment | **N/A** — dates not persisted yet |
| Non-breaking UI scaffold | Role optional under disclosure; comments only for dates |

---

## 11. Findings

### BLOCKER
- None for Agent 5 scope. Date-range **product** flows are blocked on Lead temporal schema (Agent 2) — tracked as HIGH dependency, not a UX design blocker.

### HIGH
- **H1 — Temporal dates missing on draft `0021` membership.** Mobile Flows A/B cannot persist From/To until Lead freezes columns (or replaces `project_team_members`). UI must not pretend dates save.
- **H2 — Employee → project assign is one-way today.** Only Project → Team adds members; employee panel is read-only. Field users starting from the person need Flow A after schema + actions exist.

### MEDIUM
- **M1 — Role still visible inline** on project add form (now collapsible Advanced); keep monitoring so advanced fields do not creep back into required create.
- **M2 — Month review screen not implemented.** Depends Agent 3/4 DTOs; keep off daily nav when built.
- **M3 — Rate fields on new employee** can still feel “required” depending on create page defaults — reinforce Advanced / skippable per product principle when touching that form in a later wave.

---

## 12. Delivery summary

```
STATUS = COMPLETE
Proposal = docs/product/_MASTER-WAVE-AGENT5-MOBILE-UX.md
Scaffold  = project-team-roster (role → Advanced disclosure + temporal comments);
            employee-projects-panel (temporal / Flow A comments)
Schema asks = starts_on / ends_on on assignment membership (Lead / Agent 2)
Tests run = none required (doc + non-breaking UI only); no migrate
BLOCKER = (none)
HIGH = H1 temporal schema; H2 missing employee-origin assign
MEDIUM = M1–M3 as above
```

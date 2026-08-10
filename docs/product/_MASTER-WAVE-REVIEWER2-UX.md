# Master Wave — Reviewer 2: UX / Product Simplicity

**Reviewer:** 2 — UX / Product Simplicity  
**Date:** 2026-08-10  
**Contract:** `_MASTER-WAVE-LEAD-CONTRACT.md`  
**Inputs:** Agent 2 assignments · Agent 5 mobile UX · Agent 4 vendor allocation (UX surface) · Agent 3 month strip (nav placement) · current workforce UI  
**Forbidden (obeyed):** commit / push / migration redesign / editing `0021`

### Lead resolution (2026-08-10) — BLOCKERs

| ID | Status | Action |
|----|--------|--------|
| **B1** | Closed for V1 | Planned % stays **off** first paint / Advanced assign sheet (role only under More details). Locale keys reserved: EN `plannedShareLabel` “Planned time share (optional)” / HE `חלק זמן מתוכנן (אופציונלי)` + hint that it is **not** cost allocation. Column name `planned_allocation_percent` remains DB-only. |
| **B2** | Closed | Roster primary action → **End assignment** / **סיים שיוך** (`projectPanel.endAssignment*`). App path already soft-ends via cancel; copy no longer says Remove/הסרה. |

HIGH items (employee→assign, create-employee density, date first-paint, advanced gating) remain open for later wire-up — not required to close this reviewer’s BLOCKERs.

---

## 0. Verdict (personas)

| Persona | Verdict | One-liner |
|---------|---------|-----------|
| **A — Small contractor** | Mostly OK today; at risk on create-employee density | Client → project → expense/billing/time still works; team roster is optional and does not invent cost. New employee still surfaces **employment style + rate** on first paint. |
| **B — Larger contractor / true cost** | Proposals OK if Advanced stays gated | Month review + vendor split + compensation history must stay off daily paths; unallocated must stay visible; never label assignment % as cost allocation. |
| **C — Field / mobile** | Daily time is clean; assignment is half-built | Quick log (employee · date · hours · project) is fast. Assign is **project-only**, no dates, Remove≠End, Save not phone-primary width. |

**Product principle check:** Advanced is still optional in *nav* (bottom bar + Quick Create unchanged). It is **not** fully optional in *create employee* (rate-unit UI required on first paint). Assignment ≠ Actual copy is present and should be retained as one muted line — not expanded into tutorials.

---

## 1. Scope audited

### Docs
- `_MASTER-WAVE-LEAD-CONTRACT.md`
- `_MASTER-WAVE-AGENT5-MOBILE-UX.md`
- `_MASTER-WAVE-AGENT2-ASSIGNMENTS.md`
- Cross-read: Agent 3 month strip · Agent 4 vendor allocation UX rules

### Current UI / copy
| Surface | Path |
|---------|------|
| Project team roster | `src/modules/workforce/ui/project-team-roster.tsx` |
| Employee projects panel | `src/modules/workforce/ui/employee-projects-panel.tsx` |
| Employee create form | `src/modules/workforce/ui/employee-form.tsx` |
| Project time + team tab | `src/modules/workforce/ui/project-time-panel.tsx` |
| Time entry / quick log | `src/modules/workforce/ui/time-entry-form.tsx` |
| Employee detail | `src/app/.../workforce/employees/[employeeId]/page.tsx` |
| Locales EN/HE | `src/locales/{en,he-IL}/workforce.json` |
| Mobile chrome | bottom nav + Quick Create (`nav.json`) |

---

## 2. What already works (do not break)

1. **Simple daily time** — `TimeEntryForm` first paint = employee, date, hours, project; notes under More details. Team members sort first when logging from a project. Good for persona C.
2. **Quick Create** — Project / Expense / Time (and peers); **not** compensation, month allocation, or vendor split. Matches Agent 5 screen map.
3. **Bottom nav** — Workforce stays under More; month review correctly proposed off primary nav.
4. **Assignment ≠ Actual** — Roster add success, footer note, employee projects note, and HE `שיוך ≠ עלות עבודה בפועל` align with contract. Keep one line; do not grow.
5. **Role optional** — Project add collapses role under More details (`common.actions.showMore` → EN “More details” / HE “פרטים נוספים”). Good scaffold.
6. **Hebrew daily verbs** — עובד, דיווח שעות, הוסף עובד, שמירה are short and site-usable. Avoid introducing הקצאה / allocation on roster screens.

---

## 3. Findings

Severity guide: **BLOCKER** = ships wrong mental model or breaks simple mode; **HIGH** = must fix before / with Lead temporal + advanced wire-up; **MEDIUM** = polish / density / consistency.

### BLOCKER

#### B1 — Assignment planning % must never speak “allocation / הקצאה”
Agent 2 proposes `planned_allocation_percent` under Advanced on the assign sheet. Expense + vendor + monthly cost UIs already use **הקצאה / Allocated / Unallocated** for **money**.

If Lead ships that field labeled “Allocation %”, “% הקצאה”, or anything that reads like cost split:
- Persona A thinks assigning someone *costs* the project.
- Persona B confuses planning weight with Agent 3/4 cost allocation.
- Violates locked chain: `PROJECT ASSIGNMENT ≠ COST ALLOCATION` and Agent 5 rule “never label assignment as cost allocation”.

**Required before any UI exposes the column:** EN e.g. “Planned time share (optional)” / HE e.g. “חלק זמן מתוכנן (אופציונלי)” — never הקצאת עלות. Prefer omit from V1 mobile entirely; soft warning only if sum > 100.

#### B2 — Remove-from-team must not stay hard-delete after temporal assignments land
Today: `Remove` → `removeProjectTeamMemberAction` (membership gone).  
Agent 2 target: **סיים שיוך** → set `end_date` / `completed`; history remains; Actual unchanged.

Shipping temporal schema while keeping “Remove = delete row” **destroys** history UX and teaches the wrong lifecycle (persona B audits; persona C re-hires). Not a migration redesign ask — **product action semantics** when Lead wires Agent 2.

**UX contract:** primary action = End assignment; hard delete only admin/mistake cleanup if ever.

---

### HIGH

#### H1 — Agent 2 vs Agent 5 conflict on date fields (Lead must pick one simple default)
| Source | First-paint assign |
|--------|-------------------|
| Agent 5 | From (required, default today) + optional To |
| Agent 2 | Employee + optional role; start/end under Advanced; defaults today + open-ended |

**Persona A/C need:** one tap Save with silent `start = today`, `end = null`. Visible date pickers are fine only if pre-filled and never block save when schema exists. Do **not** require the user to invent an end date.

**Recommendation for Lead:** Agent 2 simple path + Agent 5 defaults (no empty required dates). Show From/To in More details for persona B corrections; optional compact read-only “from today · ongoing” chip on success.

#### H2 — Employee → assign (Flow A) still missing
`EmployeeProjectsPanel` is read-only: list + Log time + empty state pointing at Project → Time & team. Field users start from the person (“מי עובד היום?”). Agent 5 H2 stands.

**Ship with temporal model:** Assign CTA → project picker → Save (dates defaulted). Until then, empty-state copy is honest — keep it; do not fake date UI.

#### H3 — New employee first paint is not “name-only simple”
`EmployeeForm` (default `showRateFields = true`):
- **Required** “Employment style” / “סוג העסקה” (rate unit) on first paint
- Optional base rate on first paint
- Burden under More details (good)

Agent 5 + contract: name (+ optional title); rates **optional / collapsible**; org may skip forever.

**Persona A impact:** create employee feels like a costing setup wizard.  
**Fix:** collapse employment style + base rate under More details / Advanced; default hidden `rateUnit=hourly` when no rate entered (already the no-permission path). Keep page description that rates do not create Actual.

#### H4 — Vendor multi-project split must stay Advanced; unallocated must be obvious
Agent 4 correctly: simple bill = single `project_id`, zero allocation rows. UX risks when building UI later:
1. Do not put split lines on mobile bill capture first paint.
2. Partial remainder must show as **Unallocated vendor cost / עלות ספק לא הוקצתה** (same family as expense unallocated) — never hide remainder to “look balanced”.
3. Copy must keep **PAYMENT ≠ Actual** and **bill recognition may create Actual** — one short disclosure, not a matrix on the phone.

#### H5 — Month review must never enter daily chrome
Agent 3/5: four-metric strip (Cost · Allocated · Unallocated · Status) for permissioned finance only.  
**Fail condition:** appearing in Quick Create, bottom nav, team add, or employee create empty states (“setup incomplete”). Quiet “Set up later / הגדרה בהמשך” only.

#### H6 — Hebrew tab/module synonym density (confusion, not wrong words)
| Surface | HE today |
|---------|----------|
| Nav workforce | עובדים |
| Workforce page title | עובדים ושעות |
| Project tab `time` | עובדים ושעות |
| Workspace link `workforce` | כוח אדם |

Daily words are fine; **כוח אדם** is more HR/jargon than site Hebrew. Prefer צוות / עובדים / דיווח שעות on project surfaces. When temporal lands, Agent 2’s **שיוכים** for employee-side list is clearer than static “פרויקטים משויכים” alone.

---

### MEDIUM

#### M1 — Duplicate “Log time” on project Time & team
`ProjectTeamRoster` header and the time card both offer Log time. On a phone this duplicates primary actions. Keep one primary Log time near the time list; roster can stay assign-focused.

#### M2 — Add-employee Save not full-width on mobile
Roster submit is `size="sm" className="self-start"`. Agent 5 wants primary Save full width on phone. Align with `TimeEntryForm` (`size="lg" block`).

#### M3 — Assignment hint Alert on every new employee
Info `Alert` explaining Project → Time & team is correct but heavy on small screens. Prefer one muted sentence under the title (page description already covers rates) or collapse into empty-state only.

#### M4 — Employee detail order when `showCosts`
Current rate card (and later rate history) sits **above** Assigned projects. For a costs-capable field lead, advanced cost appears before the daily job (where is this person assigned?). Prefer: Profile/Projects first; Compensation / rate history behind More details or a secondary section.

#### M5 — Hours lines on roster can read as “cost”
“Assigned · no hours” / hours summaries are evidence-only (good). Ensure they never sit next to money unless `workforce.costs` — and never imply hours = Actual without a rate. Current HE is mostly clear; keep “מדיווחי שעות בלבד” nearby when adding date spans.

#### M6 — Agent 5 scaffolding comments vs unfinished Flow A/B
Roster comments correctly avoid fake date inputs (good). Lead cutover checklist should include: history toggle, End vs Remove copy, employee Assign CTA, as-of roster for quick-log picker (Agent 2 M3) — otherwise field users see stale “every employee already on team” forever after end-dates.

#### M7 — “Employment style” / “סוג העסקה” wording
Label means rate unit (hourly/daily/monthly), not legal employment type. Risks persona A thinking contractor vs employee. Prefer “How rate is expressed / איך מבוטא התעריף” inside Advanced only (ties to H3).

#### M8 — Vendor + labor “Allocated / הוקצה” collision across modules
When month strip and vendor remainder ship, use consistent **money** vocabulary (הוקצה / לא הוקצה) and keep assignment on **שיוך / צוות**. Document a one-row glossary in Lead Hebrew report so Agents 3–5 do not drift.

---

## 4. Persona walkthroughs (checklist)

### A — Small contractor (simple system)
| Flow | Status | Notes |
|------|--------|-------|
| Create client / project / expense / billing | Out of scope; assume intact | Principle: no gate on compensation |
| New employee (name only) | **Fail-ish** | H3 — rate unit required on first paint |
| Skip team roster; only log time | **Pass** | Time does not require assignment |
| Add to team without cost | **Pass** | Disclaimer + no Actual from add |
| Never see monthly/vendor allocation | **Pass today** | Guard H4/H5 when advanced UI ships |

### B — Larger contractor (advanced cost)
| Flow | Status | Notes |
|------|--------|-------|
| Compensation history optional | **Partial** | Exists behind `showCosts`; not deep-linked/collapsed (M4) |
| Temporal assignment + history | **Proposal only** | H1/H2/B2 |
| Month strip: Cost / Allocated / Unallocated / Status | **Not built** | H5 placement rules |
| Vendor bill split + visible remainder | **Proposal only** | H4; Agent 4 anti-double-count is finance — UX must not show header+lines as both |
| Planning % on assignment | **Danger** | B1 |

### C — Field / mobile daily
| Flow | Status | Notes |
|------|--------|-------|
| Quick Create → Time | **Pass** | Fast path |
| Log time four fields | **Pass** | Notes collapsed |
| Project → Add employee | **Partial** | Works; no dates; Save not full-width (M2) |
| Employee → Assign | **Fail** | H2 read-only |
| Hebrew on site phone | **Mostly pass** | H6 synonym cleanup; keep short verbs |
| Advanced not in bottom nav | **Pass** | |

---

## 5. Hebrew terminology — Reviewer 2 recommendations

Align with Agent 5; tighten where agents disagree.

| Concept | Use (HE) | Do not use on daily screens |
|---------|----------|------------------------------|
| Employee | עובד | משאב אנושי, כוח אדם (prefer avoid on tabs) |
| Team roster | צוות | הקצאה |
| Assignment action | שיוך לפרויקט / הוסף לצוות | הקצאת עלות, allocation |
| Employee-side list | שיוכים | — |
| End assignment | סיים שיוך | מחק / הסרה as primary (after temporal) |
| From / To | מתאריך / עד תאריך | תוקף תעריף |
| Open-ended | ללא תאריך סיום / Ongoing | — |
| Time | דיווח שעות | רישום עבודה לחיוב |
| Labor Actual | עלות עבודה בפועל | — |
| Monthly employer cost | עלות מעסיק חודשית | On roster |
| Cost allocated / not | הוקצה / לא הוקצה | On assign sheet |
| Planning share (if shown) | חלק זמן מתוכנן | % הקצאה |
| More details | פרטים נוספים | — |
| Disclaimer | שיוך ≠ עלות עבודה בפועל | Long tutorials |

---

## 6. Lead integration notes (UX only — no migration design)

1. Resolve **H1** (date first-paint) and **B2** (end vs remove) in the same cutover as `employee_project_assignments`.
2. Enforce **B1** copy review before any `%` column on assignment UI.
3. Schedule **H3** employee-form collapse even if schema unchanged (UI-only; schema-agnostic).
4. Do not block Full Gate on missing month/vendor UI — but **do** block shipping those UIs without unallocated visibility and Advanced gating (H4/H5).
5. Preserve existing Actual disclaimer strings in `workforce` locales; extend only for temporal end (“historical שיוך remains; Actual unchanged”).

---

## 7. Delivery summary

```text
STATUS = COMPLETE
Review = docs/product/_MASTER-WAVE-REVIEWER2-UX.md
Schema / migrations = none (forbidden)
Tests run = none (audit only)

BLOCKER
  B1 Assignment planning % must not use allocation/הקצאה language
  B2 Temporal cutover must replace Remove-delete with End assignment

HIGH
  H1 Agent2/Agent5 date-field first-paint conflict — choose silent defaults
  H2 Employee → Assign (Flow A) still missing
  H3 New employee forces employment style/rate UI on first paint
  H4 Vendor split Advanced-only + visible unallocated remainder
  H5 Month review never on daily nav / Quick Create / setup blockers
  H6 HE synonym cleanup (כוח אדם vs צוות/עובדים/שיוכים)

MEDIUM
  M1–M8 density, Save width, hint Alert, detail order, hours/cost reading,
  cutover checklist, employment-style wording, cross-module הוקצה glossary
```

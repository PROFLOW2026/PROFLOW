# 22 — Scheduling, Execution & Field Operations

**Status:** Future architecture planning  
**Phase:** Planning only  
**Class:** Core extension (simple scheduling) + Construction vertical (field ops)  
**Timing intent:** simple dates/progress in V1.x–V2; advanced scheduling Later; field ops V3–Later

---

## 1. Purpose

Plan progressive scheduling and field-execution capabilities without forcing construction site workflows into the general core used by consultants and light professional services.

---

## 2. Layering principle

```text
Layer A — Simple planning (core-friendly)
Layer B — Advanced scheduling (optional)
Layer C — Field operations (Built Environment vertical packaging)
```

Do not require Layer B/C to use ProjectFlow for project economics.

---

## 3. Layer A — Simple (core extension)

Supports:

- project dates
- WorkPackage dates
- Phase dates
- milestones
- basic dependencies (optional)
- progress %
- status

Fits V1 hierarchy:

```text
Project → WorkPackage → optional Phase
```

Progress snapshots should be storable later without rewriting commercial entities.

---

## 4. Layer B — Advanced scheduling (later / optional)

- tasks
- activities
- richer dependencies
- calendar scheduling
- Gantt
- critical path concepts
- resource scheduling
- worker availability
- subcontractor scheduling
- equipment scheduling

### Architectural note

Task/Activity remain **below** Phase/WorkPackage and were explicitly deferred from V1 depth (`B4` decided).  
Advanced scheduling should attach to the existing tree, not replace WorkPackage.

---

## 5. Layer C — Field operations (construction vertical)

Package as Built Environment capabilities (enable/disable):

- daily logs
- site diary
- photos
- notes
- weather/event notes (if useful later)
- attendance
- delivered materials
- work completed
- blockers
- safety observations
- defects / issues
- punch lists
- inspections
- handover items

### Entity sketch (conceptual)

| Entity | Meaning |
|--------|---------|
| **DailyLog** | Per-day site/project record |
| **FieldNote** | Note/photo/observation |
| **Issue / Defect** | Trackable problem |
| **PunchListItem** | Closeout item |
| **Inspection** | Formal check event |
| **HandoverItem** | Turnover checklist item |
| **SafetyObservation** | Safety-related record |

Reuse Document links heavily. Safety/compliance docs may intersect `24`.

---

## 6. Relationship to commercial & cost modules

| Field signal | Downstream use |
|--------------|----------------|
| Progress % | Forecast final cost / billing readiness hints |
| Work done without approval | Change control risk (`05`, `27`) |
| Delivered materials | Inventory/procurement actuals (`21`) |
| Attendance | Time validation aid (`06`) |
| Blockers | Schedule risk / notifications (`26`) |

Field completion must **not** silently change Contract Value. Commercial effects still require ChangeOrder / billing records.

---

## 7. V1 impact

**No mandatory V1 expansion.**  
V1 may store basic project dates/statuses already needed for operations; full scheduling/field modules stay future.

---

## 8. Related documents

- Business/project model → `03-BUSINESS-PROJECT-MODEL.md`
- Documents → `09-DOCUMENTS-EXPENSE-CAPTURE.md`
- Mobile/offline → `31-MOBILE-OFFLINE-FIELD-UX.md`
- Compliance → `24-INSURANCE-COMPLIANCE-LICENSES.md`
- Capability map → `19-FUTURE-CAPABILITY-MAP.md`

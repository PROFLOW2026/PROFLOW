# Planning V1 — Known limitations

**Status:** Binding for Agent 6 overnight delivery  
**Module:** `src/modules/planning/`

## Critical Path (CPM)

When every **active** `planning_work_item` has schedulable dates, `buildCriticalPathFoundation()` runs
true CPM via `computeCpm()`:

- Finish-to-start dependencies only (zero lag).
- Durations from inclusive calendar days between `startDate` and `targetEndDate`.
- **Simplified calendar:** every day of the week counts as working time; **no holidays** yet.
- Total float and critical path = zero-float items.

`supported: false` when:

- The dependency graph fails validation (cycle, unknown item, etc.) → `planning.criticalPath.unsafe`
- Any active item lacks dates needed for CPM → `planning.criticalPath.missingDates`

Still **not** MS Project–grade scheduling:

| Missing for enterprise CPM | Why it matters |
|---------------------------|----------------|
| Custom working calendars / non-working days | Duration ≠ real crew time |
| Lag / lead on dependencies | FS with zero lag only |
| Multiple dependency types (SS/FF/SF) | Only `finish_to_start` in V1 |
| Resource leveling | Critical path ≠ resource-feasible path |
| Progress-driven retiming | Progress % does not retime the network |

**UI may label zero-float items as critical** when `supported: true`, with the simplified-calendar caveat above.

## Jobs opt-out

Planning defaults to `work_kind=project` only. Jobs (`work_kind=job`) must not be forced into heavy planning UX. Application helpers call `assertPlanningEligible`.

## Persistence

`0020_overnight_foundations` defines durable `planning_work_items` / `planning_dependencies`
(with same-org + same-project composite FKs). Drizzle repository is wired behind
`PLANNING_PERSISTENCE_READY` (**default false** until owner applies 0020).

While the flag is false, the in-memory store is a **test double only** — **do not claim
durable planning writes**. Production Drizzle path activates when the flag is flipped.

## Scope vs MS Project

V1 is useful timeline / dependency / progress / milestone visualization — not resource scheduling, baselines, earned value, or export interchange.

# Planning V1 — Known limitations

**Status:** Binding for Agent 6 overnight delivery  
**Module:** `src/modules/planning/`

## Critical Path — NOT shipped as product truth

Critical Path Method (CPM) is **unsafe** for V1 product claims. Foundations only:

| Missing for real CPM | Why it matters |
|----------------------|----------------|
| Working calendars / non-working days | Duration ≠ calendar span |
| Lag / lead on dependencies | FS edges alone understate constraints |
| Multiple dependency types (SS/FF/SF) | Only `finish_to_start` in V1 |
| Total / free float | Cannot mark “critical” bars honestly |
| Resource leveling | Longest path ≠ resource-feasible path |
| Partial / actual progress on network | Progress % does not retime the network |

`buildCriticalPathFoundation()` therefore always returns `supported: false` and exposes only:

- topological order (when acyclic)
- a **heuristic** longest path by calendar-day duration (debug / future use)

**UI must not label any bar or path as “Critical Path” / “נתיב קריטי”.**

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

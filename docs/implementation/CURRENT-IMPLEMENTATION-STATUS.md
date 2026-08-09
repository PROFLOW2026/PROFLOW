# ProjectFlow — Current Implementation Status

**Updated:** 2026-08-09 · Pre-launch program · Local HEAD ahead of origin · **Remote migrations:** through `0008` · **Local migrations:** through `0009_wave2_foundations`

## OWNER — before next push

```
REMOTE MIGRATIONS REQUIRED
- 0009_wave2_foundations
```

Do not push until 0009 is applied. Continue local development now.

## Wave 1 — local complete (0008 remote applied)

CI, CSV exports, light scheduling, presets, reports, documents drag/drop, AR aging start, cash outlook start.

## Wave 2 — in flight (parallel Auto agents)

| Stream | Status |
|--------|--------|
| Migration 0009 + schema (Lead) | Done locally |
| Richer AR | Agent running |
| Cash flow expansion | Agent running |
| Structured import | Agent running |
| CRM lifecycle | Agent running |
| Compliance | Agent running |
| Portal + custom fields + API | Agent running |

## Deferred

Notifications / doc 26; marketing/pricing; native apps; fake OCR integrations.

## Notes

- Subagent policy clarified: Auto/Composer allowed; subagent APIs forbidden.
- Lead owns migration numbering; agents must not invent competing schema.

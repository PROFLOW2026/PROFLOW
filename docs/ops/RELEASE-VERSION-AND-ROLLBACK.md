# Production version and rollback (forward-only)

## Record on every production promotion

| Field | Source |
| --- | --- |
| Git SHA | GitHub `main` HEAD at deploy time |
| Vercel deployment id | Vercel Production deployment for that SHA |
| Last applied migration tag | `drizzle.__drizzle_migrations` newest row (read-only EB-1) |

## Rollback rule

Schema and business data roll **forward only**. Never revert an applied migration file or run `DOWN` SQL in Production.

If a release misbehaves:

1. Fix forward in a new migration or code commit.
2. Redeploy the corrective SHA.
3. Run postflight read-only checks (ops health, financial smoke) documented in `docs/launch/CRON-WORKER-RELEASE-SMOKE.md`.

## Data backfill / repair

1. Dry-run script or report-only worker (no cloud deletes).
2. Owner review (Gate B for SQL or approved id list).
3. Execute with audit + postflight counts.

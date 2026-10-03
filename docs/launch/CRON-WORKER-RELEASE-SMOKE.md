# Cron / worker release smoke (post-deploy)

Verify **after** Production deploy with secrets configured. Do not log secret values.

| JOB | TRIGGER | ROUTE / SECRET | HOW TO VERIFY | SUCCESS | FAILURE |
|-----|---------|----------------|---------------|---------|---------|
| OCR recovery | Vercel cron 05:00 UTC | `POST /api/internal/ocr-worker` · `CRON_SECRET` or `OCR_WORKER_SECRET` | Vercel cron log 200; or manual POST with Bearer | JSON ok, no 401 | 401 unauthorized |
| Ops bundle | Vercel cron 06:00 UTC | `POST /api/internal/ops-worker` · `CRON_SECRET` | Cron log; response includes task counters | 200 + counters | 401 or error payload |
| SUMIT expense drain | Vercel cron 06:30 UTC | `POST /api/internal/sumit-expense-worker` · `CRON_SECRET` | Cron log | 200 | 401 |
| Storage provision chain | On-demand + ops kick | `POST /api/internal/storage-provision-worker` · `STORAGE_PROVISION_WORKER_SECRET` | Connect storage → folders progress; ops recovery log | `[org-storage/provision]` progress | `skipped_unconfigured` |
| SUMIT ambiguous recovery | Inside ops-worker | via ops auth | Stale ambiguous doc → after run, `issuanceOutcome=confirmed_created` if provider has doc | resolved count ↑ | still_ambiguous |
| Material market refresh | Inside ops-worker | via ops auth | Global snapshots update after cron | materialMarket counters | failed in ops JSON |
| Task reminders / notifications | Inside ops-worker | via ops auth | No error in ops JSON | emitted ≥ 0 | failures array |

**Manual POST template (operator):** `Authorization: Bearer $CRON_SECRET` to route URL on production origin.

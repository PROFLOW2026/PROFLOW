# Takeoff input modes — infrastructure assessment (2026-11-15)

Owner-approved feature: **persistent (org cloud)** vs **ephemeral (no org storage)**.

## Verdict

**No critical blocker** for implementing both modes on the **existing** topology (Next.js on Vercel + dedicated takeoff worker).  
**Do not** rely on the in-process `memory` file store in production without org storage — use **ephemeral disk** under `os.tmpdir()` with TTL purge instead.

## Answers to the seven review questions

| # | Topic | Finding |
|---|--------|---------|
| 1 | Vercel load (large PDF/DWG) | Unchanged risk profile: chunked upload (4 MiB/chunk), max **250 MiB** server / **120 MiB** client validation. Finalize still assembles one buffer in `chunk-upload` today — heavy for multi‑hundred‑MB DWG on small function memory. Mitigation for ephemeral: disk-backed store streams chunks to `/tmp` (new). Org-cloud path unchanged. Worker does the heavy parse, not Vercel. |
| 2 | Where temp bytes live | **Worker:** per-job `tempfile.mkdtemp`, always cleaned in `finally`. **App:** org mode → provider folder `plans`; ephemeral → **Node `/tmp/projectflow-takeoff/{orgId}/{fileId}`** (not Vercel Blob, no new paid service). |
| 3 | Existing worker | **Yes.** Same HTTP contract (`downloadUrl`, callbacks). No deploy change to worker required. |
| 4 | Deletion on failure / disconnect | Ephemeral: explicit **purge** + **TTL** (`ephemeral_expires_at`); purge removes DB analysis row + disk blobs + skip org documents. Failed jobs: bytes remain until TTL/purge (user can export then purge). Worker temp dirs still removed on worker side. |
| 5 | Concurrent users | Isolation by `organizationId` + UUID file ids on disk; no cross-org paths. Risk: `/tmp` pressure on a single warm instance — bounded by TTL + max file cap. Same as today for concurrent takeoff jobs on worker CPU. |
| 6 | Extra cost | No new marketplace service. Same worker CPU/RAM; slightly more Vercel `/tmp` IO for ephemeral uploads. |
| 7 | Tenant isolation | Enforced: RLS on DB rows; file store paths include `organizationId`; worker URLs use job bearer + jobId/fileId scoped auth. |

## What we are **not** doing without further Owner approval

- Vercel Blob / S3 / paid temp storage SaaS
- Running PDF/DWG parsing inside Vercel functions
- Storing ephemeral bytes in Postgres or permanent Vercel artifacts

## Operational note

Ephemeral analyses are **not** listed for long-term reopen; after purge only export artifacts the user already downloaded remain on their device.
# PHASE 2 — Production migration state verification (read-only)

**Purpose:** Resolve the contradiction between “0179 applied successfully” (prior release narrative) and “PREPARED ONLY” (SQL file header).  
**Rule:** `PREPARED ONLY` in `drizzle/migrations/*.sql` is **release-process metadata**, not evidence of Production apply state.  
**This document does NOT execute anything against Production.** Owner must **explicitly approve** before any query runs on a shared/Production database.

---

## 1. What we know without Production access

| Source | Fact |
|--------|------|
| Repo journal | `npm run db:check-journal` → **178** files, last tag **`0179_connected_projects`** |
| Local unit test | `migration-journal.test.ts` expects **0179** as latest tag |
| SQL file header | `0179_connected_projects.sql` contains `PREPARED ONLY — Owner applies after review` |
| Prior Oct audits | **SEC-010 / A01-001:** Production apply through 0172+ was **unknown** without Owner DB read; no agent in Oct-2026 full audit read Production |
| Contradiction | If a human report said “0179 applied,” that claim must be **re-verified** via `drizzle.__drizzle_migrations` (or Supabase migration UI), not via SQL file headers |

---

## 2. Approved verification procedure (Owner gate)

### 2.1 Environment safety check (mandatory before SQL)

1. Confirm `DATABASE_URL` / `DIRECT_DATABASE_URL` target **hostname** and project name (Supabase dashboard).
2. **Abort** if the URL points at Production/shared business data unless Owner explicitly approved **read-only** verification in the current message.
3. Prefer **Supabase SQL Editor** with a read-only role, or local script with `SELECT` only.

### 2.2 Read-only queries (no DDL, no DML)

**A — Drizzle migration ledger (authoritative for this app)**

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC
LIMIT 25;
```

Compare the latest rows to repo files under `drizzle/migrations/` (tags `0177`, `0178`, `0179`, etc.).  
Journal **hash** should correspond to migration folder content at deploy time.

**B — Target migrations presence (0173, 0174, 0179)**

After identifying how tags map to hashes in (A), confirm whether these **objects** exist (schema proof):

```sql
-- 0179 connected projects
SELECT to_regclass('public.connected_project_mappings') AS mappings_table,
       to_regclass('public.engagement_connection_invitations') AS invitations_table,
       to_regclass('public.cross_org_sync_outbox') AS outbox_table,
       to_regclass('public.connected_claim_cash_projections') AS projections_table;

-- 0179 mapping columns (detect K05-001 schema/code alignment)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'connected_project_mappings'
ORDER BY ordinal_position;

-- 0173 FORCE RLS (example — adjust table names per 0173 file if needed)
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    -- fill from drizzle/migrations/0173_force_rls_five_tables.sql
    'employee_month_costs'
  );

-- 0174 audit/contracts RLS helpers (existence smoke)
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'app'
  AND proname IN ('has_org_permission', 'can_access_project');
```

**C — Optional: Supabase UI**

Project → Database → Migrations — compare applied list to repo journal (secondary to `__drizzle_migrations` for Drizzle-driven deploys).

### 2.3 Local helper (same query, Owner-run)

Repo script (uses env DB — **not** run by agents on Production without approval):

`.tools/check-last-migration.mjs` — prints last 5 rows from `drizzle.__drizzle_migrations`.

---

## 3. Interpretation matrix

| Observation | Meaning |
|-------------|---------|
| `connected_project_mappings` **missing** | **0179 not applied** on this DB; Mode B code paths no-op or fail soft |
| Table **exists**, no `vendor_id` on mappings | Matches repo **0179**; app **K05-001** must be fixed before relying on Mode B |
| Table exists, journal shows 0179 hash, but app broken | **Applied schema + code drift** — fix via **new additive migration** only if schema change needed; never edit applied 0179 file |
| Journal lags repo (e.g. stops at 0176) | **Production drift** — features in code may assume newer RLS/tables |

---

## 4. Reporting template (fill after Owner-approved read)

```
PRODUCTION MIGRATION READ = YES | NO
DATABASE TARGET = (hostname / project id)
LAST drizzle.__drizzle_migrations ROW = 
0173 FORCE RLS VERIFIED = YES | NO | NOT CHECKED
0174 RLS HELPERS VERIFIED = YES | NO | NOT CHECKED
0179 TABLES VERIFIED = YES | NO | NOT CHECKED
0179 mapping columns = (paste column list)
CONTRADICTION RESOLVED = (one sentence)
```

---

## 5. Agent constraints (unchanged)

- No `npm run db:migrate` on Production without separate Owner SQL approval.
- No re-apply of existing migrations.
- Schema fixes → **0180+ additive** migration prepared for review only.

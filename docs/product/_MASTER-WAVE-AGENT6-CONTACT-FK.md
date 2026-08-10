# Agent 6 — Project Contact FK Audit + 0021 Correction Proposal

**Status:** COMPLETE  
**Agent:** 6 (Contact FK audit)  
**Scope:** `drizzle/migrations/0021_project_contacts_and_team.sql` contact section + app contact paths  
**Forbidden actions observed:** no commit / push / `db:migrate` / migration SQL edits  

---

## Verdict

**Do not ship the current draft `projects_primary_contact_org_fk` as written.**

```sql
FOREIGN KEY ("primary_contact_id", "organization_id")
  REFERENCES "client_contacts" ("id", "organization_id")
  ON DELETE SET NULL;
```

In PostgreSQL, `ON DELETE SET NULL` on a **composite** FK nulls **every** referencing column in the FK. That includes `organization_id`. Even though `projects.organization_id` is `NOT NULL` (so real PG may fail the delete / reject the action instead of silently corrupting), this pattern is still a **tenant-integrity landmine** and diverges from the safe Drizzle schema already drafted:

```ts
primaryContactId: uuid('primary_contact_id').references(() => clientContacts.id, {
  onDelete: 'set null',
})
```

**Lead must replace the contact FK before applying 0021.**

Team-table composite FKs in the same file use `ON DELETE CASCADE` (delete child row) — those are **safe** and out of this contact fix, except: do not copy the contact `SET NULL` pattern onto any other composite tenant FK.

---

## BLOCKER / HIGH / MEDIUM

### BLOCKER

1. **Composite FK + `ON DELETE SET NULL` on `(primary_contact_id, organization_id)`**
   - Classic PG behavior: SET NULL applies to **all** FK columns.
   - Intended outcome (clear contact pointer) cannot be expressed safely this way while `organization_id` is part of the FK.
   - Failure modes:
     - **Corruption path:** engines/settings that null all FK cols → `projects.organization_id` wiped → RLS/tenancy broken.
     - **Hard-fail path (likely on stock PG with NOT NULL):** deleting a referenced `client_contacts` row (or cascading from `clients` delete) fails when trying to null `organization_id`.
   - Either way: contact delete / client cascade is unsafe or broken; product rule “optional contact” cannot rely on FK cleanup.

### HIGH

2. **Migration ↔ Drizzle schema mismatch**  
   SQL uses composite org FK; `drizzle/schema/projects.ts` uses single-column FK. Lead must make 0021 match the safe schema (or intentionally change both).

3. **No integrity test for contact DELETE → project pointer**  
   `tests/integration/projects/0021-contacts-team-integrity.test.ts` checks mismatch trigger + indexes, but **does not** assert that deleting a contact only clears `primary_contact_id` and leaves `organization_id` intact. Add this before Full Gate.

4. **Client delete cascade interaction**  
   `client_contacts.client_id` → `ON DELETE CASCADE`; `projects.client_id` → `ON DELETE SET NULL`. With the broken composite contact FK, deleting a client that still has projects pointing at those contacts is undefined/unsafe (fail or corrupt) depending on engine ordering.

### MEDIUM

5. **Index shape mismatch**  
   SQL: partial `projects_primary_contact_idx … WHERE primary_contact_id IS NOT NULL`.  
   Drizzle: non-partial `index('projects_primary_contact_idx').on(table.primaryContactId)`. Prefer partial (matches SQL draft); sync Drizzle or accept SQL as source of truth in 0021.

6. **Client-change clear is app + reject, not DB auto-clear**  
   `update-project.ts` clears `primaryContactId` when `clientId` changes. Trigger **rejects** mismatch if someone updates `client_id` while leaving a foreign contact. That is correct for integrity; optional improvement is DB auto-null of contact when `client_id` changes (see optional SQL below). Not required for ship if app + reject remain.

7. **`removeClientContact` does not pre-clear project refs**  
   Relies entirely on FK `ON DELETE SET NULL`. Acceptable **after** single-column FK fix; optional BEFORE DELETE clear trigger is belt-and-suspenders.

---

## App-layer audit (contact product rules)

| Rule | Result | Evidence |
|------|--------|----------|
| Optional project contact | **OK** | Nullable column; schemas allow null; create/update resolve null |
| Same org | **OK (app)** | `getClientContactById` / repos scope by `organizationId` |
| Contact belongs to project client | **OK** | `assert-project-contact` + `contactBelongsToClient`; DB trigger mirrors |
| Client change clears/invalidates contact | **OK (app)** | `update-project.ts` sets `nextPrimaryContactId = null` on client change; DB rejects leftover mismatch |
| No client-primary mutation from project contact | **OK** | `manage-contacts.markClientContactAsPrimary` documents projects must not call it; create/update project never call it; integration test covers |
| Display fallback | **OK** | `get-project-detail` prefers project contact if still same client; else practical client primary |
| RLS on new team table | **OK** | 0021 enables FORCE RLS + tenant policies on `project_team_members` |
| RLS on `projects.primary_contact_id` | **OK** | Column on existing tenant-scoped `projects`; no new table |

**App gaps (non-blocking if SQL fixed):**

- DB same-org is currently hoped-for via composite FK; after switching to single-column FK, **same-org must remain enforced by the existing trigger** (it already checks `c.organization_id = NEW.organization_id`). Keep that trigger.
- Trigger fires `BEFORE INSERT OR UPDATE OF primary_contact_id, client_id, organization_id` — good. Does not need to fire on contact-row moves (`updateClientContact` cannot change `client_id` today).

---

## Recommended SQL correction (Lead — exact replace for contact section)

**Preferred: Option A — single-column FK + keep client/org guard trigger**  
Aligns with Drizzle; safe `ON DELETE SET NULL`; same-org + client match stay in trigger.

Replace the contact FK block in 0021 (lines ~24–85) with:

```sql
--------------------------------------------------------------------------------
-- Project-specific practical contact (reuse client_contacts)
-- IMPORTANT: Do NOT use composite (primary_contact_id, organization_id)
--            with ON DELETE SET NULL — PG nulls ALL FK columns.
--------------------------------------------------------------------------------

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "primary_contact_id" uuid;

-- Drop unsafe draft constraint if a prior disposable apply created it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_primary_contact_org_fk'
  ) THEN
    ALTER TABLE "projects" DROP CONSTRAINT "projects_primary_contact_org_fk";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_primary_contact_id_fk'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_primary_contact_id_fk"
      FOREIGN KEY ("primary_contact_id")
      REFERENCES "client_contacts" ("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "projects_primary_contact_idx"
  ON "projects" ("primary_contact_id")
  WHERE "primary_contact_id" IS NOT NULL;

-- Same-org + contact.client_id = project.client_id (composite FK no longer provides org match)
CREATE OR REPLACE FUNCTION app.projects_primary_contact_client_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contact_client uuid;
BEGIN
  IF NEW.primary_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'projects_primary_contact_requires_client'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.client_id INTO contact_client
  FROM public.client_contacts c
  WHERE c.id = NEW.primary_contact_id
    AND c.organization_id = NEW.organization_id;

  IF contact_client IS NULL THEN
    RAISE EXCEPTION 'projects_primary_contact_not_found'
      USING ERRCODE = '23503';
  END IF;

  IF contact_client IS DISTINCT FROM NEW.client_id THEN
    RAISE EXCEPTION 'projects_primary_contact_client_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_primary_contact_client_guard ON public.projects;
CREATE TRIGGER projects_primary_contact_client_guard
  BEFORE INSERT OR UPDATE OF primary_contact_id, client_id, organization_id
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION app.projects_primary_contact_client_guard();
```

### Optional belt-and-suspenders (recommended)

Clear only `primary_contact_id` before contact row delete (does not touch `organization_id`). Useful if anything ever changes FK action, and makes delete behavior explicit:

```sql
CREATE OR REPLACE FUNCTION app.client_contacts_clear_project_primary_contact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.projects
  SET primary_contact_id = NULL
  WHERE primary_contact_id = OLD.id
    AND organization_id = OLD.organization_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS client_contacts_clear_project_primary_contact ON public.client_contacts;
CREATE TRIGGER client_contacts_clear_project_primary_contact
  BEFORE DELETE ON public.client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION app.client_contacts_clear_project_primary_contact();
```

With single-column `ON DELETE SET NULL`, this trigger is redundant but harmless (idempotent nulling). Prefer keeping it for defense in depth.

### Optional: auto-clear contact when project client changes

If Lead wants DB to mirror app clear instead of only rejecting:

```sql
-- Inside projects_primary_contact_client_guard, before mismatch raise:
IF TG_OP = 'UPDATE'
   AND NEW.client_id IS DISTINCT FROM OLD.client_id
   AND NEW.primary_contact_id IS NOT NULL THEN
  -- Re-validate; if mismatch, clear rather than raise:
  -- (only if Lead chooses soft-clear policy)
  NULL;
END IF;
```

**Agent 6 recommendation:** keep **reject** on mismatch (current trigger). App already clears on client change. Soft-clear is optional UX polish, not required for safety once FK is fixed.

---

## Option B (acceptable alternative)

Keep composite same-org FK **without** `ON DELETE SET NULL`:

```sql
FOREIGN KEY ("primary_contact_id", "organization_id")
  REFERENCES "client_contacts" ("id", "organization_id")
  ON DELETE NO ACTION;  -- or RESTRICT
```

Plus the `BEFORE DELETE ON client_contacts` trigger above that sets **only** `projects.primary_contact_id = NULL`.

**Do not** use Option B with `ON DELETE SET NULL`.

Option A is preferred because it matches Drizzle and the rest of the codebase’s single-column SET NULL pattern.

---

## What to keep from current 0021 contact draft

| Piece | Keep? |
|-------|-------|
| `primary_contact_id uuid` nullable column | Yes |
| `client_contacts_id_organization_id_uq` | Yes (still useful; required if any composite refs remain / Option B) |
| `projects_primary_contact_client_guard` function + trigger | Yes (required under Option A for same-org + client match) |
| Partial `projects_primary_contact_idx` | Yes |
| `projects_primary_contact_org_fk` + `ON DELETE SET NULL` | **No — remove/replace** |
| Team table / RLS block | Out of contact FK fix; CASCADE composites OK |

---

## Test asks for Lead (after SQL rewrite)

Add to `0021-contacts-team-integrity` (or project-contact integration):

1. Insert project with `primary_contact_id` set → `DELETE FROM client_contacts WHERE id = …` → assert `projects.primary_contact_id IS NULL` **and** `projects.organization_id` unchanged.
2. Delete client with contacts used as project contacts → projects survive; `client_id` null; `primary_contact_id` null; `organization_id` intact.
3. Keep existing client-mismatch trigger test.
4. Update unit journal expectation: expect `projects_primary_contact_id_fk` (not `projects_primary_contact_org_fk`) if constraint renamed.

---

## Schema asks for Lead

| Object | Action |
|--------|--------|
| `projects.primary_contact_id` | Keep nullable uuid |
| FK name | Prefer `projects_primary_contact_id_fk` → `client_contacts(id)` `ON DELETE SET NULL` |
| Drop | `projects_primary_contact_org_fk` if present |
| Trigger | Keep `projects_primary_contact_client_guard` (org + client match) |
| Optional trigger | `client_contacts_clear_project_primary_contact` BEFORE DELETE |
| Drizzle | Keep single-column `.references(() => clientContacts.id, { onDelete: 'set null' })`; sync index partiality |

**No new tables/columns required for the FK fix.**

---

## Delivery summary

```
STATUS = COMPLETE
Proposal = docs/product/_MASTER-WAVE-AGENT6-CONTACT-FK.md
Schema asks = replace composite SET NULL FK with single-column FK + keep guard trigger
Tests run = none (audit-only; no migration edit)
BLOCKER = composite ON DELETE SET NULL on (primary_contact_id, organization_id)
HIGH = schema/SQL mismatch; missing delete integrity test; client-cascade risk
MEDIUM = index partiality; app-only client-change clear; delete relies on FK
```

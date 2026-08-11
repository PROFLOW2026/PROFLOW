# SCHEMA_REQUEST — Field forms photos + offline idempotency (Agent 10)

**Status:** Soft gaps — forms module works without these; photos/offline harden with them  
**Module:** `src/modules/forms`  
**Why:** Photos must reuse documents storage. `document_owner_type` has no `form_submission`. Offline drafts use `offline_client_id` without a uniqueness guarantee.

## 1. Document owner type: `form_submission`

Additive enum value (same pattern as 0013):

```sql
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'form_submission';
```

Also update:
- `drizzle/schema/enums.ts` `documentOwnerTypeEnum`
- `src/modules/documents/domain/types.ts` `DOCUMENT_OWNER_TYPES`
- `verify-document-owner.ts` → resolve against `form_submissions`

**Until landed:** photo answers store `documentIds` in `answers_json`; UI links uploads to parent `project` / `daily_log` when resolvable (`documentOwnerForFormOwner`). Planning/maintenance owners cannot attach photos via documents yet.

## 2. Unique offline client id

```sql
CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_org_offline_client_uq
  ON public.form_submissions (organization_id, offline_client_id)
  WHERE offline_client_id IS NOT NULL;
```

App already idempotents via `findSubmissionByOfflineClientId` before insert; unique index prevents races.

## 3. Not requested

- No legal e-signature / certificate columns
- No second storage bucket for form photos
- Retention/holdback unchanged (deferred)

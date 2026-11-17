# Migration 0213 — restore privileges after 0205 `ON ALL TABLES`

## SQL / MIGRATION PREPARED = YES

**FILE** = `drizzle/migrations/0213_boq_nodes_acl_restore_after_0205.sql`  
(journal idx 209, tag `0213_boq_nodes_acl_restore_after_0205`)

**PURPOSE** = Undo the privilege side-effect of **0205**’s trailing:

`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated`

Production verification (2026-11-17): **404** public relations have authenticated SELECT+INSERT+UPDATE. Schema `app` was **not** affected.

This migration restores only objects with an **explicit historical REVOKE/GRANT policy** in prior migrations (BOQ money isolation, audit immutability, sequences, outboxes, connected-project SELECT-only surfaces, etc.). It does **not** strip intentional grants on ordinary business tables (employees, vendors, expenses, contracts) that already had matching DML grants + RLS.

**DATA MUTATION** = none  
**SCHEMA MUTATION** = `REVOKE` / `GRANT` only  
**IDEMPOTENT** = yes

**Production status** =

- Migrations **through 0212** = **APPLIED**
- **0205** = **APPLIED** (immutable; do not edit)
- **0213** = **APPLIED** on Production `rnjeggpsjchayprygkcw` (2026-11-17)  
  Ledger: `created_at = 1794788400000`, single row, hash matches applied file

**READY FOR OWNER REVIEW** = applied after conditional Owner approval

## Note on replaced draft

Never-applied trigger draft `0213_boq_nodes_authenticated_dml_denial.sql` was removed before Production apply. This ACL restore is the replacement.
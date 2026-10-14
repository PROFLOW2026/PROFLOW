# Owner approval request — EB-1 (read-only) + Gate B (SQL write)

**Date:** 2026-10-14  
**Prepared by:** Lead execution (Gate A code complete for migrations **0183–0192** SQL in `drizzle/migrations/`; **not in journal** until Gate B).

**This document is a request for approval, not authorization to run anything.**

---

## A. EB-1 — Production read-only verification

**What you approve:** Scoped read-only access so Lead can run checklist **§1** in [GATE_B_MIGRATION_PACKET.md](./GATE_B_MIGRATION_PACKET.md) inside `BEGIN TRANSACTION READ ONLY` (or equivalent).

**What is NOT included:** DDL/DML, `npm run db:migrate`, applying pending journal tags 0183–0192, data backfills.

**Reply when approving:** Explicit text such as: *“מאשר EB-1 read-only Production”* with connection scope if limited.

---

## B. Gate B — apply pending migrations 0183–0192

**What you approve:** After EB-1 results and packet review, separate explicit approval to **apply** SQL (Production or shared DB) in order **0183 → 0192** (or approved subset), with **per-tag journal promotion** into `drizzle/migrations/meta/_journal.json` and `MIGRATION_APPROVED_TAGS` / `--owner-approved` for any journal tags **0177–0182** required in the same maintenance window.

**Local verification already done (disposable PGlite):**

- `npx vitest run --project migration tests/integration/migration/gate-b-prepared-apply.test.ts` — PASS, idempotent second pass.

**Rollback / backup:** See §4 in [GATE_B_MIGRATION_PACKET.md](./GATE_B_MIGRATION_PACKET.md).

**Reply when approving:** Explicit text such as: *“מאשר Gate B apply 0184–0192”* (tag list if subset).

---

## C. Still not Gate C

Commit, push, deploy remain **Gate C** — not covered by this request.

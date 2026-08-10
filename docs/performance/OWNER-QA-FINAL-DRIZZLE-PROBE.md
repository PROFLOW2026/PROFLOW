# Owner QA Final — Drizzle client chunk probe

**Verdict:** REAL leak (not a false positive), then fixed at the import boundary.

## Evidence (pre-fix build)

- Probe hit `.next/static/chunks/10txmkk5vf6e-.js` (~128 691 bytes) on project / jobs / expenses first-load graphs (`LIVE-VERIFICATION.json`, `route-bundle-stats.json`).
- Chunk contents included:
  - `Symbol.for("drizzle:entityKind")`
  - `drizzle:hasOwnEntityKind` / `drizzle:isPgEnum`
  - table SQL fragments from `@drizzle/schema` (e.g. punch priority check, invoicing `tax_invoice` kinds, changes `quantityNormalized`)
- Chunk did **not** include the Postgres driver (`postgres` / `Pool` / `drizzle-orm/postgres-js`). So: ORM + schema in the browser, not a live DB client.

## Import chain

1. Client UI (e.g. `crm/leads/[leadId]/lead-status-form.tsx`) imports `@/modules/crm/domain/types`.
2. `crm/domain/types.ts` value-imported `AUDIT_ACTIONS` from `@/shared/audit`.
3. `@/shared/audit` value-imported `drizzle-orm` + `@drizzle/schema` (`auditEvents`, `profiles`).
4. Turbopack pulled a large slice of the schema barrel into the shared client chunk (~128 KB).

Secondary risk (also closed): client forms importing `computeTaxAmountBreakdown` from the `@/modules/tax` barrel (which also re-exports application/queries → repository → Drizzle). Switched to `@/modules/tax/domain/amounts`.

## Fix

- Split catalog to `src/shared/audit/actions.ts` (constants only, client-safe).
- Mark `src/shared/audit/index.ts` with `import 'server-only'` (writer/list stay server).
- Point CRM domain types at `@/shared/audit/actions`.
- Point tax math call sites used by client paths at `@/modules/tax/domain/amounts`.

## Probe tightening

`tests/e2e/authenticated/performance-verify.spec.ts` now matches ORM markers (`drizzle:entityKind`, etc.) and explicit driver markers — not a bare `postgres` substring.

## Re-verify

Lead should rebuild + re-run the performance spec. Expect `chunkProbe.drizzleRelated` empty (or no `drizzle:entityKind`) on authenticated project routes after this fix.

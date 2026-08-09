# Agent Contracts — Wave B (parallel V1 modules)

Read this before writing any code. The Lead owns integration; you own your slice.

---

## 1. Non-negotiable rules

1. **Never run `git`.** No init, no branch, no commit, no push. The project is not a repository yet.
2. **Never run `npm install`, `next build`, or `next dev`.** The Lead owns dependencies and the build. Use `npx tsc --noEmit` and `npx vitest run <your test path>`.
3. **Never edit files you do not own** (§3). If you need a change there, stop and report it in your final message as a `LEAD REQUEST`.
4. **Never create or edit a Drizzle migration** (`drizzle/**`). The schema for all of V1 already exists. If a column is genuinely missing, report a `LEAD REQUEST`; do not work around it with JSON blobs.
5. **The documentation in `docs/` is the source of truth.** Do not invent product behaviour, do not reopen owner decisions, do not implement anything marked out of V1 scope.
6. **No secrets in code, tests, docs, or client bundles.**

---

## 2. Architecture you must follow

### Module layout

```text
src/modules/<module>/
  domain/        pure logic, no React, no Next, no persistence
  data/          Drizzle repositories, take a DbExecutor as first argument
  application/   use cases, take OrgContext as first argument
  validation/    Zod schemas (server-authoritative)
  ui/            React components
  index.ts       application, domain and validation exports
  ui.ts          component exports
```

Cross-module imports go through `@/modules/<name>` (the barrel). Importing another
module's `data/` or `application/` file directly is blocked by ESLint.

Components are exported from `ui.ts`, never from `index.ts`. A barrel that
re-exports a component drags React and `server-only` into every consumer,
including plain Node unit tests; ESLint blocks it. Import a panel as
`@/modules/<name>/ui`.

An embeddable panel takes plain values — usually just `{ projectId }` — and
resolves its own context with `withOrgContext`. Never accept an `OrgContext` as
a prop: it is bound to a transaction that has already closed by the time the
component renders.

### Authorization

Every use case starts with a permission assertion:

```ts
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function createThing(context: OrgContext, input: CreateThingInput) {
  assertPermission(context, PERMISSIONS.THINGS_CREATE);
  // ...
}
```

Never branch on a role name. Authorize by permission key only. RLS is
defence-in-depth, not your primary check.

### Tenancy

`OrgContext.db` is a transaction already bound to the acting user, so RLS
applies. Repositories must always filter by `context.organizationId` as well —
belt and braces. Never open your own database connection, never use
`getAdminDb()`.

### Money and dates

- Money is always `MoneyValue { amount: string; currency: string }` from
  `@/shared/money`. Arithmetic goes through those helpers. A JS `number` must
  never touch a monetary value.
- Business dates are `YYYY-MM-DD` strings (`BusinessDate`); timestamps are
  `Instant`. Use `@/shared/dates`.
- Display money with `<MoneyText>` from `@/components/patterns/money-text`, and
  capture it with `<MoneyInput>`.

### Audit

Anything that changes money, access, or an approved commercial artifact calls
`recordAuditEvent` from `@/shared/audit`.

The `action` must come from the `AUDIT_ACTIONS` catalog in that module. It is a
closed union, so an unregistered string will not compile — add yours to the
catalog rather than passing a literal, or the activity log has no label to show
the owner for it.

### Server actions

Validate with Zod inside the action, resolve the context with `withOrgContext`
from `@/shared/auth/session`, and return a typed form state. Never trust a
client-supplied `organizationId`.

---

## 3. File ownership

### You may never edit (Lead-owned)

- `drizzle/**` — schema, migrations, seeds
- `src/shared/**` — money, dates, permissions, auth, db, i18n config, ports, errors, audit
- `src/components/ui/**` — the primitive library
- `src/components/patterns/money-text.tsx`, `money-input.tsx`, `coverage-disclosure.tsx`
- `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/(app)/layout.tsx`
- `src/app/globals.css`, `src/proxy.ts`
- `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `drizzle.config.ts`
- `src/locales/{en,he-IL}/{common,nav,errors,validation,financial,status,organization}.json`
- `src/modules/financials/domain/types.ts`

Need something changed there? Report a `LEAD REQUEST` with the exact file, the
change, and why. Do not edit it and do not duplicate it locally.

### You own (see your brief for the exact list)

Your module directory, your route directory, your locale namespace files
(both `en` and `he-IL`), and your tests.

---

## 4. Product rules that show up in every screen

1. **Progressive Complexity.** Simple by default. Nothing you build may force
   setup, emit a warning about unconfigured optional data, or block an
   unrelated flow. Call `noteModuleUsage` (from `@/modules/tenancy`) the first
   time your module creates something real, so it surfaces in navigation by
   itself.
2. **Financial honesty.** Any derived figure states what fed it. Use
   `<CoverageDisclosure>` and the `financial.coverage.*` messages. Never present
   a partial number as complete, and never label anything generic "Revenue".
3. **Contextual required fields.** Only mark a field required if doc 48 §4 says
   it is. A project needs a name. An expense needs an amount and a currency.
   That is it.
4. **No punishment empty states.** An empty list explains what the area is for
   and offers one action. It never reads as an error or a missing-setup nag.
5. **Status is text plus icon**, never colour alone. Use `<StatusBadge>`.
6. **Progressive disclosure**: basic fields, then "More details", then
   "Advanced".
7. **Hebrew first, English canonical.** Message keys are English; `he-IL` must
   be complete and read natively, not like a translation. Use the doc 48 §3
   glossary — for example `WorkPackage` is never shown in Hebrew UI; it is
   `תחום עבודה`.
8. **RTL and mobile are first-class.** Use logical CSS properties (`ms-`, `me-`,
   `ps-`, `pe-`, `start-`, `end-`) — never `ml-`, `pl-`, `left-`. Test both
   directions mentally on every layout. Mobile is a real surface, not a
   squeezed desktop table.

---

## 5. Definition of done for your workstream

- `npx tsc --noEmit` is clean.
- `npx eslint <your files>` is clean.
- Unit tests cover your domain logic, especially every financial calculation.
- At least one integration test per module covering tenant isolation: a user in
  organization A cannot read or write organization B's rows.
- Both `en` and `he-IL` message files are complete for your namespace. No
  hard-coded user-facing strings anywhere.
- Every screen you build works at 375px wide and in RTL.
- Your final message lists: what you built, files you created, any
  `LEAD REQUEST` items, and anything you deliberately left out.

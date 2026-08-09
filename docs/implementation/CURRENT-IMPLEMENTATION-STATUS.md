# ProjectFlow — Current Implementation Status

**Updated:** 2026-08-09 · **Phase:** C complete — V1 ready for owner review · **No git repository yet**

---

## 1. Where the project stands

Phase A (Foundation), all eight Phase B workstreams, and Phase C (integration,
independent review, fixes, closure) are complete.

Two independent reviews were run against the integrated build — one on security,
data and financial integrity, one on product, UX, Hebrew/RTL, mobile and
accessibility. Together they raised 20 and 60+ findings. Every BLOCKER, HIGH and
MEDIUM finding has been reproduced with a failing test, fixed, and covered by a
regression test. No finding was accepted on description alone; the fixers were
required to report anything they could not reproduce as a false positive, and
they reported none among the financial findings.

### Closure gate — passing (verified by the Lead, not self-reported)

| Check | Result |
|-------|--------|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | succeeds |
| `npx vitest run` | 311 passed across 64 files |
| `npx playwright test` | 26 passed across 6 projects, including WCAG scans |
| Migration clean-start | every suite applies all six migrations to an empty database |

---

## 2. Phase A — delivered

### Project setup
Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind 4, ESLint with
architectural rules, Vitest (unit/ui/integration projects), Playwright,
Drizzle Kit, `.gitignore`, `.env.example`.

### Database
Full V1 Drizzle schema — identity, tenancy, RBAC, audit, clients, vendors,
projects, contracts, changes, documents, expenses, workforce, billing, tax.
Three migrations: `0000_foundation`, `0001_rls_security`, `0002_tax_rule_uniqueness`.
RLS enabled and forced on every tenant-owned table, with `app.current_user_id()`
and `app.is_org_member()` helpers and an append-only `audit_events` table.
PGlite integration harness applies real migrations and asserts isolation.

### Shared primitives
`money` (decimal.js, `numeric(18,6)`, locale formatting, bidi isolation),
`dates` (`BusinessDate` vs `Instant`), `permissions` (catalog, role templates,
`assertPermission`), `errors`, `audit`, `env` (server/public split with
`server-only` guards), `db` (RLS-bound `withUserContext`), and the
`EmailPort` / `StoragePort` / `JobPort` boundaries.

### Identity, tenancy, authorization
Supabase Auth for identity only; ProjectFlow database for authorization.
Sign in, sign up, password reset, email callback, onboarding (business name and
country — nothing else), organization creation in one transaction with role
provisioning and default cost categories, invitations with hashed tokens and
privilege-escalation guards, adaptive module visibility.

### Design system and i18n
Deep Teal tokens in three layers (primitive → semantic → component), Radix-based
primitive library, `next-intl` with English canonical keys and a complete Hebrew
first UI, RTL by logical properties, locale-aware money and date formatting.

### App shell
Desktop sidebar that sits on the inline-start edge in both directions, mobile
bottom navigation capped at four destinations plus More, floating quick-create,
organization switcher, language switcher, skip link.

---

## 3. Phase B — all eight landed

| # | Workstream | Owns |
|---|------------|------|
| 1 | Projects and Clients | `modules/projects`, `modules/clients`, routes, `projects`/`clients` messages |
| 2 | Expenses, costs, overhead | `modules/expenses`, routes, `expenses` messages |
| 3 | Commercial: changes, quotes, approvals, change orders | `modules/commercial`, routes, `changes` messages |
| 4 | Workforce and time | `modules/workforce`, routes, `workforce` messages |
| 5 | Billing and payments | `modules/billing`, routes, `billing` messages |
| 6 | Vendors and documents | `modules/vendors`, `modules/documents`, routes, messages |
| 7 | Financial engine and dashboards | `modules/financials` (except the Lead-owned contract), dashboard, project financials |
| 8 | Settings, tax, organization administration | `modules/tax`, settings routes, `tax`/`settings` messages |

Shared contracts they build against: `docs/implementation/AGENT-CONTRACTS.md`
and `src/modules/financials/domain/types.ts`.

---

## 4. Phase C — integration in progress

### Defect found and fixed: founding an organization was impossible

Five workstreams independently reported that the shared two-tenant fixture
failed and worked around it by provisioning tenants as the service role. The
workaround hid a real defect rather than a test problem.

Postgres applies **SELECT** policies to the rows returned by
`INSERT … RETURNING`. `organizations_member_select` requires an active
membership, which by definition cannot exist at the moment the organization row
is created, so every real sign-up would have failed at the first statement of
`createOrganization`.

Fixed by removing the `RETURNING` clause from the organization insert and
reading the row back after the founder's membership exists, rather than
loosening the policy to expose member-less organizations to any authenticated
user. `tests/integration/tenancy/founding.test.ts` now exercises the whole
founding path as a real authenticated user and asserts no member-less
organization is ever left behind.

### Integration work completed

- **Project workspace tabs wired.** Financials, Expenses, Changes, Billing, Time
  and Documents now render the real panels behind `Suspense`, replacing six
  placeholders. Tabs follow Progressive Complexity: a tab appears only when the
  module is in use *and* the viewer holds the permission, and a deep link to a
  hidden tab falls back to the first available one instead of an empty panel.
- **Panel signatures normalised** to `{ projectId }`. `ProjectChangesPanel`
  previously accepted an `OrgContext`, which would have handed it a transaction
  that had already closed; it now resolves its own.
- **Module barrels split.** UI moved from `index.ts` to `<module>/ui.ts` for the
  six modules that exported components, so application and domain imports no
  longer drag React and `server-only` into Node test runs. An ESLint rule on
  `src/modules/*/index.ts` keeps it that way.
- **Audit actions consolidated** into one typed catalog in `@/shared/audit`.
  `AuditEventInput.action` is now the union of catalog values, so an
  unregistered action fails to compile and the activity log always has a label
  to render.
- **Module visibility folded into the cached shell context**, removing a second
  per-request transaction and letting pages gate on the same resolution the
  sidebar uses.
- **Invitations can now actually be accepted.** Invite links pointed at
  `/accept-invite`, a route nobody owned, so every invitation dead-ended at a
  404. The route now previews the invitation by token (naming the business
  instead of asking someone to join "an organization"), redeems it only on an
  explicit submit so a link scanner or prefetch cannot spend it, and carries the
  destination through sign-in via a `next` parameter restricted to same-site
  paths. An unknown, spent and expired token are deliberately indistinguishable.
  Eight integration tests cover redemption, email mismatch, reuse, expiry,
  revocation and the guarantee that the plaintext token is never stored.
- **Tenancy use cases moved out of a route folder.** `updateOrganizationProfile`,
  `listOrganizationMembers` and `removeMemberAccess` lived in
  `settings/_lib/`, which put tenancy logic outside the module that owns it and
  left an integration test importing across an app route path. They now live in
  `modules/tenancy` and are exported from its barrel.

---

## 5. Closure phase — reviews and fixes

### End-to-end harness

Authenticated end-to-end coverage runs with no cloud account and no Docker.
PGlite is served over the PostgreSQL wire protocol so the production Next.js
build connects to it as an ordinary database, and a local stub implements the
subset of the Supabase auth API the app actually uses. The harness applies the
committed migrations to an empty database on every boot, so a clean-start
migration check happens as a side effect of running the suite. Twenty-six specs
cover the Hebrew RTL shell, the project workspace against seeded money, project
and expense creation, tenant isolation, worker permission gating, sign-out,
mobile bottom navigation, and automated WCAG scans.

The end-to-end run found what static review could not: the authenticated shell
crashed in a production build because Lucide icon components were passed from a
server component into client navigation. Every signed-in page was broken in
production while development looked healthy.

### Financial integrity — what was actually wrong

- **Voiding a finalized expense subtracted its cost twice.** The void wrote a
  negative reversal row *and* flagged the original, while every aggregation
  already filtered the original out. A ₪1,000 expense moved the project from
  ₪1,000 of cost to −₪1,000. The reversal row is gone; `audit_events` already
  carried the history it was there to provide.
- **Payments on a voided invoice still counted as collected**, and the
  documented correction flow — issue a credit note *and* void the original —
  double-counted the reduction, so it produced a wrong number every single time
  it was used. Adjustments now issue the credit note only, and a record with
  recorded payments cannot be voided until those payments are.
- **One row in a foreign currency took down every financial page** and could not
  be undone through the UI. Currency is now validated against the project at
  write time, and the read path excludes a mismatched row and *tells the user it
  did* rather than throwing.
- **Sums that ran in SQL bypassed the money guard entirely.** The dashboard
  added contract values across currencies while subtracting a currency-filtered
  cost — two different bases in one profit figure. Every SQL sum is now
  constrained to one currency, with the remainder disclosed.
- **Unpriced labour was reported as complete.** `entriesMissingCost` was
  tracked and then dropped; it now reaches the user as partial coverage.
- Expense net was set to gross whenever only tax was supplied, an expense could
  be counted twice via its own allocation line, and editing an expense rewrote
  its recorded creator.

### Security

- **Privilege escalation closed.** The invitation guard blocked the literal
  role name `owner` instead of comparing permissions, so a manager holding
  `invitations.manage` could invite an account they controlled into `finance`
  and acquire profit, billing, tax and audit access. The guard now rejects any
  target role whose permissions are not a subset of the inviter's, which covers
  custom roles too. The regression test performs the escalation end to end.
- Invitation redemption is transactional and idempotent, so an interrupted
  accept no longer strands a member with no role and an unusable invitation.
- RLS hardened on the authorization tables, and a parameter-shadowing bug in a
  policy helper (`permission_key = permission_key`, always true) fixed.
- Client-supplied foreign keys are validated against the caller's organization.

Tenant isolation was reviewed and found genuinely sound: all 47
`organization_id`-bearing tables carry forced RLS, membership is re-verified
server-side on every request, and no cross-tenant read path was found.

### Product, Hebrew and mobile

Raw translation keys were rendering in the workforce forms; the project Overview
showed a financial card of hard-coded dashes with a disclosure claiming nothing
was included; creating a change request from the global entry point required
typing a project UUID by hand; and every irreversible money action fired on one
click with its result discarded, so a failed void looked identical to a
successful one. All are fixed, the last through one shared confirmation
component that names the specific record and surfaces the outcome.

Hebrew register was unified to the neutral infinitive (three screens addressed
the user in masculine imperative), and calques were replaced with the terms the
trade actually uses — `סעיף עלות` rather than `משפחת עלות`, `סכום חוזה` rather
than `ערך חוזה`. Five data tables gained real mobile card layouts. A test now
fails the build if any `var(--pf-*)` reference is not declared in `globals.css`.

### Two integration defects the reviews did not catch

- **New migrations would not have run in production.** The deployment runner
  reads `meta/_journal.json`, which listed only the first three migrations,
  while both test harnesses read the `.sql` files directly off disk. Three
  migrations — a unique index, a rate-overlap trigger and the RLS hardening —
  passed every test and would have silently never reached the database. The
  journal is reconciled and a test now enforces file/journal parity.
- **The end-to-end harness was quietly skipping statements** it judged
  unsupported. It matched nothing today, but it would have let the suite pass
  against a schema production never has. Removed; the harness now runs exactly
  what deploys.

---

## 6. Open items for the owner

Nothing blocking. No paid infrastructure has been provisioned; no production
database, Vercel project, or real email has been created. `.env.example`
documents everything a local environment needs.

Two controls live in the Supabase console rather than this repository and must
be confirmed there before real customer data is stored: that the documents
storage bucket is private (the application always requests signed URLs, but a
public bucket would make every code-level control moot), and the auth settings
for email confirmation, password policy and sign-in rate limiting.

Drizzle snapshot files exist only up to `0002`, because the later migrations
were written by hand rather than generated. They apply correctly; the caveat is
that the next `drizzle-kit generate` will diff against the `0002` snapshot, so
review its output before trusting it.

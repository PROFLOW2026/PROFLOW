# ProjectFlow

Project, cost and billing management for contractors and small construction
businesses. Hebrew-first UI with full RTL, English canonical message keys,
multi-tenant by design.

The product specification lives in [`docs/`](docs/) and is the source of truth.
Implementation status is tracked in
[`docs/implementation/CURRENT-IMPLEMENTATION-STATUS.md`](docs/implementation/CURRENT-IMPLEMENTATION-STATUS.md).

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Backend | Modular monolith inside the Next.js app |
| Database | PostgreSQL (Supabase) with Drizzle ORM and row-level security |
| Identity | Supabase Auth — identity only; authorization lives in the ProjectFlow database |
| Storage | Supabase Storage behind a `StoragePort` |
| Email | Resend behind an `EmailPort`, with a working no-op fallback |
| UI | Tailwind CSS 4, Deep Teal design tokens, Radix primitives, TanStack Table |
| i18n | `next-intl`, English canonical, Hebrew first complete UI |
| Validation | Zod, server-authoritative |
| Testing | Vitest (unit, UI, integration on PGlite), Playwright, axe |

---

## Getting started

Requires Node.js 20.11 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the values you have
npm run dev
```

The app boots without any credentials and shows a setup screen explaining what
is missing, so a fresh clone never crashes on a blank environment.

### Environment

`.env.example` documents every variable and separates client-safe values from
server-only secrets. Nothing prefixed `NEXT_PUBLIC_` may ever hold a secret;
`src/shared/env/server.ts` is guarded by `server-only` so a secret cannot be
imported into a client bundle by accident.

### Database

```bash
npm run db:generate   # generate a migration from the Drizzle schema
npm run db:migrate    # apply migrations
npm run db:seed       # permissions catalog and country-pack tax rules
npm run seed:demo     # local demo organization (never run against production)
```

Migrations are version-controlled SQL. `drizzle-kit push` is not used — schema
changes go through a generated file that is inspected before it is applied, and
row-level security policies are hand-written in `0001_rls_security.sql`.

---

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the architectural boundary rules |
| `npm run test` | All Vitest projects |
| `npm run test:unit` | Domain and shared-primitive tests |
| `npm run test:integration` | Real migrations and RLS against PGlite — no Docker needed |
| `npm run test:e2e` | Playwright, desktop and mobile, Hebrew |
| `npm run verify` | typecheck, lint and tests together |

---

## Architecture

```text
src/
  app/[locale]/        routes; (auth) is public, (app) is the authenticated shell
  components/ui/       design-system primitives
  components/patterns/ money, coverage disclosure, and other product patterns
  components/shell/    sidebar, mobile navigation, quick create
  modules/<name>/      domain / data / application / validation, exposed via index.ts
  shared/              money, dates, permissions, auth, db, i18n, ports, errors, audit
  locales/<locale>/    one JSON file per namespace
drizzle/               schema, migrations, seeds
tests/                 unit, ui, integration, e2e
```

A module's `index.ts` is its only public surface; cross-module imports into
`data/` or `application/` are blocked by lint. The domain layer is
framework-free: no React, no Next.js, no persistence.

### Rules worth knowing before you write code

- **Money is never a JS number.** Amounts are decimal strings carrying an ISO
  currency, stored in `numeric(18,6)`, computed with decimal.js.
- **Authorize by permission key, never by role name.** A lint rule enforces it.
  Row-level security is defence-in-depth, not the primary check.
- **Tenant isolation is checked twice**: in the application layer against
  `OrgContext.organizationId`, and again by RLS.
- **Financial figures disclose their coverage.** A number derived from partial
  data says so; nothing is presented as complete when it is not.
- **Hebrew is a first-class UI, not a translation layer.** Use logical CSS
  properties everywhere so a single layout serves both directions.

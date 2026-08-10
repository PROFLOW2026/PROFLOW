# SCHEMA_REQUEST — Banking / Reconciliation V1 (Agent 3)

Lead designs additive `0020+` after overnight reports. No migration authored here.

## TABLE `bank_accounts`

| Column | Type | Notes |
|--------|------|--------|
| id | uuid PK | |
| organization_id | uuid NOT NULL | FK → organizations, same-org RLS |
| name | text NOT NULL | |
| currency | char(3) NOT NULL | |
| account_mask | text NULL | display only; not feed credentials |
| status | text NOT NULL | CHECK `active` \| `archived` |
| created_at | timestamptz NOT NULL | |
| updated_at | timestamptz NOT NULL | |

**Why:** Org-scoped bank account entity for import + reconciliation workspace.

**Indexes:** `(organization_id)`, `(organization_id, status)`

**RLS:** org members with future `banking.read` / `banking.manage`.

---

## TABLE `bank_import_batches`

| Column | Type | Notes |
|--------|------|--------|
| id | uuid PK | |
| organization_id | uuid NOT NULL | FK + same-org |
| bank_account_id | uuid NOT NULL | FK → bank_accounts, same org |
| source | text NOT NULL | CHECK `csv_import` \| `xlsx_import` (not `live_feed` for V1 rows) |
| file_name | text NULL | |
| row_count | int NOT NULL | |
| imported_count | int NOT NULL | |
| duplicate_count | int NOT NULL | |
| created_at | timestamptz NOT NULL | |

**Why:** Audit trail for statement imports; supports re-import duplicate detection.

**Indexes:** `(organization_id, bank_account_id, created_at DESC)`

---

## TABLE `bank_transactions`

| Column | Type | Notes |
|--------|------|--------|
| id | uuid PK | |
| organization_id | uuid NOT NULL | FK + same-org |
| bank_account_id | uuid NOT NULL | FK → bank_accounts, same org |
| date | date NOT NULL | booking / statement date |
| value_date | date NULL | |
| description | text NOT NULL | |
| amount | numeric NOT NULL | absolute; CHECK > 0 |
| currency | char(3) NOT NULL | must match account currency in V1 |
| direction | text NOT NULL | CHECK `credit` \| `debit` |
| reference | text NULL | |
| source | text NOT NULL | CHECK `csv_import` \| `xlsx_import` \| `live_feed` |
| fingerprint | text NOT NULL | duplicate key within account |
| match_status | text NOT NULL | CHECK `unmatched` \| `partially_matched` \| `matched` \| `ignored` |
| import_batch_id | uuid NULL | FK → bank_import_batches |
| created_at | timestamptz NOT NULL | |
| updated_at | timestamptz NOT NULL | |

**Why:** First-class bank lines for reconciliation. `live_feed` source reserved for future provider; V1 writes only import sources.

**Indexes / uniqueness:**
- UNIQUE `(organization_id, bank_account_id, fingerprint)` — hard duplicate block
- `(organization_id, bank_account_id, match_status)`
- `(organization_id, date DESC)`

**FK integrity:** bank_account.organization_id = bank_transactions.organization_id (enforce in app + optional trigger).

---

## TABLE `bank_match_suggestions`

| Column | Type | Notes |
|--------|------|--------|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| bank_transaction_id | uuid NOT NULL | FK → bank_transactions |
| target_kind | text NOT NULL | CHECK `customer_payment` \| `billing_record` \| `vendor_payment` \| `vendor_bill` |
| target_id | uuid NOT NULL | polymorphic ref (no cross-FK in V1) |
| suggested_amount | numeric NOT NULL | |
| currency | char(3) NOT NULL | |
| score | int NOT NULL | 0–100 |
| rationale | text NOT NULL | |
| created_at | timestamptz NOT NULL | |

**Why:** Ranked suggestions only — never auto-applied.

**Indexes:** `(bank_transaction_id, score DESC)`

---

## TABLE `bank_match_decisions`

| Column | Type | Notes |
|--------|------|--------|
| id | uuid PK | |
| organization_id | uuid NOT NULL | |
| bank_transaction_id | uuid NOT NULL | FK → bank_transactions |
| decision | text NOT NULL | CHECK `approve` \| `change` \| `ignore` |
| target_kind | text NULL | required unless ignore |
| target_id | uuid NULL | |
| applied_amount | numeric NULL | |
| currency | char(3) NULL | |
| notes | text NULL | |
| mutates_financials | boolean NOT NULL DEFAULT false | CHECK = false for V1 |
| creates_project_cost | boolean NOT NULL DEFAULT false | CHECK = false always |
| created_at | timestamptz NOT NULL | |

**Why:** Human gate. Decision ≠ payment/bill/expense write. Matching vendor payment for already-recognized bill remains cash reconciliation (`creates_project_cost` always false).

**CHECK:** `(decision = 'ignore' AND target_id IS NULL) OR (decision IN ('approve','change') AND target_kind IS NOT NULL AND target_id IS NOT NULL)`

---

## Future (do not invent live API claims)

- Optional `bank_feed_connections` (org credentials vault ref, provider id, status) — **out of V1 schema until product + security review**.
- Extension interface already exists in `domain/feed-provider.ts` (`BankFeedProvider`).

## Permissions required (catalog — Lead)

- `banking.read` — view accounts, transactions, suggestions
- `banking.manage` — create accounts, import statements, decide matches

## Translations required (i18n config — Lead)

- Namespace `banking` → `src/locales/{en,he-IL}/banking.json` (files already added)

## Persistence limitation (overnight)

`0020` defines durable banking tables. Application paths use Drizzle when
`BANKING_PERSISTENCE_READY` is true (`src/modules/banking/domain/persistence.ts`).

While the flag is **false** (default until owner applies migrate):
- Writes fail closed with `banking.errors.schemaPending`
- `banking-test-double.store.ts` / `createBankingTestDoubleRepository()` are **TEST DOUBLE ONLY**

### Owner flip after migrate

1. Apply `0020_overnight_foundations` to the target database.
2. Confirm tables exist: `bank_accounts`, `bank_import_batches`, `bank_transactions`,
   `bank_match_suggestions`, `bank_match_decisions`.
3. Set `BANKING_PERSISTENCE_READY = true` in `src/modules/banking/domain/persistence.ts`.
4. Smoke CSV/XLSX import + match decision (no live feed required).

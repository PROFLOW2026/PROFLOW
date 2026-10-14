import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Journal row shape from `drizzle/migrations/meta/_journal.json`. */
export interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}

export interface AppliedMigrationRow {
  readonly hash: string;
  readonly created_at: number | string;
}

export interface MigrationApprovalGateFailure {
  readonly ok: false;
  readonly pendingTags: readonly string[];
  readonly message: string;
}

export interface MigrationApprovalGateSuccess {
  readonly ok: true;
  readonly pendingTags: readonly string[];
}

export type MigrationApprovalGateResult =
  | MigrationApprovalGateSuccess
  | MigrationApprovalGateFailure;

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

/** Same rule as Drizzle `pg-core/dialect.js` migrate(): folderMillis > last applied created_at. */
export function listPendingJournalTags(
  entries: readonly JournalEntry[],
  lastAppliedCreatedAt: number | null,
): string[] {
  if (lastAppliedCreatedAt === null) {
    return entries.map((entry) => entry.tag);
  }
  return entries.filter((entry) => entry.when > lastAppliedCreatedAt).map((entry) => entry.tag);
}

export function computeMigrationFileHash(sqlContent: string): string {
  return createHash('sha256').update(sqlContent).digest('hex');
}

export function loadJournalEntries(): JournalEntry[] {
  const journalPath = path.join(MIGRATIONS_DIR, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

export function buildJournalTagHashMap(entries: readonly JournalEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const sqlPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    const sql = readFileSync(sqlPath, 'utf8');
    map.set(entry.tag, computeMigrationFileHash(sql));
  }
  return map;
}

export function maxAppliedCreatedAt(rows: readonly AppliedMigrationRow[]): number | null {
  if (rows.length === 0) {
    return null;
  }
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const value = Number(row.created_at);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return max === Number.NEGATIVE_INFINITY ? null : max;
}

/**
 * Journal entries whose `when` is older than the latest applied row but whose hash
 * never landed in `drizzle.__drizzle_migrations` (Drizzle would skip them forever).
 *
 * A ledger row whose `created_at` equals the journal `when` counts as applied even
 * when the stored hash differs from the current file (post-apply SQL edits in-repo).
 */
export function findOutOfOrderSkippedTags(
  entries: readonly JournalEntry[],
  appliedRows: readonly AppliedMigrationRow[],
  tagToHash: ReadonlyMap<string, string>,
): string[] {
  const lastCreatedAt = maxAppliedCreatedAt(appliedRows);
  if (lastCreatedAt === null) {
    return [];
  }
  const appliedHashes = new Set(appliedRows.map((row) => row.hash));
  const appliedWhenMillis = new Set(
    appliedRows.map((row) => Number(row.created_at)).filter((value) => Number.isFinite(value)),
  );
  const skipped: string[] = [];
  for (const entry of entries) {
    if (entry.when >= lastCreatedAt) {
      continue;
    }
    const hash = tagToHash.get(entry.tag);
    if (!hash) {
      skipped.push(entry.tag);
      continue;
    }
    if (appliedHashes.has(hash)) {
      continue;
    }
    if (appliedWhenMillis.has(entry.when)) {
      continue;
    }
    skipped.push(entry.tag);
  }
  return skipped;
}

export function parseApprovedTags(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** `--owner-approved=<approval-date>` from argv (Gate B production safeguard). */
export function parseOwnerApprovedFlag(argv: readonly string[]): string | undefined {
  for (const arg of argv) {
    if (arg.startsWith('--owner-approved=')) {
      const value = arg.slice('--owner-approved='.length).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function evaluateMigrationApprovalGate(params: {
  journalEntries: readonly JournalEntry[];
  appliedRows: readonly AppliedMigrationRow[];
  tagToHash: ReadonlyMap<string, string>;
  approvedTagsRaw: string | undefined;
  appEnv: string | undefined;
  ownerApprovedFlag: string | undefined;
}): MigrationApprovalGateResult {
  const lastCreatedAt = maxAppliedCreatedAt(params.appliedRows);
  const pendingTags = listPendingJournalTags(params.journalEntries, lastCreatedAt);
  const skipped = findOutOfOrderSkippedTags(
    params.journalEntries,
    params.appliedRows,
    params.tagToHash,
  );

  if (skipped.length > 0) {
    return {
      ok: false,
      pendingTags,
      message:
        `Migration journal order gap: these tags appear before the latest applied created_at ` +
        `but are missing from drizzle.__drizzle_migrations: ${skipped.join(', ')}. ` +
        `Resolve manually under Gate B before running db:migrate.`,
    };
  }

  const approvedTags = parseApprovedTags(params.approvedTagsRaw);
  if (params.approvedTagsRaw === undefined) {
    return {
      ok: false,
      pendingTags,
      message:
        `MIGRATION_APPROVED_TAGS is required. Pending journal migrations: ` +
        `${pendingTags.length > 0 ? pendingTags.join(', ') : '(none)'}. ` +
        `Set MIGRATION_APPROVED_TAGS to that exact comma-separated list before db:migrate.`,
    };
  }

  if (!tagsEqual(pendingTags, approvedTags)) {
    return {
      ok: false,
      pendingTags,
      message:
        `MIGRATION_APPROVED_TAGS must match pending migrations exactly (journal order). ` +
        `Pending: [${pendingTags.join(', ')}]. Approved: [${approvedTags.join(', ')}].`,
    };
  }

  if (params.appEnv === 'production' && !params.ownerApprovedFlag) {
    return {
      ok: false,
      pendingTags,
      message:
        'APP_ENV=production requires --owner-approved=<date> on the db:migrate command (Gate B).',
    };
  }

  return { ok: true, pendingTags };
}

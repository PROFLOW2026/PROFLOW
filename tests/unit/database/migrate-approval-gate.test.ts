import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluateMigrationApprovalGate,
  findOutOfOrderSkippedTags,
  listPendingJournalTags,
  parseApprovedTags,
  parseOwnerApprovedFlag,
  type AppliedMigrationRow,
  type JournalEntry,
} from '../../../drizzle/scripts/migration-approval-gate';

const sampleJournal: JournalEntry[] = [
  { idx: 175, when: 1000, tag: '0177_tasks_uwm_scale_indexes' },
  { idx: 176, when: 2000, tag: '0178_contractor_username_org_update' },
  { idx: 177, when: 3000, tag: '0179_connected_projects' },
];

function hashFor(tag: string): string {
  return createHash('sha256').update(tag).digest('hex');
}

describe('migration approval gate (§9.4)', () => {
  it('lists pending tags when journal when exceeds last applied created_at', () => {
    expect(listPendingJournalTags(sampleJournal, 1500)).toEqual([
      '0178_contractor_username_org_update',
      '0179_connected_projects',
    ]);
  });

  it('rejects when approved list does not exactly match pending (partial approval)', () => {
    const tagToHash = new Map(sampleJournal.map((entry) => [entry.tag, hashFor(entry.tag)]));
    const applied: AppliedMigrationRow[] = [{ hash: hashFor('0177_tasks_uwm_scale_indexes'), created_at: 1000 }];

    const result = evaluateMigrationApprovalGate({
      journalEntries: sampleJournal,
      appliedRows: applied,
      tagToHash,
      approvedTagsRaw: '0178_contractor_username_org_update',
      appEnv: 'local',
      ownerApprovedFlag: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.pendingTags).toEqual([
        '0178_contractor_username_org_update',
        '0179_connected_projects',
      ]);
      expect(result.message).toContain('must match pending migrations exactly');
    }
  });

  it('allows migrate when approved list matches all pending tags', () => {
    const tagToHash = new Map(sampleJournal.map((entry) => [entry.tag, hashFor(entry.tag)]));
    const applied: AppliedMigrationRow[] = [{ hash: hashFor('0177_tasks_uwm_scale_indexes'), created_at: 1000 }];

    const result = evaluateMigrationApprovalGate({
      journalEntries: sampleJournal,
      appliedRows: applied,
      tagToHash,
      approvedTagsRaw:
        '0178_contractor_username_org_update,0179_connected_projects',
      appEnv: 'local',
      ownerApprovedFlag: undefined,
    });

    expect(result).toEqual({
      ok: true,
      pendingTags: ['0178_contractor_username_org_update', '0179_connected_projects'],
    });
  });

  it('requires --owner-approved in production', () => {
    const tagToHash = new Map<string, string>();
    const result = evaluateMigrationApprovalGate({
      journalEntries: [],
      appliedRows: [],
      tagToHash,
      approvedTagsRaw: '',
      appEnv: 'production',
      ownerApprovedFlag: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('--owner-approved');
    }
  });

  it('does not flag a tag when ledger created_at matches journal when (hash drift)', () => {
    const tagToHash = new Map(sampleJournal.map((entry) => [entry.tag, hashFor(entry.tag)]));
    const applied: AppliedMigrationRow[] = [
      { hash: 'stale-hash-not-in-repo', created_at: 2000 },
      { hash: hashFor('0179_connected_projects'), created_at: 5000 },
    ];

    const skipped = findOutOfOrderSkippedTags(sampleJournal, applied, tagToHash);
    expect(skipped).toEqual(['0177_tasks_uwm_scale_indexes']);
  });

  it('detects journal rows skipped because created_at ordering diverged from when', () => {
    const tagToHash = new Map(sampleJournal.map((entry) => [entry.tag, hashFor(entry.tag)]));
    const applied: AppliedMigrationRow[] = [
      { hash: hashFor('0177_tasks_uwm_scale_indexes'), created_at: 1000 },
      { hash: hashFor('0179_connected_projects'), created_at: 5000 },
    ];

    const skipped = findOutOfOrderSkippedTags(sampleJournal, applied, tagToHash);
    expect(skipped).toEqual(['0178_contractor_username_org_update']);

    const gate = evaluateMigrationApprovalGate({
      journalEntries: sampleJournal,
      appliedRows: applied,
      tagToHash,
      approvedTagsRaw: '',
      appEnv: 'local',
      ownerApprovedFlag: undefined,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.message).toContain('0178_contractor_username_org_update');
    }
  });

  it('parseApprovedTags and parseOwnerApprovedFlag', () => {
    expect(parseApprovedTags('a,b, c')).toEqual(['a', 'b', 'c']);
    expect(parseApprovedTags('')).toEqual([]);
    expect(parseOwnerApprovedFlag(['node', 'migrate.ts', '--owner-approved=2026-10-14'])).toBe(
      '2026-10-14',
    );
  });

  it('does not invoke drizzle migrate when gate fails (contract)', () => {
    const migrateSpy = vi.fn();
    const tagToHash = new Map(sampleJournal.map((entry) => [entry.tag, hashFor(entry.tag)]));
    const gate = evaluateMigrationApprovalGate({
      journalEntries: sampleJournal,
      appliedRows: [{ hash: hashFor('0177_tasks_uwm_scale_indexes'), created_at: 1000 }],
      tagToHash,
      approvedTagsRaw: '0178_contractor_username_org_update',
      appEnv: 'local',
      ownerApprovedFlag: undefined,
    });
    if (gate.ok) {
      migrateSpy();
    }
    expect(migrateSpy).not.toHaveBeenCalled();
  });
});

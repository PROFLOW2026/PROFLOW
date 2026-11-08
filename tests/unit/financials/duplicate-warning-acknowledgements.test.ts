import { describe, expect, it } from 'vitest';
import {
  resumeWhenDuplicateWarningsClear,
  type DuplicateWarningRepository,
} from '@/modules/duplicate-warnings/domain/gate';
import {
  duplicateWarningSnapshotHash,
  resolveDuplicateWarningStatuses,
  type DuplicateWarningSnapshot,
  type DuplicateWarningType,
  type StoredDuplicateWarning,
} from '@/modules/duplicate-warnings/domain/snapshot';

const baseSnapshot: DuplicateWarningSnapshot = {
  amount: '100.00',
  vendorId: 'vendor-1',
  reference: 'INV-9',
  projectId: 'project-1',
  date: '2026-11-01',
};

function memoryRepository(seed: StoredDuplicateWarning[] = []): {
  repo: DuplicateWarningRepository;
  rows: StoredDuplicateWarning[];
} {
  const rows = seed.map((row) => ({ ...row }));
  const repo: DuplicateWarningRepository = {
    async listForCase() {
      return rows;
    },
    async upsertPending(input) {
      const existing = rows.find(
        (row) => row.warningType === input.warningType && row.snapshotHash === input.snapshotHash,
      );
      if (existing) return { id: existing.id, status: existing.status };
      const created: StoredDuplicateWarning = {
        id: `pending-${input.warningType}`,
        warningType: input.warningType,
        snapshotHash: input.snapshotHash,
        status: 'pending',
      };
      rows.push(created);
      return { id: created.id, status: 'pending' };
    },
    async acknowledge(input) {
      const existing = rows.find(
        (row) => row.warningType === input.warningType && row.snapshotHash === input.snapshotHash,
      );
      if (existing) {
        existing.status = 'acknowledged';
        return { id: existing.id, status: 'acknowledged' };
      }
      const created: StoredDuplicateWarning = {
        id: `ack-${input.warningType}`,
        warningType: input.warningType,
        snapshotHash: input.snapshotHash,
        status: 'acknowledged',
      };
      rows.push(created);
      return { id: created.id, status: 'acknowledged' };
    },
  };
  return { repo, rows };
}

describe('duplicate warning acknowledgements', () => {
  it('does not let an overlap acknowledgement clear a reference warning', async () => {
    const { repo, rows } = memoryRepository();
    let finalized = 0;
    const result = await resumeWhenDuplicateWarningsClear(
      repo,
      {
        organizationId: 'org-1',
        caseKey: 'expense:row-1',
        recordId: 'row-1',
        snapshot: baseSnapshot,
        warningTypes: ['expense_ap_overlap', 'duplicate_vendor_reference'],
        acknowledgeTypes: ['expense_ap_overlap'],
        approverUserId: 'user-1',
      },
      async () => {
        finalized += 1;
        return 'finalized' as const;
      },
    );

    expect(finalized).toBe(0);
    expect(result).toMatchObject({ outcome: 'pending_duplicate_warning' });
    if (result === 'finalized') throw new Error('finalize ran');
    expect(result.warnings.map((warning) => warning.warningType)).toEqual([
      'duplicate_vendor_reference',
    ]);
    expect(
      resolveDuplicateWarningStatuses({
        warningTypes: ['expense_ap_overlap', 'duplicate_vendor_reference'],
        snapshotHash: result.snapshotHash,
        stored: rows,
      }),
    ).toEqual([
      { warningType: 'expense_ap_overlap', status: 'acknowledged' },
      { warningType: 'duplicate_vendor_reference', status: 'pending' },
    ]);
  });

  it('resets the warning to pending when the amount changes', async () => {
    const originalHash = duplicateWarningSnapshotHash(baseSnapshot);
    const { repo, rows } = memoryRepository([
      {
        id: 'ack-overlap',
        warningType: 'expense_ap_overlap',
        snapshotHash: originalHash,
        status: 'acknowledged',
      },
    ]);
    const changed: DuplicateWarningSnapshot = { ...baseSnapshot, amount: '125.00' };
    let finalized = 0;
    const result = await resumeWhenDuplicateWarningsClear(
      repo,
      {
        organizationId: 'org-1',
        caseKey: 'ap_bill:bill-1',
        recordId: 'bill-1',
        snapshot: changed,
        warningTypes: ['expense_ap_overlap'],
        approverUserId: 'user-1',
      },
      async () => {
        finalized += 1;
        return 'finalized' as const;
      },
    );

    expect(finalized).toBe(0);
    expect(result).toMatchObject({ outcome: 'pending_duplicate_warning' });
    if (result === 'finalized') throw new Error('finalize ran');
    expect(result.snapshotHash).not.toBe(originalHash);
    expect(result.warnings).toEqual([
      {
        warningType: 'expense_ap_overlap',
        acknowledgementId: 'pending-expense_ap_overlap',
        status: 'pending',
      },
    ]);
    const statuses = resolveDuplicateWarningStatuses({
      warningTypes: ['expense_ap_overlap'] satisfies DuplicateWarningType[],
      snapshotHash: result.snapshotHash,
      stored: rows,
    });
    expect(statuses).toEqual([{ warningType: 'expense_ap_overlap', status: 'pending' }]);
    expect(rows.find((row) => row.snapshotHash === originalHash)?.status).toBe('acknowledged');
  });

  it('does not block finalize when the matching hash is acknowledged', async () => {
    const snapshotHash = duplicateWarningSnapshotHash(baseSnapshot);
    const { repo } = memoryRepository([
      {
        id: 'ack-overlap',
        warningType: 'expense_ap_overlap',
        snapshotHash,
        status: 'acknowledged',
      },
    ]);
    let finalized = 0;
    const result = await resumeWhenDuplicateWarningsClear(
      repo,
      {
        organizationId: 'org-1',
        caseKey: 'expense:row-1',
        recordId: 'row-1',
        snapshot: baseSnapshot,
        warningTypes: ['expense_ap_overlap'],
        approverUserId: 'user-1',
      },
      async () => {
        finalized += 1;
        return 'finalized' as const;
      },
    );

    expect(finalized).toBe(1);
    expect(result).toBe('finalized');
  });
});
import { describe, expect, it } from 'vitest';
import {
  classifyReadiness,
  emptyReadinessFacts,
  hardBlockers,
  hasHardBlockers,
} from '@/modules/closeout';

describe('closeout readiness classification', () => {
  it('treats open punch as a hard blocker', () => {
    const items = classifyReadiness({ ...emptyReadinessFacts(), openDefects: 2 });
    expect(items).toEqual([{ key: 'openDefects', severity: 'hard', count: 2 }]);
    expect(hasHardBlockers(items)).toBe(true);
  });

  it('treats failed inspections as hard and open inspections as warning', () => {
    const failed = classifyReadiness({ ...emptyReadinessFacts(), failedInspections: 1 });
    expect(failed[0]).toMatchObject({ key: 'openInspections', severity: 'hard', count: 1 });

    const openOnly = classifyReadiness({ ...emptyReadinessFacts(), openInspections: 3 });
    expect(openOnly[0]).toMatchObject({ key: 'openInspections', severity: 'warning', count: 3 });
  });

  it('treats awaiting_approval changes as hard and draft as warning', () => {
    const awaiting = classifyReadiness({
      ...emptyReadinessFacts(),
      awaitingApprovalChanges: 1,
      draftChanges: 2,
    });
    expect(awaiting[0]).toMatchObject({ key: 'unresolvedChanges', severity: 'hard', count: 3 });

    const draftOnly = classifyReadiness({ ...emptyReadinessFacts(), draftChanges: 1 });
    expect(draftOnly[0]).toMatchObject({ key: 'unresolvedChanges', severity: 'warning', count: 1 });
  });

  it('treats submitted time that would still post as hard', () => {
    const submitted = classifyReadiness({
      ...emptyReadinessFacts(),
      submittedUnapprovedTime: 4,
    });
    expect(submitted[0]).toMatchObject({ key: 'unapprovedTime', severity: 'hard', count: 4 });

    const draft = classifyReadiness({ ...emptyReadinessFacts(), otherUnapprovedTime: 2 });
    expect(draft[0]).toMatchObject({ key: 'unapprovedTime', severity: 'warning', count: 2 });
  });

  it('keeps PO, AP, AR, retention and unbilled as warnings, not hard', () => {
    const items = classifyReadiness({
      ...emptyReadinessFacts(),
      openCommitments: 1,
      openPurchaseOrders: 2,
      openSupplierLiabilities: 1,
      openClientBalances: 1,
      unbilledWork: 3,
      remainingRetention: 1,
      openSubcontract: 1,
      openSafety: 1,
      incompleteForms: 1,
    });
    expect(hardBlockers(items)).toEqual([]);
    expect(items.every((item) => item.severity === 'warning')).toBe(true);
  });

  it('keeps milestones and missing documents informational', () => {
    const items = classifyReadiness({
      ...emptyReadinessFacts(),
      missingDocuments: 1,
      unfinishedMilestones: 2,
    });
    expect(items.map((item) => item.severity)).toEqual(['info', 'info']);
    expect(hasHardBlockers(items)).toBe(false);
  });
});

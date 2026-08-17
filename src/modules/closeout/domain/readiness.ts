/**
 * Closeout readiness classification. Hard blockers have an explicit business
 * basis only — never invented from open PO / AP / AR / docs / milestones.
 */

import type {
  ReadinessFacts,
  ReadinessItem,
  ReadinessItemKey,
  ReadinessSeverity,
} from './types';

function item(
  key: ReadinessItemKey,
  severity: ReadinessSeverity,
  count: number,
): ReadinessItem | null {
  if (count <= 0) return null;
  return { key, severity, count };
}

function mixedSeverity(
  key: ReadinessItemKey,
  hardCount: number,
  warningCount: number,
): ReadinessItem | null {
  if (hardCount > 0) return { key, severity: 'hard', count: hardCount + warningCount };
  if (warningCount > 0) return { key, severity: 'warning', count: warningCount };
  return null;
}

/**
 * Maps existing-data counts into checklist rows.
 *
 * Hard: open punch, failed inspections, awaiting_approval changes,
 * submitted time that would still post.
 * Warning: open PO / AP / AR / retention / unbilled / commitments / safety /
 * draft changes / draft time / incomplete forms / open subcontract.
 * Info: milestones, missing required documents.
 */
export function classifyReadiness(facts: ReadinessFacts): readonly ReadinessItem[] {
  return [
    item('openDefects', 'hard', facts.openDefects),
    mixedSeverity('openInspections', facts.failedInspections, facts.openInspections),
    item('incompleteForms', 'warning', facts.incompleteForms),
    item('openSafety', 'warning', facts.openSafety),
    mixedSeverity('unresolvedChanges', facts.awaitingApprovalChanges, facts.draftChanges),
    mixedSeverity('unapprovedTime', facts.submittedUnapprovedTime, facts.otherUnapprovedTime),
    item('openCommitments', 'warning', facts.openCommitments),
    item('openPurchaseOrders', 'warning', facts.openPurchaseOrders),
    item('openSupplierLiabilities', 'warning', facts.openSupplierLiabilities),
    item('openClientBalances', 'warning', facts.openClientBalances),
    item('unbilledWork', 'warning', facts.unbilledWork),
    item('remainingRetention', 'warning', facts.remainingRetention),
    item('openSubcontract', 'warning', facts.openSubcontract),
    item('missingDocuments', 'info', facts.missingDocuments),
    item('unfinishedMilestones', 'info', facts.unfinishedMilestones),
  ].filter((row): row is ReadinessItem => row !== null);
}

export function hardBlockers(items: readonly ReadinessItem[]): readonly ReadinessItem[] {
  return items.filter((row) => row.severity === 'hard');
}

export function hasHardBlockers(items: readonly ReadinessItem[]): boolean {
  return items.some((row) => row.severity === 'hard');
}

export function emptyReadinessFacts(): ReadinessFacts {
  return {
    openDefects: 0,
    failedInspections: 0,
    openInspections: 0,
    incompleteForms: 0,
    openSafety: 0,
    awaitingApprovalChanges: 0,
    draftChanges: 0,
    submittedUnapprovedTime: 0,
    otherUnapprovedTime: 0,
    openCommitments: 0,
    openPurchaseOrders: 0,
    openSupplierLiabilities: 0,
    openClientBalances: 0,
    unbilledWork: 0,
    remainingRetention: 0,
    openSubcontract: 0,
    missingDocuments: 0,
    unfinishedMilestones: 0,
  };
}

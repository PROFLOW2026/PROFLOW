import {
  duplicateWarningSnapshotHash,
  resolveDuplicateWarningStatuses,
  type DuplicateWarningSnapshot,
  type DuplicateWarningType,
  type PendingDuplicateWarning,
  type StoredDuplicateWarning,
} from './snapshot';

export interface DuplicateWarningRepository {
  listForCase(
    organizationId: string,
    caseKey: string,
  ): Promise<readonly StoredDuplicateWarning[]>;
  upsertPending(input: {
    readonly organizationId: string;
    readonly caseKey: string;
    readonly recordId: string;
    readonly warningType: DuplicateWarningType;
    readonly snapshotHash: string;
  }): Promise<{ readonly id: string; readonly status: 'pending' | 'acknowledged' }>;
  acknowledge(input: {
    readonly organizationId: string;
    readonly caseKey: string;
    readonly recordId: string;
    readonly warningType: DuplicateWarningType;
    readonly snapshotHash: string;
    readonly approverUserId: string;
  }): Promise<{ readonly id: string; readonly status: 'pending' | 'acknowledged' }>;
}

export type DuplicateWarningGateResult =
  | { readonly outcome: 'clear'; readonly snapshotHash: string }
  | PendingDuplicateWarning;

/**
 * Persist a pending row per open warning. An acknowledgement of one type
 * never clears another type. Resume only when every open warning is
 * acknowledged for the current material-field hash.
 */
export async function holdOrResumeDuplicateWarnings(
  repo: DuplicateWarningRepository,
  input: {
    readonly organizationId: string;
    readonly caseKey: string;
    readonly recordId: string;
    readonly snapshot: DuplicateWarningSnapshot;
    readonly warningTypes: readonly DuplicateWarningType[];
    readonly acknowledgeTypes?: readonly DuplicateWarningType[];
    readonly approverUserId: string;
  },
): Promise<DuplicateWarningGateResult> {
  const snapshotHash = duplicateWarningSnapshotHash(input.snapshot);
  const warningTypes = [...new Set(input.warningTypes)];
  if (warningTypes.length === 0) {
    return { outcome: 'clear', snapshotHash };
  }

  const requested = new Set(input.acknowledgeTypes ?? []);
  for (const warningType of warningTypes) {
    if (!requested.has(warningType)) continue;
    await repo.acknowledge({
      organizationId: input.organizationId,
      caseKey: input.caseKey,
      recordId: input.recordId,
      warningType,
      snapshotHash,
      approverUserId: input.approverUserId,
    });
  }

  const stored = await repo.listForCase(input.organizationId, input.caseKey);
  const statuses = resolveDuplicateWarningStatuses({
    warningTypes,
    snapshotHash,
    stored,
  });
  const pendingTypes = statuses
    .filter((row) => row.status === 'pending')
    .map((row) => row.warningType);

  if (pendingTypes.length === 0) {
    return { outcome: 'clear', snapshotHash };
  }

  const warnings: PendingDuplicateWarning['warnings'][number][] = [];
  for (const warningType of pendingTypes) {
    const row = await repo.upsertPending({
      organizationId: input.organizationId,
      caseKey: input.caseKey,
      recordId: input.recordId,
      warningType,
      snapshotHash,
    });
    if (row.status === 'acknowledged') continue;
    warnings.push({
      warningType,
      acknowledgementId: row.id,
      status: 'pending',
    });
  }

  if (warnings.length === 0) {
    return { outcome: 'clear', snapshotHash };
  }

  return {
    outcome: 'pending_duplicate_warning',
    pendingDuplicateWarning: true,
    recordId: input.recordId,
    caseKey: input.caseKey,
    snapshotHash,
    warnings,
  };
}

/** Finalize or promote only after the matching snapshot hash is acknowledged. */
export async function resumeWhenDuplicateWarningsClear<T>(
  repo: DuplicateWarningRepository,
  input: Parameters<typeof holdOrResumeDuplicateWarnings>[1],
  resume: () => Promise<T>,
): Promise<T | PendingDuplicateWarning> {
  const gate = await holdOrResumeDuplicateWarnings(repo, input);
  if (gate.outcome === 'pending_duplicate_warning') return gate;
  return resume();
}
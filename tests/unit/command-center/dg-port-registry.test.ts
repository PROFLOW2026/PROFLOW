import { describe, expect, it } from 'vitest';
import '@/modules/command-center/data/collect-dg';
import {
  dgCommandCenterPortsFor,
  registerDgCommandCenterPort,
} from '@/modules/command-center/data/dg-ports';
import type { DgSourceType } from '@/modules/command-center/domain/types';

const REGISTERED: readonly DgSourceType[] = [
  'dg_claim_awaiting_review',
  'dg_payment_eligibility_blocked',
  'dg_coordination_blocked',
  'dg_critical_task_overdue',
  'dg_defect_awaiting_verification',
  'dg_rfi_overdue',
  'dg_submittal_pending',
  'dg_compliance_expiring',
  'dg_acknowledgement_overdue',
];

describe('dg command center port registry', () => {
  it('returns a registered fake port and keeps the developer/gc providers', () => {
    for (const sourceType of REGISTERED) {
      expect(dgCommandCenterPortsFor(sourceType).length, sourceType).toBeGreaterThan(0);
    }
    expect(dgCommandCenterPortsFor('dg_acknowledgement_overdue').length).toBeGreaterThanOrEqual(3);

    const before = dgCommandCenterPortsFor('dg_rfi_overdue').length;
    const port = async () => [{ id: 'fake-rfi', projectId: 'p-1', dueDate: '2026-09-01', reference: 'RFI-9' }];
    registerDgCommandCenterPort('dg_rfi_overdue', port);
    expect(dgCommandCenterPortsFor('dg_rfi_overdue')).toContain(port);
    expect(dgCommandCenterPortsFor('dg_rfi_overdue')).toHaveLength(before + 1);
  });
});

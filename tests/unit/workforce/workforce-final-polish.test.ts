import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_PACKAGE_NAME } from '@/modules/projects/domain/types';
import {
  entryTargetLine,
  formatWorkPackageDisplayName,
} from '@/modules/workforce/ui/time-entry-display';
import type { TimeEntryListItem } from '@/modules/workforce/domain/types';
import { calculateUnitEmployerCostPool } from '@/modules/workforce/domain/employer-cost-pool';
import { toNumericString } from '@/shared/money';

const baseEntry = {
  id: 'te-1',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  employeeName: 'Test',
  projectId: 'proj-1',
  projectName: 'פינס 16 פתח תקוה',
  workPackageId: 'wp-1',
  workPackageName: DEFAULT_WORK_PACKAGE_NAME,
  phaseId: null,
  timeCodeId: null,
  timeCodeName: null,
  rateVersionId: null,
  description: null,
  createdByUserId: null,
  kind: 'project',
  workDate: '2026-01-15',
  hours: '8',
  status: 'recorded',
  voidedAt: null,
  bulkBatchId: null,
  timesheetId: null,
  submittedAt: null,
  submittedByUserId: null,
  decidedAt: null,
  decidedByUserId: null,
  approvalStatus: 'approved',
  excessHours: null,
  excessApprovalStatus: null,
  clientRequestId: null,
  archivedAt: null,
  costAmount: null,
  costCurrency: null,
  managerNote: null,
  correctsEntryId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TimeEntryListItem;

describe('formatWorkPackageDisplayName', () => {
  it('maps stored General work package to Hebrew label', () => {
    const t = (key: string) => (key === 'time.defaultWorkPackageName' ? 'כללי' : key);
    expect(formatWorkPackageDisplayName(DEFAULT_WORK_PACKAGE_NAME, t)).toBe('כללי');
    expect(formatWorkPackageDisplayName('חשמל', t)).toBe('חשמל');
  });
});

describe('entryTargetLine', () => {
  it('localizes default work package in project / code column', () => {
    const t = (key: string) => {
      if (key === 'time.defaultWorkPackageName') return 'כללי';
      return key;
    };

    expect(entryTargetLine(baseEntry, t, { projectScoped: false })).toBe(
      'פינס 16 פתח תקוה · כללי',
    );
    expect(entryTargetLine(baseEntry, t, { projectScoped: true })).toBe('כללי');
  });
});

describe('employee list employer cost', () => {
  it('uses calculateUnitEmployerCostPool for current employer cost display', () => {
    const pool = calculateUnitEmployerCostPool({
      baseRate: '10000',
      currency: 'ILS',
      burdenPercent: '15',
    });
    expect(toNumericString(pool.total)).toBe('11500.000000');
  });
});

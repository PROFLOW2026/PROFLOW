import { describe, expect, it } from 'vitest';
import {
  allowedMaintenanceTransitions,
  assertMaintenanceStatusTransition,
  assetDocumentOwnerType,
  canTransitionMaintenanceStatus,
  classifyMaintenanceSchedule,
  isMaintenanceCostAnExpense,
  isTerminalMaintenanceStatus,
  partitionMaintenanceBySchedule,
} from '@/modules/assets';

describe('canTransitionMaintenanceStatus', () => {
  it('allows planned → in_progress / completed / cancelled', () => {
    expect(canTransitionMaintenanceStatus('planned', 'in_progress')).toBe(true);
    expect(canTransitionMaintenanceStatus('planned', 'completed')).toBe(true);
    expect(canTransitionMaintenanceStatus('planned', 'cancelled')).toBe(true);
  });

  it('allows same-status no-op', () => {
    expect(canTransitionMaintenanceStatus('planned', 'planned')).toBe(true);
    expect(canTransitionMaintenanceStatus('completed', 'completed')).toBe(true);
  });

  it('blocks transitions from completed and cancelled', () => {
    expect(canTransitionMaintenanceStatus('completed', 'planned')).toBe(false);
    expect(canTransitionMaintenanceStatus('cancelled', 'in_progress')).toBe(false);
  });

  it('allows in_progress → planned / completed / cancelled', () => {
    expect(canTransitionMaintenanceStatus('in_progress', 'planned')).toBe(true);
    expect(canTransitionMaintenanceStatus('in_progress', 'completed')).toBe(true);
    expect(canTransitionMaintenanceStatus('in_progress', 'cancelled')).toBe(true);
  });
});

describe('assertMaintenanceStatusTransition', () => {
  it('throws on invalid transition', () => {
    expect(() => assertMaintenanceStatusTransition('completed', 'planned')).toThrow(
      /Invalid maintenance/,
    );
  });
});

describe('isTerminalMaintenanceStatus', () => {
  it('treats completed and cancelled as terminal', () => {
    expect(isTerminalMaintenanceStatus('completed')).toBe(true);
    expect(isTerminalMaintenanceStatus('cancelled')).toBe(true);
    expect(isTerminalMaintenanceStatus('planned')).toBe(false);
    expect(isTerminalMaintenanceStatus('in_progress')).toBe(false);
  });
});

describe('allowedMaintenanceTransitions', () => {
  it('returns empty for terminal statuses', () => {
    expect(allowedMaintenanceTransitions('completed')).toEqual([]);
    expect(allowedMaintenanceTransitions('cancelled')).toEqual([]);
  });
});

describe('classifyMaintenanceSchedule', () => {
  const today = '2026-08-09';

  it('marks open work with past performed_on as overdue', () => {
    expect(
      classifyMaintenanceSchedule({ status: 'planned', performedOn: '2026-08-01' }, today),
    ).toBe('overdue');
    expect(
      classifyMaintenanceSchedule({ status: 'in_progress', performedOn: '2026-08-08' }, today),
    ).toBe('overdue');
  });

  it('marks planned work within upcoming window as upcoming', () => {
    expect(
      classifyMaintenanceSchedule({ status: 'planned', performedOn: '2026-08-20' }, today, 30),
    ).toBe('upcoming');
  });

  it('does not treat in_progress future dates as upcoming', () => {
    expect(
      classifyMaintenanceSchedule({ status: 'in_progress', performedOn: '2026-08-20' }, today, 30),
    ).toBe('other');
  });

  it('returns other for completed, cancelled, missing date, or far future', () => {
    expect(
      classifyMaintenanceSchedule({ status: 'completed', performedOn: '2026-08-01' }, today),
    ).toBe('other');
    expect(
      classifyMaintenanceSchedule({ status: 'cancelled', performedOn: '2026-08-01' }, today),
    ).toBe('other');
    expect(classifyMaintenanceSchedule({ status: 'planned', performedOn: null }, today)).toBe(
      'other',
    );
    expect(
      classifyMaintenanceSchedule({ status: 'planned', performedOn: '2026-12-01' }, today, 30),
    ).toBe('other');
  });
});

describe('partitionMaintenanceBySchedule', () => {
  it('buckets records', () => {
    const result = partitionMaintenanceBySchedule(
      [
        { id: '1', status: 'planned' as const, performedOn: '2026-08-01' },
        { id: '2', status: 'planned' as const, performedOn: '2026-08-15' },
        { id: '3', status: 'completed' as const, performedOn: '2026-08-01' },
      ],
      '2026-08-09',
      30,
    );
    expect(result.overdue.map((r) => r.id)).toEqual(['1']);
    expect(result.upcoming.map((r) => r.id)).toEqual(['2']);
    expect(result.other.map((r) => r.id)).toEqual(['3']);
  });
});

describe('financial and document hard rules', () => {
  it('maintenance cost is never an Expense', () => {
    expect(isMaintenanceCostAnExpense()).toBe(false);
  });

  it('documents support asset owner type', () => {
    expect(assetDocumentOwnerType()).toBe('asset');
  });
});

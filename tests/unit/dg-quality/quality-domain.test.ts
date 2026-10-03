import { describe, expect, it } from 'vitest';
import {
  DEFECT_CYCLE_RECORD_KINDS as SCHEMA_RECORD_KINDS,
  DEFECT_MODES as SCHEMA_MODES,
  DEFECT_SEVERITIES as SCHEMA_SEVERITIES,
  DEFECT_STATUSES as SCHEMA_DEFECT_STATUSES,
  QUALITY_CHECK_RESULTS,
  QUALITY_INSPECTION_OUTCOMES,
  QUALITY_INSPECTION_STATUSES,
} from '@drizzle/schema';
import {
  addDaysIso,
  allowedDefectActions,
  canTransition,
  countCycleEvidence,
  currentCycleStartedAt,
  DEFECT_CYCLE_RECORD_KINDS,
  DEFECT_MODES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  DEFECT_TRANSITIONS,
  isDefectOverdue,
  planDefectStep,
  statusesForFilter,
} from '@/modules/defects/domain/lifecycle';
import { computeContractorQualityMetrics } from '@/modules/defects/domain/metrics';
import { INSPECTION_CATALOG, findCatalogTemplate } from '@/modules/inspections/domain/catalog';
import {
  CHECK_RESULTS,
  INSPECTION_OUTCOMES,
  INSPECTION_STATUSES,
  canEditChecklist,
  canPerformInspectionAction,
  suggestedOutcome,
  tallyChecklist,
  validateOutcome,
} from '@/modules/inspections/domain/rules';
import { QUALITY_DOMAIN_EVENTS } from '@/shared/domain-events/events/quality';
import { QUALITY_AUDIT_ACTIONS } from '@/shared/audit/dg/quality';

describe('inspection rules', () => {
  it('stays in sync with the schema enums', () => {
    expect([...INSPECTION_STATUSES]).toEqual([...QUALITY_INSPECTION_STATUSES]);
    expect([...INSPECTION_OUTCOMES]).toEqual([...QUALITY_INSPECTION_OUTCOMES]);
    expect([...CHECK_RESULTS]).toEqual([...QUALITY_CHECK_RESULTS]);
  });

  it('tallies the checklist and suggests an outcome', () => {
    const tally = tallyChecklist([
      { isRequired: true, result: 'pass' },
      { isRequired: true, result: 'na' },
      { isRequired: false, result: 'fail' },
      { isRequired: false, result: 'pending' },
    ]);
    expect(tally).toMatchObject({ total: 4, pass: 1, na: 1, fail: 1, failRequired: 0, pending: 1, pendingRequired: 0 });
    expect(suggestedOutcome(tally)).toBe('conditional_pass');
    expect(suggestedOutcome(tallyChecklist([{ isRequired: true, result: 'fail' }]))).toBe('fail');
    expect(suggestedOutcome(tallyChecklist([{ isRequired: true, result: 'pass' }]))).toBe('pass');
  });

  it('never lets the inspector be more lenient than the checklist', () => {
    const failedRequired = tallyChecklist([{ isRequired: true, result: 'fail' }]);
    expect(validateOutcome('pass', failedRequired, {})).toBe('pass_with_required_failure');
    expect(validateOutcome('conditional_pass', failedRequired, { conditions: 'x' })).toBe('pass_with_required_failure');
    expect(validateOutcome('fail', failedRequired, {})).toBeNull();

    const pending = tallyChecklist([{ isRequired: true, result: 'pending' }]);
    expect(validateOutcome('fail', pending, { summary: 'x' })).toBe('required_items_pending');

    const clean = tallyChecklist([{ isRequired: true, result: 'pass' }]);
    expect(validateOutcome('conditional_pass', clean, {})).toBe('conditions_required');
    expect(validateOutcome('conditional_pass', clean, { conditions: 'Seal by Friday' })).toBeNull();
    expect(validateOutcome('fail', clean, {})).toBe('fail_reason_required');
    expect(validateOutcome('fail', clean, { summary: 'Wrong membrane' })).toBeNull();
  });

  it('allows re-inspection only of failed or conditional inspections', () => {
    expect(canPerformInspectionAction('reinspect', 'completed', 'fail')).toBe(true);
    expect(canPerformInspectionAction('reinspect', 'completed', 'conditional_pass')).toBe(true);
    expect(canPerformInspectionAction('reinspect', 'completed', 'pass')).toBe(false);
    expect(canPerformInspectionAction('record_outcome', 'completed', 'fail')).toBe(false);
    expect(canPerformInspectionAction('cancel', 'cancelled', null)).toBe(false);
    expect(canEditChecklist('completed')).toBe(false);
    expect(canEditChecklist('in_progress')).toBe(true);
  });

  it('ships the required checklist catalog with unique keys', () => {
    const keys = INSPECTION_CATALOG.map((template) => template.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'waterproofing',
        'concrete_pre_pour',
        'electrical_panel',
        'pressure_test',
        'ceiling_closure',
        'fire_system',
        'aluminium_installation',
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const template of INSPECTION_CATALOG) {
      expect(template.items.length).toBeGreaterThan(3);
      const itemKeys = template.items.map((item) => item.key);
      expect(new Set(itemKeys).size).toBe(itemKeys.length);
      for (const key of [template.key, template.category, ...itemKeys]) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    expect(findCatalogTemplate('nope')).toBeNull();
  });
});

describe('defect lifecycle', () => {
  it('stays in sync with the schema enums', () => {
    expect([...DEFECT_STATUSES]).toEqual([...SCHEMA_DEFECT_STATUSES]);
    expect([...DEFECT_SEVERITIES]).toEqual([...SCHEMA_SEVERITIES]);
    expect([...DEFECT_MODES]).toEqual([...SCHEMA_MODES]);
    expect([...DEFECT_CYCLE_RECORD_KINDS]).toEqual([...SCHEMA_RECORD_KINDS]);
  });

  it('plans open -> assigned -> submitted -> rejected (new cycle) -> resubmitted -> closed', () => {
    expect(planDefectStep('assign', 'open')).toEqual({ to: 'assigned', record: 'assigned', newCycle: false });
    expect(planDefectStep('submit_completion', 'assigned')?.to).toBe('completion_submitted');
    expect(planDefectStep('reject', 'completion_submitted')).toEqual({
      to: 'reopened',
      record: 'rejected',
      newCycle: true,
    });
    expect(planDefectStep('submit_completion', 'reopened')?.to).toBe('completion_submitted');
    expect(planDefectStep('start_verification', 'completion_submitted')?.to).toBe('verification');
    expect(planDefectStep('accept', 'verification')?.to).toBe('closed');
    expect(planDefectStep('reopen', 'closed')).toEqual({ to: 'reopened', record: 'reopened', newCycle: true });
  });

  it('refuses illegal steps', () => {
    expect(planDefectStep('submit_completion', 'open')).toBeNull();
    expect(planDefectStep('accept', 'assigned')).toBeNull();
    expect(planDefectStep('cancel', 'closed')).toBeNull();
    expect(allowedDefectActions('cancelled')).toEqual([]);
  });

  it('every planned step is an allowed DB transition', () => {
    for (const from of DEFECT_STATUSES) {
      for (const action of allowedDefectActions(from)) {
        const step = planDefectStep(action, from)!;
        expect(canTransition(from, step.to)).toBe(true);
      }
      for (const to of DEFECT_TRANSITIONS[from]) expect(DEFECT_STATUSES).toContain(to);
    }
  });

  it('computes overdue only while the responsible party owes work', () => {
    expect(isDefectOverdue({ status: 'assigned', dueDate: '2026-01-01' }, '2026-01-02')).toBe(true);
    expect(isDefectOverdue({ status: 'completion_submitted', dueDate: '2026-01-01' }, '2026-01-02')).toBe(false);
    expect(isDefectOverdue({ status: 'assigned', dueDate: '2026-01-02' }, '2026-01-02')).toBe(false);
    expect(isDefectOverdue({ status: 'assigned', dueDate: null }, '2026-01-02')).toBe(false);
    expect(statusesForFilter('awaiting_verification')).toEqual(['completion_submitted', 'verification']);
    expect(addDaysIso('2026-02-27', 3)).toBe('2026-03-02');
  });

  it('only counts evidence uploaded during the current repair cycle', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const rejectedAt = new Date('2026-01-05T00:00:00Z');
    const records = [
      { kind: 'opened' as const, cycleNo: 1, createdAt: created },
      { kind: 'rejected' as const, cycleNo: 1, createdAt: rejectedAt },
    ];
    expect(currentCycleStartedAt(records, 1, created)).toBe(created);
    expect(currentCycleStartedAt(records, 2, created)).toEqual(rejectedAt);
    const evidence = [{ uploadedAt: '2026-01-03T00:00:00Z' }, { uploadedAt: '2026-01-06T00:00:00Z' }];
    expect(countCycleEvidence(evidence, created)).toBe(2);
    expect(countCycleEvidence(evidence, rejectedAt)).toBe(1);
  });
});

describe('contractor quality metrics', () => {
  it('computes first-time pass rate, rework and closing time', () => {
    const metrics = computeContractorQualityMetrics(
      [
        { attemptNo: 1, outcome: 'fail' },
        { attemptNo: 2, outcome: 'pass' },
        { attemptNo: 1, outcome: 'pass' },
        { attemptNo: 1, outcome: 'conditional_pass' },
      ],
      [
        {
          status: 'closed',
          severity: 'high',
          cycleNo: 2,
          dueDate: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          closedAt: new Date('2026-01-05T00:00:00Z'),
        },
        { status: 'assigned', severity: 'critical', cycleNo: 1, dueDate: '2026-01-01', createdAt: new Date(), closedAt: null },
        { status: 'cancelled', severity: 'low', cycleNo: 1, dueDate: null, createdAt: new Date(), closedAt: null },
      ],
      '2026-02-01',
    );
    expect(metrics).toMatchObject({
      inspectionAttempts: 4,
      inspectionsFailedAttempts: 1,
      firstAttemptCount: 3,
      firstTimePassCount: 2,
      firstTimePassRate: 0.6667,
      defectsTotal: 2,
      defectsOpen: 1,
      defectsOverdue: 1,
      defectsCriticalOpen: 1,
      defectsClosed: 1,
      defectsReworked: 1,
      averageRepairCycles: 2,
      averageDaysToClose: 4,
    });
  });

  it('returns nulls without data', () => {
    const metrics = computeContractorQualityMetrics([], [], '2026-01-01');
    expect(metrics.firstTimePassRate).toBeNull();
    expect(metrics.averageRepairCycles).toBeNull();
    expect(metrics.averageDaysToClose).toBeNull();
  });
});

describe('quality registries', () => {
  it('events follow <domain>.<entity>.<verb>', () => {
    for (const type of Object.values(QUALITY_DOMAIN_EVENTS)) {
      expect(type).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/);
    }
  });

  it('audit actions follow entity.verb', () => {
    for (const action of Object.values(QUALITY_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    }
  });
});

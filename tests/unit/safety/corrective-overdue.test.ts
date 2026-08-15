import { describe, expect, it } from 'vitest';
import {
  isCorrectiveActionOverdue,
  listOverdueSafetyActions,
  createSafetyRecordSchema,
  createCorrectiveActionSchema,
  updateSafetyRecordSchema,
  updateCorrectiveActionSchema,
} from '@/modules/safety';

const TODAY = '2026-08-15';
const ORG_A = '018f0000-0000-7000-8000-00000000000a';
const ORG_B = '018f0000-0000-7000-8000-00000000000b';

function action(overrides: {
  organizationId?: string;
  status?: 'open' | 'in_progress' | 'done' | 'cancelled';
  dueDate?: string | null;
}) {
  return {
    organizationId: overrides.organizationId ?? ORG_A,
    status: overrides.status ?? 'open',
    dueDate: overrides.dueDate === undefined ? '2026-08-01' : overrides.dueDate,
  };
}

describe('corrective action overdue', () => {
  it('marks open actions past due as overdue', () => {
    expect(isCorrectiveActionOverdue(action({ dueDate: '2026-08-14' }), TODAY)).toBe(true);
    expect(isCorrectiveActionOverdue(action({ status: 'in_progress' }), TODAY)).toBe(true);
  });

  it('does not mark done, cancelled, undated, or due-today actions as overdue', () => {
    expect(isCorrectiveActionOverdue(action({ status: 'done' }), TODAY)).toBe(false);
    expect(isCorrectiveActionOverdue(action({ status: 'cancelled' }), TODAY)).toBe(false);
    expect(isCorrectiveActionOverdue(action({ dueDate: null }), TODAY)).toBe(false);
    expect(isCorrectiveActionOverdue(action({ dueDate: TODAY }), TODAY)).toBe(false);
  });
});

describe('listOverdueSafetyActions tenant isolation', () => {
  it('keeps only the requested organization', () => {
    const overdue = listOverdueSafetyActions(
      [
        action({ organizationId: ORG_A, dueDate: '2026-08-01' }),
        action({ organizationId: ORG_B, dueDate: '2026-08-01' }),
        action({ organizationId: ORG_A, status: 'done', dueDate: '2026-08-01' }),
      ],
      TODAY,
      ORG_A,
    );
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.organizationId).toBe(ORG_A);
  });

  it('does not leak another tenant when organizationId is omitted from the filter list', () => {
    const mixed = listOverdueSafetyActions(
      [action({ organizationId: ORG_B }), action({ organizationId: ORG_A })],
      TODAY,
      ORG_A,
    );
    expect(mixed.every((row) => row.organizationId === ORG_A)).toBe(true);
  });
});

describe('safety type and status checks', () => {
  const occurredAt = new Date('2026-08-15T07:00:00.000Z');

  it('accepts known record types and rejects unknown ones', () => {
    const ok = createSafetyRecordSchema.safeParse({
      recordType: 'near_miss',
      occurredAt,
      title: 'Scaffold clip missing',
      description: 'Observed on level 2.',
    });
    expect(ok.success).toBe(true);

    const bad = createSafetyRecordSchema.safeParse({
      recordType: 'explosion',
      occurredAt,
      title: 'Bad',
      description: 'No.',
    });
    expect(bad.success).toBe(false);
  });

  it('rejects unknown record and action statuses', () => {
    expect(
      updateSafetyRecordSchema.safeParse({
        safetyRecordId: '018f0000-0000-7000-8000-000000000001',
        status: 'archived',
      }).success,
    ).toBe(false);

    expect(
      updateCorrectiveActionSchema.safeParse({
        actionId: '018f0000-0000-7000-8000-000000000002',
        status: 'overdue',
      }).success,
    ).toBe(false);

    expect(
      createCorrectiveActionSchema.safeParse({
        safetyRecordId: '018f0000-0000-7000-8000-000000000001',
        title: 'Install guardrail',
        dueDate: '2026-08-20',
      }).success,
    ).toBe(true);
  });
});

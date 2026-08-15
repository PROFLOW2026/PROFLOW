import { describe, expect, it } from 'vitest';
import {
  capTimelineEvents,
  filterTimelineEvents,
  isShownAsActiveInvoice,
  mapBillingStatusToTimeline,
  mergeCanonicalAndIndexEvents,
  omitContradictoryBilling,
  sortTimelineEvents,
  timelineEventKey,
  type TimelineEvent,
} from '@/modules/clients/domain/timeline';

function event(overrides: Partial<TimelineEvent> & Pick<TimelineEvent, 'kind' | 'entityId'>): TimelineEvent {
  const kind = overrides.kind;
  return {
    id: overrides.id ?? `${kind}:billing_record:${overrides.entityId}`,
    occurredAt: overrides.occurredAt ?? new Date('2026-08-01T10:00:00.000Z'),
    category: overrides.category ?? 'billing',
    kind,
    entityType: overrides.entityType ?? 'billing_record',
    entityId: overrides.entityId,
    summary: overrides.summary ?? 'Invoice',
    deepLink: overrides.deepLink ?? `/billing/${overrides.entityId}`,
    actorUserId: overrides.actorUserId ?? null,
    actorName: overrides.actorName ?? null,
    status: overrides.status ?? null,
    presentation: overrides.presentation ?? 'neutral',
    projectId: overrides.projectId ?? null,
    projectName: overrides.projectName ?? null,
    billingKind: overrides.billingKind ?? 'invoice',
    source: overrides.source ?? 'canonical',
  };
}

describe('client timeline ordering and filters', () => {
  const older = event({
    kind: 'billing_created',
    entityId: '11111111-1111-4111-8111-111111111111',
    occurredAt: new Date('2026-08-01T08:00:00.000Z'),
    presentation: 'active',
    category: 'billing',
  });
  const newer = event({
    kind: 'payment_received',
    entityType: 'payment',
    entityId: '22222222-2222-4222-8222-222222222222',
    occurredAt: new Date('2026-08-02T08:00:00.000Z'),
    presentation: 'approved',
    category: 'billing',
  });
  const project = event({
    kind: 'project_created',
    entityType: 'project',
    entityId: '33333333-3333-4333-8333-333333333333',
    occurredAt: new Date('2026-08-01T12:00:00.000Z'),
    category: 'project',
    presentation: 'neutral',
    billingKind: null,
  });

  it('sorts newest first by default', () => {
    const sorted = sortTimelineEvents([older, project, newer]);
    expect(sorted.map((item) => item.kind)).toEqual([
      'payment_received',
      'project_created',
      'billing_created',
    ]);
  });

  it('sorts oldest first when asked', () => {
    const sorted = sortTimelineEvents([newer, older, project], 'oldest');
    expect(sorted.map((item) => item.kind)).toEqual([
      'billing_created',
      'project_created',
      'payment_received',
    ]);
  });

  it('filters by category and keeps all when category is all', () => {
    const rows = [older, newer, project];
    expect(filterTimelineEvents(rows, 'project')).toEqual([project]);
    expect(filterTimelineEvents(rows, 'billing')).toHaveLength(2);
    expect(filterTimelineEvents(rows, 'all')).toHaveLength(3);
  });

  it('caps the list after sort without mutating input', () => {
    const rows = [older, newer, project];
    const capped = capTimelineEvents(sortTimelineEvents(rows), 2);
    expect(capped).toHaveLength(2);
    expect(rows).toHaveLength(3);
  });
});

describe('client timeline voided billing', () => {
  const billingId = '44444444-4444-4444-8444-444444444444';

  it('maps voided billing to a void presentation, not an active invoice', () => {
    expect(mapBillingStatusToTimeline('void')).toEqual({
      kind: 'billing_voided',
      presentation: 'void',
    });
    expect(mapBillingStatusToTimeline('finalized')).toEqual({
      kind: 'billing_created',
      presentation: 'active',
    });
    expect(mapBillingStatusToTimeline('draft')).toEqual({
      kind: 'billing_created',
      presentation: 'draft',
    });
  });

  it('does not treat voided or draft billing as an active invoice', () => {
    expect(
      isShownAsActiveInvoice({
        kind: 'billing_created',
        presentation: 'active',
        billingKind: 'invoice',
      }),
    ).toBe(true);
    expect(
      isShownAsActiveInvoice({
        kind: 'billing_voided',
        presentation: 'void',
        billingKind: 'invoice',
      }),
    ).toBe(false);
    expect(
      isShownAsActiveInvoice({
        kind: 'billing_created',
        presentation: 'draft',
        billingKind: 'invoice',
      }),
    ).toBe(false);
    expect(
      isShownAsActiveInvoice({
        kind: 'billing_created',
        presentation: 'active',
        billingKind: 'credit_note',
      }),
    ).toBe(false);
  });

  it('drops an index pointer that still calls a voided record an open invoice', () => {
    const voided = event({
      kind: 'billing_voided',
      entityId: billingId,
      presentation: 'void',
      status: 'void',
      source: 'canonical',
    });
    const staleIndex = event({
      kind: 'billing_created',
      entityId: billingId,
      presentation: 'active',
      status: 'finalized',
      source: 'index',
      occurredAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const merged = mergeCanonicalAndIndexEvents([voided], [staleIndex]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind).toBe('billing_voided');
    expect(merged.some(isShownAsActiveInvoice)).toBe(false);
  });

  it('omits a contradictory canonical active invoice when the same record is voided', () => {
    const created = event({
      kind: 'billing_created',
      entityId: billingId,
      presentation: 'active',
    });
    const voided = event({
      kind: 'billing_voided',
      entityId: billingId,
      presentation: 'void',
      id: `billing_voided:billing_record:${billingId}`,
    });
    const cleaned = omitContradictoryBilling([created, voided]);
    expect(cleaned.map((row) => row.kind)).toEqual(['billing_voided']);
  });

  it('keeps index events that do not contradict canonical rows', () => {
    const note = event({
      kind: 'indexed',
      entityType: 'note',
      entityId: '55555555-5555-4555-8555-555555555555',
      category: 'client',
      presentation: 'neutral',
      billingKind: null,
      source: 'index',
      summary: 'Site visit',
    });
    const merged = mergeCanonicalAndIndexEvents([], [note]);
    expect(timelineEventKey(merged[0]!)).toBe(timelineEventKey(note));
  });
});

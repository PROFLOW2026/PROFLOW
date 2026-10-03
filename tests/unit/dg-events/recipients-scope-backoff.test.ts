import { describe, expect, it } from 'vitest';
import {
  DG_MAX_ATTEMPTS,
  describeConsumerError,
  isDeadLettered,
  nextAttemptAt,
  retryDelayMs,
} from '@/modules/dg-events/domain/backoff';
import {
  DG_ADMIN_FALLBACK_CAP,
  selectExternalRecipients,
  selectInternalRecipients,
} from '@/modules/dg-events/domain/recipients';
import {
  externalTargeting,
  payloadIds,
  payloadReference,
  primaryAgreementId,
  primaryVendorId,
} from '@/modules/dg-events/domain/scope';

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const U3 = '00000000-0000-4000-8000-000000000003';
const V1 = '00000000-0000-4000-8000-0000000000a1';
const V2 = '00000000-0000-4000-8000-0000000000a2';
const A1 = '00000000-0000-4000-8000-0000000000b1';

describe('internal recipient selection', () => {
  const base = { holders: [U1, U2], admins: [U3], named: [], namedEligible: new Set<string>(), namedOnly: false, excludeUserIds: [] };

  it('notifies capability holders and excludes the actor', () => {
    expect(selectInternalRecipients({ ...base, excludeUserIds: [U1] })).toEqual([U2]);
  });

  it('falls back to project admins only when no member holds the capability', () => {
    expect(selectInternalRecipients({ ...base, holders: [] })).toEqual([U3]);
    expect(selectInternalRecipients({ ...base, holders: [], admins: Array.from({ length: 20 }, (_, i) => `${i}`) })).toHaveLength(
      DG_ADMIN_FALLBACK_CAP,
    );
  });

  it('prefers an eligible named recipient and ignores ineligible ones', () => {
    expect(selectInternalRecipients({ ...base, named: [U2], namedEligible: new Set([U2]) })).toEqual([U2]);
    expect(selectInternalRecipients({ ...base, named: [U3], namedEligible: new Set() })).toEqual([U1, U2]);
  });

  it('sends nothing for named-only audiences without an eligible named user', () => {
    expect(selectInternalRecipients({ ...base, namedOnly: true })).toEqual([]);
    expect(selectInternalRecipients({ ...base, namedOnly: true, named: [U1], namedEligible: new Set([U1]), excludeUserIds: [U1] })).toEqual([]);
  });
});

describe('external recipient selection', () => {
  const covered = [
    { principalId: U1, vendorId: V1, agreementId: A1 },
    { principalId: U2, vendorId: V1, agreementId: A1 },
    { principalId: U1, vendorId: V1, agreementId: null },
  ];

  it('dedupes principals and excludes the acting principal', () => {
    expect(selectExternalRecipients({ covered, named: [], namedOnly: false, excludePrincipalIds: [U2] }).map((c) => c.principalId)).toEqual([U1]);
  });

  it('narrows to named principals that are covered by a grant', () => {
    expect(selectExternalRecipients({ covered, named: [U2], namedOnly: false, excludePrincipalIds: [] }).map((c) => c.principalId)).toEqual([U2]);
    expect(selectExternalRecipients({ covered, named: [U3], namedOnly: false, excludePrincipalIds: [] })).toEqual([]);
  });
});

describe('external targeting', () => {
  it('uses explicit payload scope first', () => {
    const targeting = externalTargeting({ vendorId: V1, agreementId: A1 }, { vendorId: V2 });
    expect(targeting).toEqual({ mode: 'targets', targets: [{ vendorId: V1, agreementId: A1 }] });
    expect(primaryVendorId(targeting)).toBe(V1);
    expect(primaryAgreementId({}, targeting)).toBe(A1);
  });

  it('supports multi-contractor and project-wide audiences', () => {
    const multi = externalTargeting({ vendorIds: [V1, V2, 'not-a-uuid'] }, null);
    expect(multi.mode === 'targets' && multi.targets.map((t) => t.vendorId)).toEqual([V1, V2]);
    expect(primaryVendorId(multi)).toBeNull();
    expect(externalTargeting({ allProjectContractors: true }, null)).toEqual({ mode: 'project' });
  });

  it('falls back to the entity scope and never targets internal-only entities', () => {
    expect(externalTargeting({}, { vendorId: V2, subcontractAgreementId: A1 })).toEqual({
      mode: 'targets',
      targets: [{ vendorId: V2, agreementId: A1 }],
    });
    expect(externalTargeting({ vendorId: V1 }, { internalOnly: true })).toEqual({ mode: 'none' });
    expect(externalTargeting({ vendorId: V1, internalOnly: true }, null)).toEqual({ mode: 'none' });
    expect(externalTargeting({}, null)).toEqual({ mode: 'none' });
  });

  it('reads uuid lists and short references from payloads', () => {
    expect(payloadIds({ a: U1, b: [U2, 'x', U1] }, ['a', 'b'])).toEqual([U1, U2]);
    expect(payloadReference({ reference: 42 })).toBe('42');
    expect(payloadReference({ reference: 'x'.repeat(200) })!.length).toBe(80);
    expect(payloadReference({ amount: 100 })).toBeNull();
  });
});

describe('consumer backoff', () => {
  it('grows exponentially and caps at six hours', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(480_000);
    expect(retryDelayMs(20)).toBe(6 * 60 * 60 * 1000);
    const now = new Date('2026-10-03T10:00:00Z');
    expect(nextAttemptAt(1, now).toISOString()).toBe('2026-10-03T10:00:30.000Z');
  });

  it('parks events after the maximum attempts and truncates errors', () => {
    expect(isDeadLettered(DG_MAX_ATTEMPTS - 1)).toBe(false);
    expect(isDeadLettered(DG_MAX_ATTEMPTS)).toBe(true);
    expect(describeConsumerError(new Error('x'.repeat(5000)))).toHaveLength(1000);
    expect(describeConsumerError('boom')).toBe('boom');
  });
});

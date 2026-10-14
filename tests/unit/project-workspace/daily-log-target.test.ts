import { describe, expect, it } from 'vitest';
import {
  resolveDailyLogHref,
  resolveDailyLogTargetKind,
} from '@/modules/project-workspace/domain/daily-log-target';

describe('resolveDailyLogTarget', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';

  it('routes GC projects to site log', () => {
    expect(
      resolveDailyLogTargetKind({
        deliveryProfile: { operatingRoles: ['developer', 'general_contractor'] },
        modules: { field_ops: true },
        projectId,
      }),
    ).toBe('site_log');
    expect(
      resolveDailyLogHref({
        deliveryProfile: { operatingRoles: ['developer', 'general_contractor'] },
        modules: { field_ops: true },
        projectId,
      }),
    ).toBe(`/projects/${projectId}/site-log`);
  });

  it('routes non-GC with field_ops to field ops log new', () => {
    expect(
      resolveDailyLogTargetKind({
        deliveryProfile: { operatingRoles: ['subcontractor'] },
        modules: { field_ops: true },
        projectId,
      }),
    ).toBe('field_ops');
  });

  it('returns null when field_ops module off and not GC', () => {
    expect(
      resolveDailyLogTargetKind({
        deliveryProfile: { operatingRoles: ['subcontractor'] },
        modules: { field_ops: false },
        projectId,
      }),
    ).toBeNull();
  });
});

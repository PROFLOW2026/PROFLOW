import { describe, expect, it, vi } from 'vitest';
import { businessDate } from '@/shared/dates';
import { latestCompletedMonth } from '@/modules/command-center/data/collect-monthly-workforce-report';
import { buildItemKey } from '@/modules/command-center/domain/ranking';

vi.mock('@/modules/generated-documents/application/list-artifacts', () => ({
  listGeneratedArtifacts: vi.fn(),
}));

vi.mock('@/modules/generated-documents/application/resolve-binding', () => ({
  resolveGeneratedDocumentBinding: vi.fn().mockResolvedValue({
    ownerType: 'organization',
    ownerId: 'org-1',
    sourceEntityId: 'org-1',
  }),
}));

vi.mock('@/modules/command-center/application/update-item-state', () => ({
  updateCommandCenterItemState: vi.fn(),
}));

describe('monthly workforce notification', () => {
  it('uses stable item key monthly_workforce_report_ready:YYYY-MM', () => {
    expect(buildItemKey('monthly_workforce_report_ready', '2026-08')).toBe(
      'monthly_workforce_report_ready:2026-08',
    );
  });

  it('latestCompletedMonth tracks previous calendar month', () => {
    expect(latestCompletedMonth(businessDate('2026-09-03'))).toBe('2026-08');
  });
});

describe('markMonthlyWorkforceReportNotificationHandled', () => {
  it('calls updateCommandCenterItemState with handled', async () => {
    const { markMonthlyWorkforceReportNotificationHandled } = await import(
      '@/modules/generated-documents/application/resolve-monthly-notification'
    );
    const { updateCommandCenterItemState } = await import(
      '@/modules/command-center/application/update-item-state'
    );

    await markMonthlyWorkforceReportNotificationHandled(
      { userId: 'u1' } as never,
      '2026-08',
    );

    expect(updateCommandCenterItemState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceType: 'monthly_workforce_report_ready',
        sourceId: '2026-08',
        state: 'handled',
        itemKey: 'monthly_workforce_report_ready:2026-08',
      }),
    );
  });
});

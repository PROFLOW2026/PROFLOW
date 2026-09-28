import { describe, expect, it, vi } from 'vitest';
import type * as NotificationsRepository from '@/modules/notifications/data/notifications.repository';

const resolveNotificationsAsSystem = vi.fn<
  typeof NotificationsRepository.resolveNotificationsAsSystem
>();

vi.mock('@/modules/notifications/data/notifications.repository', () => ({
  resolveNotificationsAsSystem: (...args: Parameters<typeof resolveNotificationsAsSystem>) =>
    resolveNotificationsAsSystem(...args),
}));

describe('resolveCaptureReviewNotifications', () => {
  it('resolves capture_needs_review for all org recipients via system path', async () => {
    resolveNotificationsAsSystem.mockResolvedValue(2);
    const { resolveCaptureReviewNotifications } = await import(
      '@/modules/quick-capture/application/resolve-capture-review-notifications'
    );

    const count = await resolveCaptureReviewNotifications(
      { organizationId: 'org-1' } as never,
      'capture-1',
    );

    expect(count).toBe(2);
    expect(resolveNotificationsAsSystem).toHaveBeenCalledWith(
      'org-1',
      'capture_needs_review',
      'capture-1',
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';

vi.mock('@/modules/command-center/application/get-actionable-inbox', () => ({
  getActionableInbox: vi.fn(),
}));

vi.mock('@/modules/notifications', () => ({
  runNotificationScan: vi.fn(),
}));

import { getTodayInbox } from '@/modules/command-center/application/get-today-inbox';
import { getActionableInbox } from '@/modules/command-center/application/get-actionable-inbox';
import { runNotificationScan } from '@/modules/notifications';

const inbox = {
  items: [],
  totalActive: 0,
  hiddenByState: 1,
};

describe('getTodayInbox', () => {
  beforeEach(() => {
    vi.mocked(getActionableInbox).mockReset();
    vi.mocked(getActionableInbox).mockResolvedValue(inbox);
    vi.mocked(runNotificationScan).mockReset();
  });

  it('returns the actionable inbox without an inline notification scan', async () => {
    const result = await getTodayInbox({} as OrgContext);

    expect(result).toBe(inbox);
    expect(getActionableInbox).toHaveBeenCalledOnce();
    expect(runNotificationScan).not.toHaveBeenCalled();
  });
});

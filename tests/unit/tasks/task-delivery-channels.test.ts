import { describe, expect, it } from 'vitest';
import { resolveTaskDeliveryChannelStatus } from '@/modules/tasks/domain/task-delivery-channels';

describe('resolveTaskDeliveryChannelStatus (P05)', () => {
  it('keeps email and push disconnected by default', () => {
    expect(resolveTaskDeliveryChannelStatus({ taskEmailDeliveryEnabled: false })).toEqual({
      email: 'disconnected',
      push: 'disconnected',
    });
  });

  it('allows email only when TASK delivery flag is explicitly enabled', () => {
    expect(resolveTaskDeliveryChannelStatus({ taskEmailDeliveryEnabled: true })).toEqual({
      email: 'connected',
      push: 'disconnected',
    });
  });
});

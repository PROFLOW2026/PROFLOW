import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  listActiveOrganizationIds: vi.fn(),
  findActiveOrgOwnerUserId: vi.fn(),
  listPendingWebhookDeliveries: vi.fn(),
  deliverPendingWebhook: vi.fn(),
}));

vi.mock('@/shared/db/client', () => ({
  getAdminDb: () => ({}),
  withUserContext: async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

vi.mock('@/modules/tenancy', () => ({
  listActiveOrganizationIds: mocks.listActiveOrganizationIds,
  resolveOrgContext: vi.fn(async () => ({
    organizationId: 'org-1',
    db: {},
  })),
}));

vi.mock('@/modules/recurring-drafts/application/ops-worker', () => ({
  findActiveOrgOwnerUserId: mocks.findActiveOrgOwnerUserId,
}));

vi.mock('@/modules/api/data/api.repository', () => ({
  listPendingWebhookDeliveries: mocks.listPendingWebhookDeliveries,
}));

vi.mock('@/modules/api/application/manage-api', () => ({
  deliverPendingWebhook: mocks.deliverPendingWebhook,
}));

import {
  isWebhookDeliveryOpsEnabled,
  runWebhookDeliveryOpsWorker,
} from '@/modules/api/application/webhook-delivery-ops-worker';
import { resetServerEnvCache } from '@/shared/env/server';

describe('webhook-delivery-ops-worker', () => {
  beforeEach(() => {
    delete process.env.APP_ENV;
    resetServerEnvCache();
    delete process.env.WEBHOOK_DELIVERY_ENABLED;
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetServerEnvCache();
  });

  it('is disabled when WEBHOOK_DELIVERY_ENABLED is unset', () => {
    expect(isWebhookDeliveryOpsEnabled()).toBe(false);
  });

  it('returns no-op payload when delivery is disabled', async () => {
    const result = await runWebhookDeliveryOpsWorker();
    expect(result.enabled).toBe(false);
    expect(result.deliveriesAttempted).toBe(0);
    expect(mocks.listActiveOrganizationIds).not.toHaveBeenCalled();
  });

  it('attempts pending deliveries per org when enabled', async () => {
    process.env.WEBHOOK_DELIVERY_ENABLED = 'true';
    resetServerEnvCache();

    mocks.listActiveOrganizationIds.mockResolvedValue([{ id: 'org-1', defaultLocale: 'en' }]);
    mocks.findActiveOrgOwnerUserId.mockResolvedValue({ userId: 'owner-1' });
    mocks.listPendingWebhookDeliveries.mockResolvedValue([{ id: 'del-1', status: 'pending' }]);
    mocks.deliverPendingWebhook.mockResolvedValue({ id: 'del-1', status: 'delivered' });

    const result = await runWebhookDeliveryOpsWorker();
    expect(result.enabled).toBe(true);
    expect(result.deliveriesAttempted).toBe(1);
    expect(result.delivered).toBe(1);
    expect(mocks.deliverPendingWebhook).toHaveBeenCalledWith(expect.anything(), 'del-1');
  });
});

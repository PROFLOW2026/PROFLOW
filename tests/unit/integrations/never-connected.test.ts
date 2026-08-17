import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  UnconfiguredAccountingAdapter,
  assertIntegrationNotConnected,
  getAccountingAdapter,
  unconfiguredCapabilities,
} from '@/modules/integrations';

describe('integrations never report connected', () => {
  it('forbids connected and similar live statuses', () => {
    expect(() => assertIntegrationNotConnected('connected')).toThrow(DomainRuleError);
    expect(() => assertIntegrationNotConnected('synced')).toThrow(DomainRuleError);
    expect(() => assertIntegrationNotConnected('authorized')).toThrow(DomainRuleError);
  });

  it('allows only unconfigured, disconnected, and error', () => {
    expect(assertIntegrationNotConnected('unconfigured')).toBeUndefined();
    expect(assertIntegrationNotConnected('disconnected')).toBeUndefined();
    expect(assertIntegrationNotConnected('error')).toBeUndefined();
  });

  it('default adapter is unconfigured with all capabilities off', async () => {
    const adapter = getAccountingAdapter();
    expect(adapter).toBeInstanceOf(UnconfiguredAccountingAdapter);
    expect(adapter.isConfigured()).toBe(false);
    const status = adapter.getStatus();
    expect(status.connected).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.status).toBe('unconfigured');
    expect(status.capabilities).toEqual(unconfiguredCapabilities());
    const test = await adapter.testConnection();
    expect(test.ok).toBe(false);
    if (!test.ok) expect(test.errorCode).toBe('not_configured');
    const exportResult = await adapter.exportInvoice();
    expect(exportResult.ok).toBe(false);
  });
});

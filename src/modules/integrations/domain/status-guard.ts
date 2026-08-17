import { DomainRuleError } from '@/shared/errors';
import {
  DISABLED_ACCOUNTING_CAPABILITIES,
  INTEGRATION_STATUSES,
  type AccountingCapabilities,
  type IntegrationStatus,
} from './types';

const FORBIDDEN_CONNECTED_LABELS = new Set([
  'connected',
  'active',
  'synced',
  'authorized',
  'live',
]);

export function isAllowedIntegrationStatus(value: string): value is IntegrationStatus {
  return (INTEGRATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Status check for this execution: `connected` is forbidden even if a caller
 * tries to stamp it. Schema only allows unconfigured | disconnected | error.
 */
export function assertIntegrationNotConnected(status: string): asserts status is IntegrationStatus {
  if (FORBIDDEN_CONNECTED_LABELS.has(status) || status === 'connected') {
    throw new DomainRuleError(
      'Accounting integrations are not connected in this execution',
      'integrations.errors.neverConnected',
      { status },
    );
  }
  if (!isAllowedIntegrationStatus(status)) {
    throw new DomainRuleError(
      'Unknown integration status',
      'integrations.errors.neverConnected',
      { status },
    );
  }
}

export function normalizeStoredIntegrationStatus(status: string | null | undefined): IntegrationStatus {
  const value = status ?? 'unconfigured';
  assertIntegrationNotConnected(value);
  return value;
}

export function unconfiguredCapabilities(): AccountingCapabilities {
  return { ...DISABLED_ACCOUNTING_CAPABILITIES };
}

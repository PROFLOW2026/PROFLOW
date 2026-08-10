import { describe, expect, it } from 'vitest';
import {
  INVOICING_INTEGRATION_PERSISTENCE_READY,
  areInvoicingIntegrationTablesAvailable,
  isStatutoryInvoicingFeatureEnabled,
} from '@/modules/invoicing-integration';
import {
  OPS_FINANCE_PERSISTENCE_READY,
  areOpsFinanceLinksAvailable,
} from '@/modules/ops-finance';
import {
  PORTAL_CANDIDATES_PERSISTENCE_READY,
  arePortalCandidatesAvailable,
  isExternalPublicAccessEnabled,
} from '@/modules/portal';

describe('post-0020 persistence readiness defaults', () => {
  it('enables durable gates after owner applied 0020', () => {
    expect(OPS_FINANCE_PERSISTENCE_READY).toBe(true);
    expect(areOpsFinanceLinksAvailable()).toBe(true);
    expect(INVOICING_INTEGRATION_PERSISTENCE_READY).toBe(true);
    expect(areInvoicingIntegrationTablesAvailable()).toBe(true);
    expect(PORTAL_CANDIDATES_PERSISTENCE_READY).toBe(true);
    expect(arePortalCandidatesAvailable()).toBe(true);
  });

  it('does not fake statutory provider or public portal login', () => {
    expect(isStatutoryInvoicingFeatureEnabled()).toBe(false);
    expect(isExternalPublicAccessEnabled()).toBe(false);
  });
});

import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isOcrIngestionEnabled } from '@/modules/ocr/domain/feature-gate';
import type { ExpenseIngestionProvider } from '../domain/types';
import { upsertOrgExpenseIngestionSettings } from '../data/settings.repository';
import { resolveSumitHttpClientForOrg } from './resolve-sumit-client';

export async function updateExpenseIngestionSettings(
  context: OrgContext,
  provider: ExpenseIngestionProvider,
) {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  if (provider === 'sumit') {
    const client = await resolveSumitHttpClientForOrg(context);
    if (!client) {
      throw new DomainRuleError(
        'Connect SUMIT before enabling expense ingestion',
        'invoicingIntegration.errors.connectionRequired',
      );
    }
    if (!isOcrIngestionEnabled()) {
      throw new DomainRuleError(
        'OCR ingestion must be enabled before SUMIT expense capture',
        'expenses.received.errors.ocrRequired',
      );
    }
  }
  return upsertOrgExpenseIngestionSettings(context, { provider });
}

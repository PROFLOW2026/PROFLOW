import 'server-only';
import { cache } from 'react';
import { withOrgContext } from '@/shared/auth/session';
import { getProjectFinancials } from './get-project-financials';

/**
 * Request-scoped project financials (React `cache` only - not cross-request).
 *
 * Financials panel, Overview snapshot, and Budget panel can otherwise each
 * call `withOrgContext` + `getProjectFinancials` in the same RSC request.
 * Formulas stay in `getProjectFinancials` / compose; this only dedupes the
 * in-request round trip.
 */
export const loadCachedProjectFinancials = cache(async (projectId: string) =>
  withOrgContext((context) => getProjectFinancials(context, projectId)),
);

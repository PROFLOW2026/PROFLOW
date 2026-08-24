import 'server-only';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadCachedProjectFinancials } from '../application/load-cached-project-financials';
import { ProjectFinancialsSnapshotView } from './project-financials-snapshot-view';

/**
 * Compact financial snapshot for Overview. Kept off the full Financials panel
 * module graph so open-project does not pull cash-flow / KPI client trees.
 */
export async function ProjectFinancialsSnapshot({ projectId }: { readonly projectId: string }) {
  const [financials, perms] = await Promise.all([
    loadCachedProjectFinancials(projectId).catch(() => null),
    withOrgContext(async (context) => {
      if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) {
        return null;
      }
      return { canReadProfit: hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ) };
    }),
  ]);

  if (!financials || !perms) {
    return null;
  }

  const t = await getTranslations('financial');

  return (
    <ProjectFinancialsSnapshotView
      financials={financials}
      canReadProfit={perms.canReadProfit}
      t={t}
    />
  );
}

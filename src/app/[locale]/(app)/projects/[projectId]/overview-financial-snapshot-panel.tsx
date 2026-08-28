import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonText } from '@/components/ui/skeleton';
import { ProjectFinancialsSnapshotView } from '@/modules/financials/ui/project-financials-snapshot-view';
import { loadCachedProjectFinancials } from '@/modules/financials/application/load-cached-project-financials';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export function OverviewFinancialSnapshotFallback() {
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-2">
        <SkeletonText className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <SkeletonText className="h-4 w-full" />
        <SkeletonText className="h-4 w-3/4" />
        <SkeletonText className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

export async function OverviewFinancialSnapshotPanel({ projectId }: { projectId: string }) {
  const [tOverview, tFinancial, financials, canReadProfit] = await Promise.all([
    getTranslations('projects.overview'),
    getTranslations('financial'),
    loadCachedProjectFinancials(projectId).catch(() => null),
    withOrgContext(async (context) =>
      hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ),
    ).catch(() => false),
  ]);

  if (!financials) return null;

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{tOverview('financialSnapshot')}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
        <ProjectFinancialsSnapshotView
          financials={financials}
          canReadProfit={canReadProfit}
          t={(key) => tFinancial(key as never)}
        />
      </CardContent>
    </Card>
  );
}

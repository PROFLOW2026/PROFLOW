import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listCloseoutStatusesForProjects } from '@/modules/closeout';
import { listCommunications } from '@/modules/communications';
import { listProjectWarrantyCoverages } from '@/modules/warranty';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

interface OverviewNextGenProps {
  projectId: string;
  canReadFinancials: boolean;
}

export async function OverviewNextGenPanel({ projectId, canReadFinancials }: OverviewNextGenProps) {
  const t = await getTranslations('projects.nextGen');

  const snapshot = await withOrgContext(async (context) => {
    const canReadCommunications = hasPermission(context, PERMISSIONS.COMMUNICATIONS_READ);
    const empty = {
      closeoutStatus: null as string | null,
      warrantyCount: 0,
      communicationCount: 0,
      canReadCommunications,
    };

    try {
      const [closeoutRows, warranty, communications] = await Promise.all([
        listCloseoutStatusesForProjects(context, [projectId]).catch(() => []),
        listProjectWarrantyCoverages(context, projectId).catch(() => ({ coverages: [] })),
        canReadCommunications
          ? listCommunications(context, { projectId, limit: 20 }).catch(() => [])
          : Promise.resolve([]),
      ]);

      return {
        closeoutStatus: closeoutRows.find((row) => row.projectId === projectId)?.status ?? null,
        warrantyCount: warranty.coverages.filter((coverage) => coverage.status !== 'void').length,
        communicationCount: communications.length,
        canReadCommunications,
      };
    } catch {
      return empty;
    }
  }).catch(() => ({
    closeoutStatus: null as string | null,
    warrantyCount: 0,
    communicationCount: 0,
    canReadCommunications: false,
  }));

  const closeoutLabel =
    snapshot.closeoutStatus === 'ready'
      ? t('closeoutReady')
      : snapshot.closeoutStatus === 'closed'
        ? t('closeoutClosed')
        : snapshot.closeoutStatus === 'reopened'
          ? t('closeoutReopened')
          : snapshot.closeoutStatus === 'open'
            ? t('closeoutOpen')
            : t('closeoutEmpty');

  return (
    <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle>{t('closeout')}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
          <p>{closeoutLabel}</p>
          <Link href={`/projects/${projectId}?tab=closeout`} className={cn(textNavLinkClassName, 'text-sm')}>
            {t('openCloseout')}
          </Link>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full">
        <CardHeader>
          <CardTitle>{t('warranty')}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
          {snapshot.warrantyCount > 0 ? (
            <p>{t('warrantyCount', { count: snapshot.warrantyCount })}</p>
          ) : (
            <p>{t('warrantyEmpty')}</p>
          )}
          <Link href={`/projects/${projectId}?tab=warranty`} className={cn(textNavLinkClassName, 'text-sm')}>
            {t('openWarranty')}
          </Link>
        </CardContent>
      </Card>

      {snapshot.canReadCommunications ? (
        <Card className="min-w-0 max-w-full">
          <CardHeader>
            <CardTitle>{t('communications')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-2 text-sm">
            {snapshot.communicationCount > 0 ? (
              <p>{snapshot.communicationCount}</p>
            ) : (
              <p>{t('communicationsEmpty')}</p>
            )}
            <Link
              href={`/communications?projectId=${projectId}`}
              className={cn(textNavLinkClassName, 'text-sm')}
            >
              {t('communicationsOpen')}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {canReadFinancials ? (
        <Card className="min-w-0 max-w-full">
          <CardHeader>
            <CardTitle>{t('cashFlow')}</CardTitle>
            <CardDescription>{t('cashFlowHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/cash-flow" className={cn(textNavLinkClassName, 'text-sm')}>
              {t('cashFlow')}
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

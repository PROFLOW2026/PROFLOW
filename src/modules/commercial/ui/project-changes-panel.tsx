import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { listProjectChangeRequests, getProjectCommercialSummary } from '../application/queries';
import { ChangeRequestList } from './change-request-list';
import { CommercialSummaryCard } from './commercial-summary-card';

export interface ProjectChangesPanelProps {
  projectId: string;
}

/**
 * Embeddable server component for the project workspace Changes tab (decision U3).
 *
 * The panel resolves its own context rather than receiving one: an `OrgContext`
 * is bound to the transaction that produced it, so passing one across a
 * component boundary would hand this component a closed transaction.
 */
export async function ProjectChangesPanel({ projectId }: ProjectChangesPanelProps) {
  const t = await getTranslations('changes');

  const { items, summary, canManage } = await withOrgContext(async (context) => {
    const [changeRequests, commercialSummary] = await Promise.all([
      listProjectChangeRequests(context, projectId),
      getProjectCommercialSummary(context, projectId),
    ]);

    return {
      items: changeRequests,
      summary: commercialSummary,
      canManage: hasPermission(context, PERMISSIONS.CHANGES_MANAGE),
    };
  });

  const listItems = items.map((item) => ({ ...item, projectName: '' }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('panel.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.description')}</p>
        </div>
        {canManage ? (
          <Button asChild size="sm">
            <Link href={`/changes/new?projectId=${projectId}`}>
              <Plus aria-hidden />
              {t('panel.new')}
            </Link>
          </Button>
        ) : null}
      </div>

      {summary ? (
        <CommercialSummaryCard position={summary.position} currency={summary.currency} />
      ) : null}

      <ChangeRequestList items={listItems} projectId={projectId} canManage={canManage} />
    </div>
  );
}

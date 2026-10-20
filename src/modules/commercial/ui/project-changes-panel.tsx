import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MainAppSection } from '@/components/patterns/main-app';
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
    <div className="flex w-full min-w-0 flex-col gap-4">
      <MainAppSection
        title={t('panel.title')}
        description={t('panel.description')}
        actions={
          canManage ? (
            <Button asChild size="sm" className="max-w-full shrink-0">
              <Link href={`/changes/new?projectId=${projectId}`}>
                <Plus aria-hidden />
                {t('panel.new')}
              </Link>
            </Button>
          ) : undefined
        }
        className="w-full min-w-0"
      >
        {null}
      </MainAppSection>

      {summary ? (
        <MainAppSection className="w-full min-w-0">
          <CommercialSummaryCard position={summary.position} currency={summary.currency} />
        </MainAppSection>
      ) : null}

      <MainAppSection className="w-full min-w-0">
        <ChangeRequestList items={listItems} projectId={projectId} canManage={canManage} />
      </MainAppSection>
    </div>
  );
}

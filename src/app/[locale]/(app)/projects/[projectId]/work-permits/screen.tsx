import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { ClipboardCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { listProjectWorkPermits } from '@/modules/work-permits';
import { workPermitStatusShape } from '@/modules/work-permits/ui/status-shape';
import { WorkPermitCreateForm } from '@/modules/work-permits/ui/work-permit-create-form';
import { WorkPermitRowActions } from '@/modules/work-permits/ui/work-permit-row-actions';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectWorkPermitsScreen({
  surfaceRoot,
  params,
  searchParams,
}: {
  surfaceRoot?: string;
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const wantsCreate = query.new === '1';
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('workPermits');
  const base = `${surfaceRoot ?? `/projects/${projectId}`}/work-permits`;

  const board = await withOrgContext(async (context) => {
    try {
      return await listProjectWorkPermits(context, { projectId, limit: 200 });
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  });
  if (!board) notFound();

  return (
    <WithAppClientMessages extra={['workPermits']}>
      <MainAppPage>
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            board.canManage ? (
              <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>
                {t('create.action')}
              </Link>
            ) : undefined
          }
        />
        <MainAppSection>
          {wantsCreate && board.canManage ? <WorkPermitCreateForm projectId={projectId} cancelHref={base} /> : null}

          {board.items.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title={t('empty.title')} description={t('empty.description')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {board.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-[var(--pf-text-muted)]">
                      {item.permitType}
                      {item.validFrom ? ` · ${item.validFrom}` : ''}
                      {item.validUntil ? ` – ${item.validUntil}` : ''}
                    </p>
                    {item.notes ? <p className="mt-1 text-[var(--pf-text-secondary)]">{item.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={t(`status.${item.status}`)} shape={workPermitStatusShape(item.status)} />
                    {board.canManage ? (
                      <WorkPermitRowActions projectId={projectId} workPermitId={item.id} status={item.status} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </MainAppSection>
      </MainAppPage>
    </WithAppClientMessages>
  );
}

export default function ProjectWorkPermitsPage(
  props: Omit<Parameters<typeof ProjectWorkPermitsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectWorkPermitsScreen {...props} />;
}

import { Truck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listProjectDeliveries, OPEN_DELIVERY_STATES } from '@/modules/deliveries';
import { deliveryStateShape } from '@/modules/deliveries/ui';
import { DeliveryCreateForm } from '@/modules/deliveries/ui/delivery-create-form';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { cn } from '@/shared/ui/cn';

export async function ProjectDeliveriesScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ scope?: string; new?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const scope = query.scope === 'all' ? 'all' : 'open';
  const wantsCreate = query.new === '1';
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('deliveries');
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/deliveries`;

  const board = await withOrgContext((context) =>
    listProjectDeliveries(context, {
      projectId,
      states: scope === 'open' ? OPEN_DELIVERY_STATES : undefined,
      limit: 200,
    }),
  );

  const tabClass = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium',
      active
        ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]'
        : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-hover)]',
    );

  return (
    <WithAppClientMessages extra={['deliveries']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            board.canManage ? (
              <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>
                {t('create.title')}
              </Link>
            ) : undefined
          }
        />

        {wantsCreate && board.canManage ? <DeliveryCreateForm projectId={projectId} cancelHref={base} /> : null}

        <nav className="flex gap-1" aria-label={t('title')}>
          <Link href={base} className={tabClass(scope === 'open')} aria-current={scope === 'open' ? 'page' : undefined}>
            {t('filters.open')}
          </Link>
          <Link
            href={`${base}?scope=all`}
            className={tabClass(scope === 'all')}
            aria-current={scope === 'all' ? 'page' : undefined}
          >
            {t('filters.all')}
          </Link>
        </nav>

        {board.items.length === 0 ? (
          <EmptyState icon={Truck} title={t('empty.title')} description={t('empty.description')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {board.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{item.itemName}</p>
                  <p className="text-[var(--pf-text-muted)]">
                    {item.vendorName ?? t('fields.unassigned')}
                    {item.expectedDate ? ` · ${item.expectedDate}` : ''}
                  </p>
                </div>
                <StatusBadge label={t(`state.${item.state}`)} shape={deliveryStateShape(item.state, item.delayed)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithAppClientMessages>
  );
}

export default function ProjectDeliveriesPage(
  props: Omit<Parameters<typeof ProjectDeliveriesScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectDeliveriesScreen {...props} />;
}

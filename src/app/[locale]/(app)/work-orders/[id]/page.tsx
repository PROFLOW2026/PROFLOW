import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { ProjectFinancialsPanel } from '@/modules/financials/ui/project-financials-panel';
import { ProjectFormsPanel } from '@/modules/forms/ui';
import { getWorkOrderDetail } from '@/modules/service';
import { WorkOrderStatusBadge } from '@/modules/service/ui/work-order-status-badge';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { WorkOrderDetailForm } from './work-order-detail-form';
import { WorkOrderStatusForm } from './work-order-status-form';

interface WorkOrderPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: WorkOrderPageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'service' });
  try {
    const detail = await withOrgContext((context) => getWorkOrderDetail(context, id));
    return { title: detail.project.name };
  } catch {
    return { title: t('workspace.fallbackTitle') };
  }
}

function toDatetimeLocalValue(value: Date | null): string {
  if (!value) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export default async function WorkOrderDetailPage({ params }: WorkOrderPageProps) {
  const { id } = await params;
  const [t, shell] = await Promise.all([getTranslations('service'), getShellContext()]);

  const detail = await withOrgContext((context) => getWorkOrderDetail(context, id)).catch(
    () => null,
  );
  if (!detail) notFound();

  const { project, service, clientName } = detail;
  const canManage = shell?.permissions.has(PERMISSIONS.SERVICE_MANAGE) ?? false;
  const canReadFinancials =
    (shell?.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      shell?.permissions.has(PERMISSIONS.CONTRACTS_READ)) ??
    false;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={project.name}
        description={clientName ?? undefined}
        actions={
          <WorkOrderStatusBadge
            status={service.serviceStatus}
            label={t(`status.${service.serviceStatus}`)}
          />
        }
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/work-orders" className={cn(textNavLinkClassName)}>
          {t('workspace.backToList')}
        </Link>
        <Link href="/dispatch" className={cn(textNavLinkClassName)}>
          {t('workspace.openDispatch')}
        </Link>
      </div>

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('workspace.sameEngineHint')}</p>

      {canManage ? (
        <WorkOrderStatusForm workOrderId={id} currentStatus={service.serviceStatus} />
      ) : null}

      {canManage ? (
        <WorkOrderDetailForm
          workOrderId={id}
          initial={{
            name: project.name,
            description: project.description ?? '',
            siteAddress: service.siteAddress ?? project.location ?? '',
            contactName: service.contactName ?? '',
            contactPhone: service.contactPhone ?? '',
            category: service.category ?? '',
            priority: service.priority,
            requestedDate: service.requestedDate ?? '',
            scheduledStartAt: toDatetimeLocalValue(service.scheduledStartAt),
            scheduledEndAt: toDatetimeLocalValue(service.scheduledEndAt),
            serviceNotes: service.notes ?? '',
            notes: project.notes ?? '',
            serviceStatus: service.serviceStatus,
          }}
        />
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.site')}</dt>
            <dd>{service.siteAddress ?? project.location ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.priority')}</dt>
            <dd>{t(`priority.${service.priority}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.contact')}</dt>
            <dd>
              {service.contactName ?? '—'}
              {service.contactPhone ? ` · ${service.contactPhone}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.window')}</dt>
            <dd className="pf-ltr-island" dir="ltr">
              {service.scheduledStartAt
                ? service.scheduledStartAt.toISOString().slice(0, 16).replace('T', ' ')
                : '—'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.notes')}</dt>
            <dd className="whitespace-pre-wrap">{service.notes ?? project.notes ?? '—'}</dd>
          </div>
        </dl>
      )}

      {shell?.modules.forms ? (
        <section className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
          <Suspense fallback={<p className="text-sm text-[var(--pf-text-muted)]">…</p>}>
            <ProjectFormsPanel ownerType="work_order" ownerId={id} />
          </Suspense>
        </section>
      ) : null}

      {canReadFinancials ? (
        <section className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
          <h2 className="text-base font-semibold">{t('workspace.financialsTitle')}</h2>
          <Suspense fallback={<p className="text-sm text-[var(--pf-text-muted)]">…</p>}>
            <ProjectFinancialsPanel projectId={id} />
          </Suspense>
        </section>
      ) : null}
    </div>
  );
}

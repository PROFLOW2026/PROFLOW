import type { Metadata } from 'next';
import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { ProjectFinancialsPanel } from '@/modules/financials/ui/project-financials-panel';
import { ProjectFormsPanel } from '@/modules/forms/ui';
import {
  getWorkOrderBillingLink,
  getWorkOrderChecklistGateState,
  getWorkOrderDetail,
  listWorkOrderChecklistTemplateOptions,
} from '@/modules/service';
import { WorkOrderChecklistCard } from '@/modules/service/ui/work-order-checklist-panel';
import { WorkOrderStatusBadge } from '@/modules/service/ui/work-order-status-badge';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { WorkOrderDetailForm } from './work-order-detail-form';
import { WorkOrderStatusForm } from './work-order-status-form';
import { WorkOrderBillingForm } from './work-order-billing-form';
import { WorkOrderLinkedTasksSection } from '@/modules/service/ui/work-order-linked-tasks-section';
import { PROJECT_CAPABILITIES, assertProjectCapability } from '@/modules/project-team';

const EMPTY = '—';

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
  const [t, tFinancial, shell] = await Promise.all([
    getTranslations('service'),
    getTranslations('financial'),
    getShellContext(),
  ]);

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
  const canBill =
    canManage && (shell?.permissions.has(PERMISSIONS.BILLING_MANAGE) ?? false);

  const billingLink = await withOrgContext((context) => getWorkOrderBillingLink(context, id)).catch(
    () => null,
  );

  const canLinkTasks =
    (shell?.permissions.has(PERMISSIONS.TASKS_READ) ?? false) &&
    (await withOrgContext(async (context) => {
      try {
        await assertProjectCapability(context, id, PROJECT_CAPABILITIES.TASKS_MANAGE);
        return true;
      } catch {
        return false;
      }
    }).catch(() => false));

  const [checklistState, checklistTemplates] = await withOrgContext(async (context) => {
    const [gate, templates] = await Promise.all([
      getWorkOrderChecklistGateState(context, {
        workOrderId: id,
        checklistTemplateId: service.checklistTemplateId,
      }),
      canManage
        ? listWorkOrderChecklistTemplateOptions(context).catch(() => [])
        : Promise.resolve([]),
    ]);
    return [gate, templates] as const;
  }).catch(
    () =>
      [
        {
          required: Boolean(service.checklistTemplateId),
          satisfied: !service.checklistTemplateId,
          templateId: service.checklistTemplateId,
          templateName: null,
          fillHref: null,
          canSubmit: false,
          submissionStatus: null,
        },
        [] as { id: string; name: string }[],
      ] as const,
  );

  const siteLabel = service.siteAddress ?? project.location ?? EMPTY;
  const contactLabel = service.contactName
    ? `${service.contactName}${service.contactPhone ? ` · ${service.contactPhone}` : ''}`
    : EMPTY;
  const windowLabel = service.scheduledStartAt
    ? service.scheduledStartAt.toISOString().slice(0, 16).replace('T', ' ')
    : EMPTY;

  return (
    <MainAppPage>
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

      <MainAppSection>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/work-orders" className={cn(textNavLinkClassName)}>
            {t('workspace.backToList')}
          </Link>
          <Link href="/dispatch" className={cn(textNavLinkClassName)}>
            {t('workspace.openDispatch')}
          </Link>
          <Link href="/field" className={cn(textNavLinkClassName)}>
            {t('workspace.openField')}
          </Link>
          <Link href={`/expenses/new?projectId=${id}`} className={cn(textNavLinkClassName)}>
            {t('workspace.openExpenses')}
          </Link>
          <Link href="/workforce/time" className={cn(textNavLinkClassName)}>
            {t('workspace.openTime')}
          </Link>
          <Link href={`/warranty?workOrderId=${id}`} className={cn(textNavLinkClassName)}>
            {t('workspace.openWarranty')}
          </Link>
        </div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('workspace.sameEngineHint')}</p>
        <MainAppSummaryGrid className="mt-1">
          <MainAppSummaryItem label={t('fields.site')}>{siteLabel}</MainAppSummaryItem>
          <MainAppSummaryItem label={t('fields.priority')}>
            {t(`priority.${service.priority}`)}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('fields.contact')}>{contactLabel}</MainAppSummaryItem>
          <MainAppSummaryItem label={t('fields.window')}>
            <span className="pf-ltr-island" dir="ltr">
              {windowLabel}
            </span>
          </MainAppSummaryItem>
          {service.category ? (
            <MainAppSummaryItem label={t('create.categoryLabel')}>{service.category}</MainAppSummaryItem>
          ) : null}
          {service.requestedDate ? (
            <MainAppSummaryItem label={t('create.requestedDateLabel')}>
              <span className="pf-ltr-island" dir="ltr">
                {service.requestedDate}
              </span>
            </MainAppSummaryItem>
          ) : null}
        </MainAppSummaryGrid>
      </MainAppSection>

      <Suspense fallback={null}>
        <WorkOrderLinkedTasksSection workOrderId={id} canLink={canLinkTasks} />
      </Suspense>

      {canManage ? (
        <MainAppSection title={t('workspace.updateStatus')}>
          <WorkOrderStatusForm
            workOrderId={id}
            currentStatus={service.serviceStatus}
            checklistBlocked={checklistState.required && !checklistState.satisfied}
          />
        </MainAppSection>
      ) : null}

      <MainAppSection title={t('billing.title')}>
        <WorkOrderBillingForm
          workOrderId={id}
          existingBillingRecordId={billingLink?.billingRecordId ?? null}
          existingStatus={billingLink?.status ?? null}
          canBill={canBill}
        />
      </MainAppSection>

      {checklistState.required ? (
        <MainAppSection>
          <WorkOrderChecklistCard workOrderId={id} state={checklistState} />
        </MainAppSection>
      ) : null}

      <MainAppSection title={canManage ? t('list.columns.name') : t('fields.notes')}>
        {canManage ? (
          <WorkOrderDetailForm
            workOrderId={id}
            checklistTemplates={checklistTemplates}
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
              checklistTemplateId: service.checklistTemplateId,
            }}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm">{service.notes ?? project.notes ?? EMPTY}</p>
        )}
      </MainAppSection>

      {shell?.modules.forms ? (
        <MainAppSection>
          <Suspense fallback={<p className="text-sm text-[var(--pf-text-muted)]">…</p>}>
            <ProjectFormsPanel ownerType="work_order" ownerId={id} />
          </Suspense>
        </MainAppSection>
      ) : null}

      {canReadFinancials ? (
        <MainAppSection title={t('workspace.financialsTitle')}>
          {project.pricingMode === 'open' ? (
            <Alert tone="info">
              <p className="font-medium">{t('pricing.priceNotSet')}</p>
              <p className="mt-1 text-muted-foreground">{tFinancial('kpis.priceNotSetHint')}</p>
            </Alert>
          ) : null}
          <Suspense fallback={<p className="text-sm text-[var(--pf-text-muted)]">…</p>}>
            <ProjectFinancialsPanel projectId={id} />
          </Suspense>
        </MainAppSection>
      ) : null}
    </MainAppPage>
  );
}

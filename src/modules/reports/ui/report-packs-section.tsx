'use client';

import { MainAppListToolbar, MainAppSection } from '@/components/patterns/main-app';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReportKind, ReportPackOption } from '../domain/types';
import { ReportDownloadButtons } from './report-download-buttons';

export type { ReportPackOption };

const PROJECT_KINDS: readonly ReportKind[] = [
  'project_status',
  'project_financial_summary',
  'boq_progress',
  'change_order_summary',
  'punch_inspection',
  'vendor_subcontract_summary',
  'project_billing_account',
  'project_billing_plan_status',
  'project_task_status',
];

const CLIENT_KINDS: readonly ReportKind[] = ['client_360'];
const VENDOR_KINDS: readonly ReportKind[] = ['vendor_360', 'subcontract_cash'];
const ORG_KINDS: readonly ReportKind[] = [
  'contract_portfolio',
  'labor_by_period',
  'labor_utilization',
  'retention_schedule',
  'inventory_movement',
  'compliance_expiry',
  'crm_funnel',
  'month_close_completeness',
  'safety_open_actions',
  'overdue_tasks_org',
  'milestone_status',
  'team_workload',
  'portfolio_status',
  'stage_distribution',
  'stale_projects',
  'approval_queue_status',
];

function KindRows({
  kinds,
  entityId,
}: {
  kinds: readonly ReportKind[];
  entityId: string;
}) {
  const t = useTranslations('reports');
  return (
    <ul className="flex w-full min-w-0 list-none flex-col divide-y divide-[var(--pf-border-default)] overflow-hidden rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-0">
      {kinds.map((kind) => (
        <li
          key={kind}
          data-pf-reports-kind-row=""
          className="flex w-full min-w-0 flex-col gap-2 p-3 lg:grid lg:grid-cols-[minmax(10rem,22%)_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
        >
          <p className="min-w-0 text-sm font-medium leading-snug text-[var(--pf-text-primary)]">
            {t(`kinds.${kind}`)}
          </p>
          <p
            className="min-w-0 text-xs leading-snug text-[var(--pf-text-secondary)] sm:line-clamp-2 lg:line-clamp-1"
            title={t(`kindHints.${kind}`)}
          >
            {t(`kindHints.${kind}`)}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            <ReportDownloadButtons kind={kind} id={entityId} compact />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PackEntitySelect({
  label,
  value,
  onValueChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ReportPackOption[];
  placeholder?: string;
}) {
  return (
    <MainAppListToolbar className="w-full sm:items-end">
      <Field label={label} className="min-w-0 w-full max-w-none flex-1">
        {(control) => (
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger id={control.id} className="h-9 w-full min-w-0">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </MainAppListToolbar>
  );
}

export function ReportPacksSection({
  projects,
  quotes,
  clients = [],
  vendors = [],
  organizationId,
  enabledKinds,
  recommendedKinds = [],
  orderedKinds,
}: {
  projects: readonly ReportPackOption[];
  quotes: readonly ReportPackOption[];
  clients?: readonly ReportPackOption[];
  vendors?: readonly ReportPackOption[];
  organizationId?: string;
  enabledKinds: readonly ReportKind[];
  recommendedKinds?: readonly ReportKind[];
  /** When provided, “כל הדוחות” uses this order (recommended first). */
  orderedKinds?: readonly ReportKind[];
}) {
  const t = useTranslations('reports');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [quoteId, setQuoteId] = useState(quotes[0]?.id ?? '');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const enabled = useMemo(() => new Set(enabledKinds), [enabledKinds]);

  const allProjectKinds = useMemo(() => {
    const source = orderedKinds ?? enabledKinds;
    return source.filter(
      (kind) => PROJECT_KINDS.includes(kind) && enabled.has(kind),
    );
  }, [orderedKinds, enabledKinds, enabled]);

  const recommendedProjectKinds = useMemo(
    () =>
      recommendedKinds.filter(
        (kind) => PROJECT_KINDS.includes(kind) && enabled.has(kind),
      ),
    [recommendedKinds, enabled],
  );

  const remainingProjectKinds = useMemo(() => {
    const recommendedSet = new Set(recommendedProjectKinds);
    return allProjectKinds.filter((kind) => !recommendedSet.has(kind));
  }, [allProjectKinds, recommendedProjectKinds]);

  const showSplit =
    recommendedProjectKinds.length > 0 && remainingProjectKinds.length > 0;

  const clientKinds = useMemo(
    () => (orderedKinds ?? enabledKinds).filter((kind) => CLIENT_KINDS.includes(kind) && enabled.has(kind)),
    [orderedKinds, enabledKinds, enabled],
  );
  const vendorKinds = useMemo(
    () => (orderedKinds ?? enabledKinds).filter((kind) => VENDOR_KINDS.includes(kind) && enabled.has(kind)),
    [orderedKinds, enabledKinds, enabled],
  );
  const orgKinds = useMemo(
    () => (orderedKinds ?? enabledKinds).filter((kind) => ORG_KINDS.includes(kind) && enabled.has(kind)),
    [orderedKinds, enabledKinds, enabled],
  );

  return (
    <div data-pf-reports-catalog="" className="flex min-w-0 w-full flex-col gap-4">
      <MainAppSection
        className="w-full"
        title={t('packsHeading')}
        actions={
          <p className="text-end text-xs leading-snug text-[var(--pf-text-secondary)]">
            {t('csvStillHere')}
          </p>
        }
      >
        {projects.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('noProjects')}</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <PackEntitySelect
              label={t('selectProject')}
              value={projectId}
              onValueChange={setProjectId}
              options={projects}
              placeholder={t('chooseProject')}
            />
            {projectId ? (
              showSplit ? (
                <>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--pf-text-primary)]">
                      {t('recommendedPacks')}
                    </h3>
                    <KindRows kinds={recommendedProjectKinds} entityId={projectId} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="mt-2 text-sm font-semibold text-[var(--pf-text-primary)]">
                      {t('allPacks')}
                    </h3>
                    <KindRows
                      kinds={[...recommendedProjectKinds, ...remainingProjectKinds]}
                      entityId={projectId}
                    />
                  </div>
                </>
              ) : (
                <KindRows
                  kinds={
                    recommendedProjectKinds.length > 0
                      ? recommendedProjectKinds
                      : allProjectKinds
                  }
                  entityId={projectId}
                />
              )
            ) : null}
          </div>
        )}
      </MainAppSection>

      {enabled.has('quote_estimate') && quotes.length > 0 ? (
        <MainAppSection className="w-full" title={t('quotePacksHeading')}>
          <div className="flex min-w-0 flex-col gap-4">
            <PackEntitySelect
              label={t('selectQuote')}
              value={quoteId}
              onValueChange={setQuoteId}
              options={quotes}
            />
            {quoteId ? <ReportDownloadButtons kind="quote_estimate" id={quoteId} /> : null}
          </div>
        </MainAppSection>
      ) : null}

      {clientKinds.length > 0 && clients.length > 0 ? (
        <MainAppSection className="w-full" title={t('kinds.client_360')}>
          <div className="flex min-w-0 flex-col gap-4">
            <PackEntitySelect
              label={t('identity.client')}
              value={clientId}
              onValueChange={setClientId}
              options={clients}
            />
            {clientId ? <KindRows kinds={clientKinds} entityId={clientId} /> : null}
          </div>
        </MainAppSection>
      ) : null}

      {vendorKinds.length > 0 && vendors.length > 0 ? (
        <MainAppSection className="w-full" title={t('kinds.vendor_360')}>
          <div className="flex min-w-0 flex-col gap-4">
            <PackEntitySelect
              label={t('fields.vendor')}
              value={vendorId}
              onValueChange={setVendorId}
              options={vendors}
            />
            {vendorId ? <KindRows kinds={vendorKinds} entityId={vendorId} /> : null}
          </div>
        </MainAppSection>
      ) : null}

      {orgKinds.length > 0 && organizationId ? (
        <MainAppSection className="w-full" title={t('allPacks')}>
          <KindRows kinds={orgKinds} entityId={organizationId} />
        </MainAppSection>
      ) : null}
    </div>
  );
}

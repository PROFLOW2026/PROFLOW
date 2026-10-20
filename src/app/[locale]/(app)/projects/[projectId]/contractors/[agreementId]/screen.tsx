import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ActivityFeed } from '@/modules/collaboration/ui';
import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { loadContractor360 } from '@/modules/project-workspace/application/load-contractor-360';
import { AgreementHandoverPanel } from '@/modules/contractor-closeout/ui/agreement-handover-panel';
import { formatRfiNumber } from '@/modules/rfi';
import { formatSubmittalNumber } from '@/modules/submittals';
import { AgreementSubNav } from '@/modules/subcontracts/ui/agreement-nav';
import { ChangesPanel } from '@/modules/subcontracts/ui/changes-panel';
import { AgreementFacts, AgreementValueCard } from '@/modules/subcontracts/ui/lines-panel';
import { loadOrNotFound } from '@/modules/subcontracts/ui/page-guard';
import { AgreementStatusBadge } from '@/modules/subcontracts/ui/status';
import { ClaimStatusBadge } from '@/modules/subcontract-claims/ui/status';
import { withOrgContext } from '@/shared/auth/session';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { Link } from '@/shared/i18n/navigation';
import { bidiIsolate, formatMoneyString } from '@/shared/money';
import { formatDecimalDisplay } from '@/shared/number/display';

export async function Contractor360Screen({
  surfaceRoot,
  params,
}: {
  surfaceRoot?: string;
  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const { projectId, agreementId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  const locale = await getLocale();
  const [t, tSub, tClaims, tCoord, tCollab, tRfi, tSubmittals, tInspections, tDefects, tCompliance, tPlans, data] =
    await Promise.all([
      getTranslations('projectWorkspace'),
      getTranslations('subcontracts'),
      getTranslations('subcontractClaims'),
      getTranslations('coordination'),
      getTranslations('collaboration'),
      getTranslations('rfi'),
      getTranslations('submittals'),
      getTranslations('inspections'),
      getTranslations('defects'),
      getTranslations('contractorCompliance'),
      getTranslations('projectPlans'),
      loadOrNotFound(() => withOrgContext((context) => loadContractor360(context, projectId, agreementId))),
    ]);
  if (data.agreement.projectId !== projectId) notFound();

  const root = surfaceRoot ?? `/projects/${projectId}`;
  const base = `${root}/contractors/${agreementId}`;
  const when = intlDateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const money = (amount: string, currency: string) => bidiIsolate(formatMoneyString(amount, currency, locale));
  const agreementPeriod =
    data.agreement.startDate || data.agreement.endDate
      ? bidiIsolate(`${data.agreement.startDate ?? '…'} – ${data.agreement.endDate ?? '…'}`)
      : null;
  const showSchedule = data.events !== null || data.tasks !== null;
  const sectionLink = (href: string) => (
    <Link href={href} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)]">
      {t('contractors.overview.fullList')}
    </Link>
  );
  const sections = [
    { id: 'contract', label: t('contractors.overview.contract') },
    ...(data.progress ? [{ id: 'progress', label: t('contractors.overview.progress') }] : []),
    ...(showSchedule ? [{ id: 'schedule', label: t('contractors.overview.schedule') }] : []),
    ...(data.claims ? [{ id: 'claims', label: t('contractors.overview.claims') }] : []),
    { id: 'changes', label: t('contractors.overview.changes') },
    ...(data.documents ? [{ id: 'documents', label: t('contractors.overview.documents') }] : []),
    { id: 'rfi', label: t('contractors.overview.rfi') },
    { id: 'quality', label: t('contractors.overview.quality') },
    { id: 'payments', label: t('contractors.overview.payments') },
    { id: 'handover', label: t('contractors.overview.closeout') },
  ];

  return (
    <MainAppPage>
      <PageHeader
        title={data.agreement.title}
        description={t('contractors.overview.description')}
        meta={<AgreementStatusBadge status={data.agreement.status} label={tSub(`agreementStatus.${data.agreement.status}`)} />}
      />
      <MainAppSection>
        <AgreementSubNav overviewHref={base} linesHref={`${base}/lines`} changesHref={`${base}/changes`} current="overview" />
        <nav aria-label={t('contractors.overview.jumpLabel')} className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--pf-text-secondary)] hover:bg-[var(--pf-action-subtle-hover)]"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <MainAppSummaryGrid className="mt-2">
          <MainAppSummaryItem label={tSub('agreement.fields.vendor')}>
            {data.agreement.vendorName ?? '—'}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={tSub('agreement.fields.trade')}>
            {data.agreement.trade ?? '—'}
          </MainAppSummaryItem>
          {agreementPeriod ? (
            <MainAppSummaryItem label={tSub('agreement.fields.period')}>{agreementPeriod}</MainAppSummaryItem>
          ) : null}
          {data.financial ? (
            <MainAppSummaryItem label={tSub('value.current')}>
              {money(data.financial.currentAmount, data.financial.currency)}
            </MainAppSummaryItem>
          ) : null}
        </MainAppSummaryGrid>
      </MainAppSection>

      <div id="contract" className="min-w-0 scroll-mt-20">
      <MainAppSection
        title={t('contractors.overview.contract')}
        actions={sectionLink(`${base}/lines`)}
      >
        <AgreementFacts agreement={data.agreement} />
        {data.financial ? <AgreementValueCard financial={data.financial} showTerms={false} /> : null}
        {data.lines.length === 0 ? (
          <EmptyState size="sm" title={t('contractors.overview.empty.linesTitle')} description={t('contractors.overview.empty.linesDescription')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.lines.map((line) => (
              <li key={line.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-3">
                <p className="font-medium break-words">
                  {line.code ? `${line.code} · ` : ''}
                  {line.description}
                </p>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                  {tSub(`lineTypes.${line.lineType}`)}
                  {' · '}
                  {tSub('lines.fields.quantity')}: {bidiIsolate(formatDecimalDisplay(line.quantity, locale))} {line.unit}
                </p>
                {line.financial ? (
                  <p className="mt-1 text-sm tabular-nums">
                    {tSub('lines.fields.revised')}: {money(line.financial.revisedAmount, line.financial.currency)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </MainAppSection>
      </div>

      {data.progress ? (
        <div id="progress" className="min-w-0 scroll-mt-20">
        <MainAppSection
          title={t('contractors.overview.progress')}
          actions={sectionLink(`${base}/lines`)}
        >
          {data.progress.length === 0 ? (
            <EmptyState size="sm" title={t('contractors.overview.empty.progressTitle')} description={t('contractors.overview.empty.progressDescription')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.progress.map((line) => (
                <li key={line.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-3">
                  <p className="font-medium break-words">
                    {line.code ? `${line.code} · ` : ''}
                    {line.description}
                  </p>
                  <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                    {tSub(`lineTypes.${line.lineType}`)}
                    {line.weightPercent ? ` · ${t('contractors.overview.progressWeight', { weight: line.weightPercent })}` : ''}
                    {line.plannedStart ? ` · ${line.plannedStart}` : ''}
                    {line.plannedEnd ? ` – ${line.plannedEnd}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </MainAppSection>
        </div>
      ) : null}

      {showSchedule ? (
        <div id="schedule" className="min-w-0 scroll-mt-20">
        <MainAppSection
          title={t('contractors.overview.schedule')}
          actions={data.events ? sectionLink(`${root}/coordination`) : undefined}
        >
          {data.events ? (
            <MainAppSection title={t('contractors.overview.events')}>
              {data.events.length === 0 ? (
                <EmptyState size="sm" title={t('contractors.overview.empty.eventsTitle')} description={t('contractors.overview.empty.eventsDescription')} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.events.map((event) => (
                    <li key={event.id}>
                      <Link href={`${root}/coordination/${event.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-3">
                        <p className="font-medium break-words">{event.title}</p>
                        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                          {when.format(new Date(event.startsAt))}
                          {' · '}
                          {tCoord(`statuses.${event.status}`)}
                          {' · '}
                          {tCoord(`readiness.${event.readiness}`)}
                          {event.locationName ? ` · ${event.locationName}` : ''}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </MainAppSection>
          ) : null}
          {data.tasks ? (
            <MainAppSection title={t('contractors.overview.tasks')}>
              {data.tasks.length === 0 ? (
                <EmptyState size="sm" title={t('contractors.overview.empty.tasksTitle')} description={t('contractors.overview.empty.tasksDescription')} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.tasks.map((task) => (
                    <li key={task.taskId} className="rounded-lg border border-[var(--pf-border-subtle)] p-3">
                      <p className="font-medium break-words">{task.title}</p>
                      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                        {tCollab(`taskStatus.${task.status}`)}
                        {task.dueDate ? ` · ${bidiIsolate(task.dueDate)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </MainAppSection>
          ) : null}
        </MainAppSection>
        </div>
      ) : null}

      {data.claims ? (
        <div id="claims" className="min-w-0 scroll-mt-20">
        <MainAppSection
          title={t('contractors.overview.claims')}
          actions={sectionLink(`${root}/claims`)}
        >
          {data.claims.items.length === 0 ? (
            <EmptyState size="sm" title={t('contractors.overview.empty.claimsTitle')} description={t('contractors.overview.empty.claimsDescription')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.claims.items.map((claim) => (
                <li key={claim.id}>
                  <Link href={`${root}/claims/${claim.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{bidiIsolate(`CLM-${claim.claimNumber}`)}</p>
                      <ClaimStatusBadge status={claim.status} label={tClaims(`status.${claim.status}`)} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {tClaims('list.period')}: {bidiIsolate(claim.periodStart)} – {bidiIsolate(claim.periodEnd)}
                    </p>
                    {claim.amounts ? (
                      <p className="mt-1 text-sm tabular-nums">
                        {tClaims('list.submitted')}: {money(claim.amounts.submitted, claim.amounts.currency)}
                        {claim.amounts.certified
                          ? ` · ${tClaims('list.certified')}: ${money(claim.amounts.certified, claim.amounts.currency)}`
                          : ''}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </MainAppSection>
        </div>
      ) : null}

      <div id="changes" className="min-w-0 scroll-mt-20">
      <MainAppSection
        title={t('contractors.overview.changes')}
        actions={sectionLink(`${base}/changes`)}
      >
        <ChangesPanel changes={data.changes} lines={data.lines} />
      </MainAppSection>
      </div>

      {data.documents ? (
        <div id="documents" className="min-w-0 scroll-mt-20">
        <MainAppSection
          title={t('contractors.overview.documents')}
          actions={sectionLink(`${root}/plans`)}
        >
          <MainAppSection title={t('contractors.overview.sharedDocuments')}>
            {data.documents.shares.length === 0 ? (
              <EmptyState size="sm" title={t('contractors.overview.empty.documentsTitle')} description={t('contractors.overview.empty.documentsDescription')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.documents.shares.map((share) => (
                  <li key={share.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <p className="font-medium break-words">{share.title}</p>
                    <p className="mt-1 text-sm break-words text-[var(--pf-text-secondary)]">{share.fileName}</p>
                  </li>
                ))}
              </ul>
            )}
          </MainAppSection>
          <MainAppSection title={t('contractors.overview.plans')}>
            {data.documents.plans.length === 0 ? (
              <EmptyState size="sm" title={t('contractors.overview.empty.plansTitle')} description={t('contractors.overview.empty.plansDescription')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.documents.plans.map((plan) => (
                  <li key={plan.id}>
                    <Link href={`${root}/plans/${plan.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-3">
                      <p className="font-medium break-words">
                        {plan.drawingNumber} · {plan.title}
                      </p>
                      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                        {tPlans('register.currentRev', { label: plan.revisionLabel })}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </MainAppSection>
        </MainAppSection>
        </div>
      ) : null}

      <div id="rfi" className="min-w-0 scroll-mt-20">
      <MainAppSection title={t('contractors.overview.rfi')}>
        <MainAppSection title={t('contractors.overview.rfis')}>
          {data.rfis.items.length === 0 ? (
            <EmptyState size="sm" title={t('contractors.overview.empty.rfisTitle')} description={t('contractors.overview.empty.rfisDescription')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.rfis.items.map((item) => (
                <li key={item.id}>
                  <Link href={`${root}/rfi/${item.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <p className="font-medium break-words">
                      {formatRfiNumber(item.number)} · {item.subject}
                    </p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {tRfi(`status.${item.status}`)}
                      {item.overdue ? ` · ${tRfi('list.overdue')}` : ''}
                      {item.dueDate ? ` · ${bidiIsolate(item.dueDate)}` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">{sectionLink(`${root}/rfi`)}</p>
        </MainAppSection>
        <MainAppSection title={t('contractors.overview.submittals')}>
          {data.submittals.items.length === 0 ? (
            <EmptyState size="sm" title={t('contractors.overview.empty.submittalsTitle')} description={t('contractors.overview.empty.submittalsDescription')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.submittals.items.map((item) => (
                <li key={item.id}>
                  <Link href={`${root}/submittals/${item.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <p className="font-medium break-words">
                      {formatSubmittalNumber(item.number)} · {item.title}
                    </p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {tSubmittals(`type.${item.type}`)}
                      {' · '}
                      {tSubmittals(`status.${item.status}`)}
                      {item.overdue ? ` · ${tSubmittals('list.overdue')}` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">{sectionLink(`${root}/submittals`)}</p>
        </MainAppSection>
      </MainAppSection>
      </div>

      <div id="quality" className="min-w-0 scroll-mt-20">
      <MainAppSection title={t('contractors.overview.quality')}>
        <MainAppSection title={t('contractors.overview.inspections')}>
          {data.inspections.items.length === 0 ? (
            <EmptyState size="sm" title={t('contractors.overview.empty.inspectionsTitle')} description={t('contractors.overview.empty.inspectionsDescription')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.inspections.items.map((item) => (
                <li key={item.id}>
                  <Link href={`${root}/inspections/${item.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <p className="font-medium break-words">{item.title}</p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {tInspections('detailTitle', { ref: item.referenceNo })}
                      {' · '}
                      {tInspections(`status.${item.status}`)}
                      {item.outcome ? ` · ${tInspections(`outcome.${item.outcome}`)}` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">{sectionLink(`${root}/inspections`)}</p>
        </MainAppSection>
        <MainAppSection title={t('contractors.overview.defects')}>
          {data.defects.items.length === 0 ? (
            <EmptyState size="sm" title={t('contractors.overview.empty.defectsTitle')} description={t('contractors.overview.empty.defectsDescription')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.defects.items.map((item) => (
                <li key={item.id}>
                  <Link href={`${root}/defects/${item.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <p className="font-medium break-words">{item.title}</p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {tDefects('detailTitle', { ref: item.referenceNo })}
                      {' · '}
                      {tDefects(`status.${item.status}`)}
                      {' · '}
                      {tDefects(`severity.${item.severity}`)}
                      {item.overdue ? ` · ${tDefects('counts.overdue')}` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">{sectionLink(`${root}/defects`)}</p>
        </MainAppSection>
      </MainAppSection>
      </div>

      <div id="payments" className="min-w-0 scroll-mt-20">
      <MainAppSection title={t('contractors.overview.payments')}>
        {data.payments ? (
          <MainAppSection title={t('contractors.overview.paymentFigures')}>
            {!data.payments.hasBases && data.payments.holdCount === 0 ? (
              <EmptyState size="sm" title={t('contractors.overview.empty.paymentsTitle')} description={t('contractors.overview.empty.paymentsDescription')} />
            ) : (
              <div className="flex min-w-0 flex-col gap-3">
                {data.payments.hasBases ? (
                  <MainAppSummaryGrid>
                    <MainAppSummaryItem label={tClaims('totals.certifiedCumulative')}>
                      {money(data.payments.certified, data.payments.currency)}
                    </MainAppSummaryItem>
                    <MainAppSummaryItem label={tClaims('totals.payableNet')}>
                      {money(data.payments.payableNet, data.payments.currency)}
                    </MainAppSummaryItem>
                    <MainAppSummaryItem label={tClaims('totals.paidRecorded')}>
                      {money(data.payments.paid, data.payments.currency)}
                    </MainAppSummaryItem>
                    <MainAppSummaryItem label={tClaims('portal.retention')}>
                      {money(data.payments.retentionHeld, data.payments.currency)}
                    </MainAppSummaryItem>
                  </MainAppSummaryGrid>
                ) : null}
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {data.payments.eligible ? t('contractors.overview.paymentEligible') : t('contractors.overview.paymentHeld')}
                  {data.payments.holdCount > 0 ? ` · ${tClaims('portal.holds')}: ${bidiIsolate(String(data.payments.holdCount))}` : ''}
                </p>
              </div>
            )}
          </MainAppSection>
        ) : null}
        <MainAppSection
          title={t('contractors.overview.compliance')}
          actions={sectionLink(`${root}/contractor-compliance`)}
        >
          {data.compliance.requirements.length === 0 ? (
            <EmptyState size="sm" title={t('contractors.overview.empty.complianceTitle')} description={t('contractors.overview.empty.complianceDescription')} />
          ) : (
            <div className="flex flex-col gap-3">
              {data.compliance.blockingCount > 0 ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {tCompliance('counts.blocking', { count: data.compliance.blockingCount })}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2">
                {data.compliance.requirements.map((requirement) => (
                  <li key={requirement.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <p className="font-medium break-words">{requirement.title}</p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {tCompliance(`kinds.${requirement.kind}`)}
                      {' · '}
                      {tCompliance(`status.${requirement.status}`)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </MainAppSection>
        <ActivityFeed
          organizationId={data.organizationId}
          projectId={projectId}
          viewer="internal"
          vendorId={data.agreement.vendorId}
          limit={30}
          surfaceRoot={surfaceRoot}
        />
      </MainAppSection>
      </div>

      <AgreementHandoverPanel
        projectId={projectId}
        agreementId={agreementId}
        root={root}
        canManage={data.canManageHandover}
      />
    </MainAppPage>
  );
}

export default function Contractor360Page(
  props: Omit<Parameters<typeof Contractor360Screen>[0], 'surfaceRoot'>,
) {
  return <Contractor360Screen {...props} />;
}

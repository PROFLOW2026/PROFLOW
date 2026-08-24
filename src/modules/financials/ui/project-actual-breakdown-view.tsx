'use client';

import { useState, type ReactNode } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { MoneyValue } from '@/shared/money';
import type {
  ProjectActualBreakdown,
  ProjectActualBreakdownCategoryKey,
} from '../domain/project-actual-breakdown';
import type { ProjectLaborByEmployeeAggregate } from '@/modules/workforce';

export type OwnerStoryCopy = {
  readonly title: string;
  readonly currentContract: string;
  readonly actualCost: string;
  readonly ofWhich: string;
  readonly allocatedGeneral: string;
  readonly openCommitments: string;
  readonly forecastFinal: string;
  readonly billed: string;
  readonly collected: string;
  readonly actualProfit: string;
  readonly afterGeneralProfit: string;
  readonly forecastProfit: string;
  readonly unavailable: string;
  readonly breakdownTitle: string;
  readonly categories: Record<ProjectActualBreakdownCategoryKey, string>;
  readonly total: string;
  readonly percent: string;
  readonly sources: string;
  readonly expand: string;
  readonly collapse: string;
  readonly hours: string;
  readonly workDays: string;
  readonly missingCost: string;
  readonly ofLabor: string;
  readonly period: string;
  readonly forecastFormulaTitle: string;
  readonly forecastFormulaActual: string;
  readonly forecastFormulaCommitments: string;
  readonly forecastFormulaEtc: string;
  readonly forecastFormulaEquals: string;
  readonly profitFormulaTitle: string;
  readonly profitFormulaContract: string;
  readonly profitFormulaForecast: string;
  readonly profitFormulaEquals: string;
  readonly openApCashNote: string;
  readonly actualLabel: string;
  readonly commitmentLabel: string;
  readonly paidLabel: string;
  readonly openSource: string;
};

export type OwnerStoryMetrics = {
  readonly currentContract: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly allocatedGeneralBusinessCost: MoneyValue | null;
  readonly openCommitments: MoneyValue | null;
  readonly forecastFinal: MoneyValue | null;
  readonly billed: MoneyValue | null;
  readonly collected: MoneyValue | null;
  readonly outstanding: MoneyValue | null;
  readonly unbilled: MoneyValue | null;
  readonly actualProfit: MoneyValue | null;
  readonly afterGeneralProfit: MoneyValue | null;
  readonly forecastProfit: MoneyValue | null;
  readonly expectedRemaining: MoneyValue | null;
  readonly openApPayable: MoneyValue | null;
  readonly priceNotSet: boolean;
};

function isPositiveMoney(value: MoneyValue | null | undefined): value is MoneyValue {
  return value != null && Number(value.amount) > 0;
}

export function AllocatedGeneralOfWhichNote({
  ofWhich,
  label,
  amount,
}: {
  ofWhich: string;
  label: string;
  amount: MoneyValue;
}) {
  return (
    <p
      className="min-w-0 text-xs font-normal text-[var(--pf-text-muted)]"
      data-pf-allocated-general-of-which
    >
      {ofWhich}: {label}:{' '}
      <MoneyText value={amount} />
    </p>
  );
}

function StoryRow({
  label,
  value,
  unavailable,
  emphasis,
  subtitle,
}: {
  label: string;
  value: MoneyValue | null;
  unavailable: string;
  emphasis?: boolean;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className={cn('flex min-w-0 justify-between gap-3 text-sm', emphasis && 'font-semibold')}>
        <span className="min-w-0 text-[var(--pf-text-secondary)]">{label}</span>
        <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
          {value ? <MoneyText value={value} /> : unavailable}
        </span>
      </div>
      {subtitle}
    </div>
  );
}

export function ProjectOwnerStoryPanel({
  copy,
  metrics,
}: {
  copy: OwnerStoryCopy;
  metrics: OwnerStoryMetrics;
}) {
  return (
    <div className="flex flex-col gap-2" data-pf-owner-story>
      <h3 className="text-base font-semibold">{copy.title}</h3>
      <StoryRow
        label={copy.currentContract}
        value={metrics.priceNotSet ? null : metrics.currentContract}
        unavailable={copy.unavailable}
        emphasis
      />
      <StoryRow
        label={copy.actualCost}
        value={metrics.actualCost}
        unavailable={copy.unavailable}
        emphasis
        subtitle={
          isPositiveMoney(metrics.allocatedGeneralBusinessCost) ? (
            <AllocatedGeneralOfWhichNote
              ofWhich={copy.ofWhich}
              label={copy.allocatedGeneral}
              amount={metrics.allocatedGeneralBusinessCost}
            />
          ) : null
        }
      />
      <StoryRow
        label={copy.openCommitments}
        value={metrics.openCommitments}
        unavailable={copy.unavailable}
      />
      <StoryRow
        label={copy.forecastFinal}
        value={metrics.forecastFinal}
        unavailable={copy.unavailable}
      />
      <StoryRow label={copy.billed} value={metrics.billed} unavailable={copy.unavailable} />
      <StoryRow label={copy.collected} value={metrics.collected} unavailable={copy.unavailable} />
      <StoryRow
        label={copy.actualProfit}
        value={metrics.priceNotSet ? null : metrics.actualProfit}
        unavailable={copy.unavailable}
      />
      {metrics.afterGeneralProfit ? (
        <StoryRow
          label={copy.afterGeneralProfit}
          value={metrics.priceNotSet ? null : metrics.afterGeneralProfit}
          unavailable={copy.unavailable}
        />
      ) : null}
      <StoryRow
        label={copy.forecastProfit}
        value={metrics.priceNotSet ? null : metrics.forecastProfit}
        unavailable={copy.unavailable}
      />
    </div>
  );
}

export function ProjectForecastFormulaPanel({
  copy,
  metrics,
}: {
  copy: OwnerStoryCopy;
  metrics: OwnerStoryMetrics;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm" data-pf-forecast-formula>
      <h3 className="text-base font-semibold">{copy.forecastFormulaTitle}</h3>
      <div className="flex flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3">
        <StoryRow
          label={copy.forecastFormulaActual}
          value={metrics.actualCost}
          unavailable={copy.unavailable}
        />
        <StoryRow
          label={`+ ${copy.forecastFormulaCommitments}`}
          value={metrics.openCommitments}
          unavailable={copy.unavailable}
        />
        <StoryRow
          label={`+ ${copy.forecastFormulaEtc}`}
          value={metrics.expectedRemaining}
          unavailable={copy.unavailable}
        />
        <div className="my-1 border-t border-[var(--pf-border-default)]" />
        <StoryRow
          label={`= ${copy.forecastFormulaEquals}`}
          value={metrics.forecastFinal}
          unavailable={copy.unavailable}
          emphasis
        />
      </div>
      <h3 className="text-base font-semibold">{copy.profitFormulaTitle}</h3>
      <div className="flex flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3">
        <StoryRow
          label={copy.profitFormulaContract}
          value={metrics.priceNotSet ? null : metrics.currentContract}
          unavailable={copy.unavailable}
        />
        <StoryRow
          label={`− ${copy.profitFormulaForecast}`}
          value={metrics.forecastFinal}
          unavailable={copy.unavailable}
        />
        <div className="my-1 border-t border-[var(--pf-border-default)]" />
        <StoryRow
          label={`= ${copy.profitFormulaEquals}`}
          value={metrics.priceNotSet ? null : metrics.forecastProfit}
          unavailable={copy.unavailable}
          emphasis
        />
      </div>
      {metrics.openApPayable ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{copy.openApCashNote}</p>
      ) : null}
    </div>
  );
}

function EmployeeDrill({
  labor,
  copy,
  laborTotal,
}: {
  labor: ProjectLaborByEmployeeAggregate | null;
  copy: OwnerStoryCopy;
  laborTotal: MoneyValue;
}) {
  if (!labor || labor.employees.length === 0) {
    return <p className="text-xs text-[var(--pf-text-muted)]">{copy.unavailable}</p>;
  }

  return (
    <ul className="flex flex-col gap-2 border-t border-[var(--pf-border-default)] pt-2">
      {labor.employees.map((row) => {
        const pct =
          row.laborCost && Number(laborTotal.amount) > 0
            ? ((Number(row.laborCost.amount) / Number(laborTotal.amount)) * 100).toFixed(1)
            : null;
        return (
          <li key={row.employeeId} className="rounded-md bg-[var(--pf-bg-muted)] p-2 text-sm">
            <div className="font-medium">{row.employeeName}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--pf-text-secondary)]">
              <span>
                {copy.hours}: {row.hours}
              </span>
              <span>
                {copy.workDays}: {row.workDays}
              </span>
              <span>
                {row.laborCost ? <MoneyText value={row.laborCost} /> : copy.missingCost}
              </span>
              {pct ? (
                <span>
                  {pct}% {copy.ofLabor}
                </span>
              ) : null}
            </div>
            {row.periods.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--pf-border-default)] pt-2 text-xs">
                {row.periods.map((period) => (
                  <li
                    key={`${row.employeeId}-${period.yearMonth}-${period.source}`}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <span>
                      {copy.period} {period.yearMonth}
                      {period.source === 'monthly_allocation' ? ' · ○' : ''}
                    </span>
                    <span className="text-end">
                      {period.hours !== '0' ? `${period.hours} ${copy.hours} · ` : ''}
                      {period.workDays > 0 ? `${period.workDays} ${copy.workDays} · ` : ''}
                      {period.laborCost ? (
                        <MoneyText value={period.laborCost} />
                      ) : (
                        copy.missingCost
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export type SubcontractCommercialDrillRow = {
  readonly agreementId: string;
  readonly vendorId?: string | null;
  readonly commitment: MoneyValue | null;
  readonly paid: MoneyValue | null;
};

function sourceHref(
  atom: {
    readonly sourceKind: string;
    readonly sourceId: string;
  },
  projectId: string,
): string | null {
  if (atom.sourceKind === 'expense') {
    return `/expenses/${atom.sourceId}?projectId=${projectId}`;
  }
  if (atom.sourceKind === 'ap_bill') {
    return `/procurement/ap/${atom.sourceId}?projectId=${projectId}`;
  }
  if (atom.sourceKind === 'month_close') {
    return `/projects/${projectId}?tab=financials`;
  }
  return `/projects/${projectId}?tab=team`;
}

function AtomList({
  atoms,
  copy,
  projectId,
  categoryKey,
  subcontractCommercial,
}: {
  atoms: ProjectActualBreakdown['categories'][number]['atoms'];
  copy: OwnerStoryCopy;
  projectId: string;
  categoryKey: ProjectActualBreakdownCategoryKey;
  subcontractCommercial?: readonly SubcontractCommercialDrillRow[] | null;
}) {
  if (atoms.length === 0 && !(subcontractCommercial && subcontractCommercial.length > 0)) {
    return <p className="text-xs text-[var(--pf-text-muted)]">{copy.unavailable}</p>;
  }

  if (categoryKey === 'subcontractors') {
    const byAgreement = new Map<
      string,
      {
        label: string;
        actual: (typeof atoms)[number]['amount'];
        href: string | null;
      }
    >();
    for (const atom of atoms) {
      const key = atom.subcontractAgreementId ?? atom.vendorId ?? atom.sourceId;
      if (!byAgreement.has(key)) {
        byAgreement.set(key, {
          label: atom.label ?? atom.vendorName ?? key,
          actual: atom.amount,
          href: sourceHref(atom, projectId),
        });
      }
    }
    return (
      <ul
        className="flex flex-col gap-2 border-t border-[var(--pf-border-default)] pt-2 text-xs"
        data-pf-subcontractor-drill
      >
        {[...byAgreement.entries()].map(([id, row]) => {
          const commercial = subcontractCommercial?.find(
            (c) => c.agreementId === id || c.vendorId === id,
          );
          return (
            <li key={id} className="rounded-md bg-[var(--pf-bg-muted)] p-2">
              <div className="font-medium">{row.label}</div>
              <div className="mt-1 flex flex-col gap-1">
                <div className="flex justify-between gap-2">
                  <span>{copy.actualLabel}</span>
                  <MoneyText value={row.actual} />
                </div>
                <div className="flex justify-between gap-2">
                  <span>{copy.commitmentLabel}</span>
                  <span>
                    {commercial?.commitment ? (
                      <MoneyText value={commercial.commitment} />
                    ) : (
                      copy.unavailable
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>{copy.paidLabel}</span>
                  <span>
                    {commercial?.paid ? <MoneyText value={commercial.paid} /> : copy.unavailable}
                  </span>
                </div>
              </div>
              {row.href ? (
                <Link href={row.href} className={`${textNavLinkClassName} mt-1 inline-block`}>
                  {copy.openSource}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul
      className="flex flex-col gap-1 border-t border-[var(--pf-border-default)] pt-2 text-xs"
      data-pf-category-drill={categoryKey}
    >
      {atoms.slice(0, 40).map((atom) => {
        const href = sourceHref(atom, projectId);
        return (
          <li key={`${atom.sourceKind}-${atom.sourceId}`} className="flex justify-between gap-2">
            <span className="min-w-0 truncate text-[var(--pf-text-secondary)]">
              {href ? (
                <Link href={href} className={textNavLinkClassName}>
                  {atom.label ?? atom.sourceId}
                </Link>
              ) : (
                (atom.label ?? atom.sourceId)
              )}
            </span>
            <span className="shrink-0">
              <MoneyText value={atom.amount} />
            </span>
          </li>
        );
      })}
      {atoms.length > 40 ? (
        <li className="text-[var(--pf-text-muted)]">+{atoms.length - 40}</li>
      ) : null}
    </ul>
  );
}

export function ProjectActualBreakdownView({
  breakdown,
  laborByEmployee,
  copy,
  projectId,
  subcontractCommercial = null,
}: {
  breakdown: ProjectActualBreakdown;
  laborByEmployee: ProjectLaborByEmployeeAggregate | null;
  copy: OwnerStoryCopy;
  projectId: string;
  subcontractCommercial?: readonly SubcontractCommercialDrillRow[] | null;
}) {
  const [openKey, setOpenKey] = useState<ProjectActualBreakdownCategoryKey | null>(null);
  const laborTotal =
    breakdown.categories.find((c) => c.key === 'employees')?.amount ?? breakdown.totalActual;

  return (
    <div className="flex flex-col gap-3" data-pf-actual-breakdown>
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold">{copy.breakdownTitle}</h3>
        <p className="text-sm font-semibold">
          <MoneyText value={breakdown.totalActual} />
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {breakdown.categories.map((category) => {
          const isOpen = openKey === category.key;
          const label = copy.categories[category.key];
          return (
            <li
              key={category.key}
              className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
            >
              <button
                type="button"
                className="flex w-full min-w-0 items-start justify-between gap-3 p-3 text-start"
                onClick={() => setOpenKey(isOpen ? null : category.key)}
                aria-expanded={isOpen}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--pf-text-muted)]">
                    {category.sourceCount} {copy.sources}
                    {category.percentOfActual
                      ? ` · ${category.percentOfActual}${copy.percent}`
                      : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold">
                  {category.availability === 'unavailable' ? (
                    copy.unavailable
                  ) : (
                    <MoneyText value={category.amount} />
                  )}
                </span>
              </button>
              {isOpen ? (
                <div className="px-3 pb-3">
                  <p className="mb-2 text-xs text-[var(--pf-text-muted)]">
                    {isOpen ? copy.collapse : copy.expand}
                  </p>
                  {category.key === 'employees' ? (
                    <EmployeeDrill
                      labor={laborByEmployee}
                      copy={copy}
                      laborTotal={laborTotal}
                    />
                  ) : (
                    <AtomList atoms={category.atoms} copy={copy} projectId={projectId} categoryKey={category.key} subcontractCommercial={subcontractCommercial} />
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-between gap-2 border-t border-[var(--pf-border-default)] pt-2 text-sm font-semibold">
        <span>{copy.total}</span>
        <MoneyText value={breakdown.totalActual} />
      </div>
    </div>
  );
}

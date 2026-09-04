'use client';

import { useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import {
  buildExpenseDetailHref,
  buildProjectReturnTo,
} from '@/modules/expenses/domain/expense-return-navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { addMoney, isZeroMoney, type MoneyValue } from '@/shared/money';
import type {
  ProjectActualBreakdown,
  ProjectActualBreakdownCategoryKey,
} from '../domain/project-actual-breakdown';
import type { ProjectAllocatedGeneralDetail } from '../domain/project-allocated-general-detail';
import type { ProjectLaborByEmployeeAggregate } from '@/modules/workforce';
import {
  displayActualAtomLabel,
  type ActualAtomDisplayCopy,
} from '../domain/actual-atom-display';
import { localizeCode } from '@/shared/i18n/code-display';
import {
  AllocatedGeneralDetailPanel,
  type AllocatedGeneralDetailCopy,
} from './allocated-general-detail-panel';

export type OwnerStoryCopy = {
  readonly title: string;
  readonly currentContract: string;
  readonly actualCost: string;
  readonly ofWhich: string;
  readonly allocatedGeneral: string;
  readonly openCommitments: string;
  readonly forecastFinal: string;
  readonly directForecastFinal?: string;
  readonly fullForecastFinal?: string;
  readonly futureGeneralAllocatedForecast?: string;
  readonly recognizedAllocatedGeneral?: string;
  readonly billed: string;
  readonly collected: string;
  readonly actualProfit: string;
  readonly afterGeneralProfit: string;
  readonly forecastProfit: string;
  readonly unavailable: string;
  readonly breakdownTitle: string;
  readonly categories: Record<ProjectActualBreakdownCategoryKey, string> & {
    readonly allocatedGeneral?: string;
  };
  readonly directActualCost?: string;
  readonly directBreakdownSectionTitle?: string;
  readonly fullCostLayerTitle?: string;
  readonly fullActualIncludingGeneral?: string;
  readonly allocatedGeneralDetail?: AllocatedGeneralDetailCopy;
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
  readonly subcontractGroupTotal?: string;
  readonly overheadCategoryHint?: string;
  readonly allocatedGeneralCompanyOnlyNote?: string;
  readonly fullCostFormulaTitle?: string;
  readonly sourceMonthClose?: string;
  readonly unnamedSource?: string;
};

export type OwnerStoryMetrics = {
  readonly currentContract: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly allocatedGeneralBusinessCost: MoneyValue | null;
  readonly openCommitments: MoneyValue | null;
  readonly forecastFinal: MoneyValue | null;
  readonly directForecastFinal?: MoneyValue | null;
  readonly fullForecastFinal?: MoneyValue | null;
  readonly futureGeneralAllocatedForecast?: MoneyValue | null;
  readonly fullActualCost?: MoneyValue | null;
  readonly billed: MoneyValue | null;
  readonly collected: MoneyValue | null;
  readonly outstanding: MoneyValue | null;
  readonly unbilled: MoneyValue | null;
  readonly actualProfit: MoneyValue | null;
  readonly afterGeneralProfit: MoneyValue | null;
  readonly forecastProfit: MoneyValue | null;
  readonly fullForecastProfit?: MoneyValue | null;
  readonly expectedRemaining: MoneyValue | null;
  readonly openApPayable: MoneyValue | null;
  readonly priceNotSet: boolean;
};

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
  const hasAllocatedGeneral =
    metrics.allocatedGeneralBusinessCost != null &&
    Number(metrics.allocatedGeneralBusinessCost.amount) > 0;
  const showFullCostStory =
    hasAllocatedGeneral &&
    metrics.fullActualCost != null &&
    metrics.actualCost != null &&
    Number(metrics.fullActualCost.amount) !== Number(metrics.actualCost.amount);

  return (
    <div className="flex flex-col gap-2" data-pf-owner-story>
      <h3 className="text-base font-semibold">{copy.title}</h3>
      <StoryRow
        label={copy.currentContract}
        value={metrics.priceNotSet ? null : metrics.currentContract}
        unavailable={copy.unavailable}
        emphasis
      />
      {showFullCostStory ? (
        <>
          <StoryRow
            label={copy.directActualCost ?? copy.actualCost}
            value={metrics.actualCost}
            unavailable={copy.unavailable}
            emphasis
          />
          <StoryRow
            label={copy.allocatedGeneral}
            value={metrics.allocatedGeneralBusinessCost}
            unavailable={copy.unavailable}
          />
          <StoryRow
            label={copy.fullActualIncludingGeneral ?? copy.total}
            value={metrics.fullActualCost ?? null}
            unavailable={copy.unavailable}
            emphasis
          />
        </>
      ) : (
        <StoryRow
          label={copy.actualCost}
          value={metrics.actualCost}
          unavailable={copy.unavailable}
          emphasis
        />
      )}
      <StoryRow
        label={copy.openCommitments}
        value={metrics.openCommitments}
        unavailable={copy.unavailable}
      />
      <StoryRow
        label={copy.forecastFinal}
        value={metrics.directForecastFinal ?? metrics.forecastFinal}
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
          value={metrics.directForecastFinal ?? metrics.actualCost}
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
          value={metrics.directForecastFinal ?? metrics.forecastFinal}
          unavailable={copy.unavailable}
          emphasis
        />
      </div>
      {metrics.fullForecastFinal &&
      metrics.fullActualCost &&
      Number(metrics.allocatedGeneralBusinessCost?.amount ?? 0) > 0 ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3"
          data-pf-full-forecast-formula
        >
          {copy.fullCostFormulaTitle ? (
            <p className="text-xs font-medium text-[var(--pf-text-secondary)]">
              {copy.fullCostFormulaTitle}
            </p>
          ) : null}
          <StoryRow
            label={copy.fullActualIncludingGeneral ?? copy.forecastFormulaActual}
            value={metrics.fullActualCost}
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
          {metrics.futureGeneralAllocatedForecast &&
          Number(metrics.futureGeneralAllocatedForecast.amount) > 0 ? (
            <StoryRow
              label={`+ ${copy.futureGeneralAllocatedForecast ?? copy.allocatedGeneral}`}
              value={metrics.futureGeneralAllocatedForecast}
              unavailable={copy.unavailable}
            />
          ) : null}
          <div className="my-1 border-t border-[var(--pf-border-default)]" />
          <StoryRow
            label={`= ${copy.fullForecastFinal ?? copy.forecastFormulaEquals}`}
            value={metrics.fullForecastFinal}
            unavailable={copy.unavailable}
            emphasis
          />
        </div>
      ) : null}
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

function resolveAtomDisplay(copy: OwnerStoryCopy, locale: string): ActualAtomDisplayCopy {
  return {
    employees: copy.categories.employees,
    monthClose: copy.sourceMonthClose ?? 'סגירת חודש',
    unnamed: copy.unnamedSource ?? copy.unavailable,
    translateCostCategory: (key) => {
      const stripped = key.replace(/^costCategories\./, '');
      return localizeCode(locale, stripped);
    },
  };
}

function sourceHref(
  atom: {
    readonly sourceKind: string;
    readonly sourceId: string;
  },
  projectId: string,
): string | null {
  if (atom.sourceKind === 'expense') {
    return buildExpenseDetailHref(atom.sourceId, {
      returnTo: buildProjectReturnTo(projectId, 'financials'),
    });
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
  const locale = useLocale();
  if (atoms.length === 0 && !(subcontractCommercial && subcontractCommercial.length > 0)) {
    return <p className="text-xs text-[var(--pf-text-muted)]">{copy.unavailable}</p>;
  }

  const atomDisplay = resolveAtomDisplay(copy, locale);

  if (categoryKey === 'subcontractors') {
    const groups = new Map<
      string,
      {
        label: string;
        atoms: (typeof atoms)[number][];
        total: MoneyValue;
      }
    >();
    for (const atom of atoms) {
      const key = atom.vendorId ?? atom.subcontractAgreementId ?? atom.sourceId;
      const existing = groups.get(key);
      if (existing) {
        existing.atoms.push(atom);
        existing.total = addMoney(existing.total, atom.amount);
        if (atom.vendorName?.trim()) {
          existing.label = atom.vendorName.trim();
        }
      } else {
        groups.set(key, {
          label: displayActualAtomLabel(atom, atomDisplay),
          atoms: [atom],
          total: atom.amount,
        });
      }
    }
    return (
      <ul
        className="flex flex-col gap-2 border-t border-[var(--pf-border-default)] pt-2 text-xs"
        data-pf-subcontractor-drill
      >
        {[...groups.entries()].map(([id, group]) => {
          const commercial = subcontractCommercial?.find(
            (c) => c.agreementId === id || c.vendorId === id,
          );
          return (
            <li key={id} className="rounded-md bg-[var(--pf-bg-muted)] p-2">
              <div className="font-medium">{group.label}</div>
              <div className="mt-1 flex flex-col gap-1">
                <div className="flex justify-between gap-2 font-medium">
                  <span>{copy.subcontractGroupTotal ?? copy.actualLabel}</span>
                  <MoneyText value={group.total} />
                </div>
                <ul className="mt-1 flex flex-col gap-1 border-t border-[var(--pf-border-default)] pt-1">
                  {group.atoms.map((atom) => {
                    const href = sourceHref(atom, projectId);
                    return (
                      <li
                        key={`${atom.sourceKind}-${atom.sourceId}`}
                        className="flex justify-between gap-2"
                      >
                        <span className="min-w-0 truncate text-[var(--pf-text-secondary)]">
                          {href ? (
                            <Link href={href} className={textNavLinkClassName}>
                              {displayActualAtomLabel(atom, atomDisplay)}
                            </Link>
                          ) : (
                            displayActualAtomLabel(atom, atomDisplay)
                          )}
                        </span>
                        <span className="shrink-0">
                          <MoneyText value={atom.amount} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
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
                  {displayActualAtomLabel(atom, atomDisplay)}
                </Link>
              ) : (
                displayActualAtomLabel(atom, atomDisplay)
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

function shouldShowBreakdownCategory(
  category: ProjectActualBreakdown['categories'][number],
): boolean {
  if (category.availability !== 'value') return true;
  return !isZeroMoney(category.amount);
}

function BreakdownCategoryCard({
  category,
  copy,
  projectId,
  laborByEmployee,
  laborTotal,
  subcontractCommercial,
  isOpen,
  onToggle,
  percentDenominator,
}: {
  category: ProjectActualBreakdown['categories'][number];
  copy: OwnerStoryCopy;
  projectId: string;
  laborByEmployee: ProjectLaborByEmployeeAggregate | null;
  laborTotal: MoneyValue;
  subcontractCommercial?: readonly SubcontractCommercialDrillRow[] | null;
  isOpen: boolean;
  onToggle: () => void;
  percentDenominator: MoneyValue;
}) {
  const label = copy.categories[category.key];
  const percentOfActual =
    !isZeroMoney(percentDenominator) && !isZeroMoney(category.amount)
      ? ((Number(category.amount.amount) / Number(percentDenominator.amount)) * 100).toFixed(1)
      : category.percentOfActual;

  return (
    <li
      className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
      data-pf-breakdown-category={category.key}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-start justify-between gap-3 p-3 text-start"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          <span className="mt-0.5 block text-xs text-[var(--pf-text-muted)]">
            {category.sourceCount} {copy.sources}
            {percentOfActual ? ` · ${percentOfActual}${copy.percent}` : ''}
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
          {category.key === 'overhead' && copy.overheadCategoryHint ? (
            <p className="mb-2 text-xs text-[var(--pf-text-secondary)]">
              {copy.overheadCategoryHint}
            </p>
          ) : null}
          {category.key === 'employees' ? (
            <EmployeeDrill labor={laborByEmployee} copy={copy} laborTotal={laborTotal} />
          ) : (
            <AtomList
              atoms={category.atoms}
              copy={copy}
              projectId={projectId}
              categoryKey={category.key}
              subcontractCommercial={subcontractCommercial}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}

function AllocatedGeneralBreakdownCard({
  allocatedGeneral,
  copy,
  projectId,
  isOpen,
  onToggle,
  percentDenominator,
}: {
  allocatedGeneral: NonNullable<
    Parameters<typeof ProjectActualBreakdownView>[0]['allocatedGeneral']
  >;
  copy: OwnerStoryCopy;
  projectId: string;
  isOpen: boolean;
  onToggle: () => void;
  percentDenominator: MoneyValue;
}) {
  const allocatedGeneralPercent =
    !isZeroMoney(percentDenominator) && !isZeroMoney(allocatedGeneral.amount)
      ? (
          (Number(allocatedGeneral.amount.amount) / Number(percentDenominator.amount)) *
          100
        ).toFixed(1)
      : null;

  return (
    <li
      className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
      data-pf-breakdown-allocated-general
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-start justify-between gap-3 p-3 text-start"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {copy.categories.allocatedGeneral ?? copy.allocatedGeneral}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--pf-text-muted)]">
            {allocatedGeneral.detail?.rows.length ?? 0} {copy.sources}
            {allocatedGeneralPercent ? ` · ${allocatedGeneralPercent}${copy.percent}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold">
          <MoneyText value={allocatedGeneral.amount} />
        </span>
      </button>
      {isOpen && allocatedGeneral.detail && copy.allocatedGeneralDetail ? (
        <div className="px-3 pb-3">
          {copy.allocatedGeneralCompanyOnlyNote ? (
            <p className="mb-2 text-xs text-[var(--pf-text-secondary)]">
              {copy.allocatedGeneralCompanyOnlyNote}
            </p>
          ) : null}
          <AllocatedGeneralDetailPanel
            detail={allocatedGeneral.detail}
            copy={copy.allocatedGeneralDetail}
            projectId={projectId}
            inlineExpanded
          />
        </div>
      ) : null}
    </li>
  );
}

export function ProjectActualBreakdownView({
  breakdown,
  laborByEmployee,
  copy,
  projectId,
  subcontractCommercial = null,
  allocatedGeneral = null,
  breakdownTotalOverride = null,
  costComposition = null,
}: {
  breakdown: ProjectActualBreakdown;
  laborByEmployee: ProjectLaborByEmployeeAggregate | null;
  copy: OwnerStoryCopy;
  projectId: string;
  subcontractCommercial?: readonly SubcontractCommercialDrillRow[] | null;
  allocatedGeneral?: {
    readonly amount: MoneyValue;
    readonly includeInBreakdownTotal: boolean;
    readonly detail: ProjectAllocatedGeneralDetail | null;
  } | null;
  breakdownTotalOverride?: MoneyValue | null;
  costComposition?: {
    readonly directActual: MoneyValue;
    readonly fullActual: MoneyValue;
  } | null;
}) {
  const [openKey, setOpenKey] = useState<ProjectActualBreakdownCategoryKey | 'allocatedGeneral' | null>(
    null,
  );
  const laborTotal =
    breakdown.categories.find((c) => c.key === 'employees')?.amount ?? breakdown.totalActual;
  const directTotal = breakdown.totalActual;
  const visibleCategories = breakdown.categories.filter(shouldShowBreakdownCategory);
  const hasAllocatedGeneral =
    allocatedGeneral != null && Number(allocatedGeneral.amount.amount) > 0;
  const showAllocatedGeneralRow = hasAllocatedGeneral;
  const showDirectFullLayers =
    showAllocatedGeneralRow &&
    costComposition != null &&
    !allocatedGeneral!.includeInBreakdownTotal;
  const fullActualTotal = showDirectFullLayers
    ? costComposition!.fullActual
    : breakdownTotalOverride ?? breakdown.totalActual;

  return (
    <div className="flex flex-col gap-3" data-pf-actual-breakdown>
      <h3 className="text-base font-semibold">{copy.breakdownTitle}</h3>

      {showDirectFullLayers && copy.directBreakdownSectionTitle ? (
        <p
          className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]"
          data-pf-direct-breakdown-section
        >
          {copy.directBreakdownSectionTitle}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2" data-pf-direct-breakdown-categories>
        {visibleCategories.map((category) => (
          <BreakdownCategoryCard
            key={category.key}
            category={category}
            copy={copy}
            projectId={projectId}
            laborByEmployee={laborByEmployee}
            laborTotal={laborTotal}
            subcontractCommercial={subcontractCommercial}
            isOpen={openKey === category.key}
            onToggle={() => setOpenKey(openKey === category.key ? null : category.key)}
            percentDenominator={directTotal}
          />
        ))}
      </ul>

      {showDirectFullLayers || showAllocatedGeneralRow ? (
        <div
          className="flex justify-between gap-2 border-t border-[var(--pf-border-default)] pt-2 text-sm font-semibold"
          data-pf-direct-subtotal
        >
          <span>{copy.directActualCost ?? copy.total}</span>
          <MoneyText value={directTotal} />
        </div>
      ) : null}

      {showDirectFullLayers ? (
        <div className="flex flex-col gap-2" data-pf-full-cost-layer>
          {copy.fullCostLayerTitle ? (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
              {copy.fullCostLayerTitle}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {showAllocatedGeneralRow ? (
              <AllocatedGeneralBreakdownCard
                allocatedGeneral={allocatedGeneral!}
                copy={copy}
                projectId={projectId}
                isOpen={openKey === 'allocatedGeneral'}
                onToggle={() =>
                  setOpenKey(openKey === 'allocatedGeneral' ? null : 'allocatedGeneral')
                }
                percentDenominator={fullActualTotal}
              />
            ) : null}
          </ul>
          <div
            className="flex justify-between gap-2 border-t border-[var(--pf-border-default)] pt-2 text-sm font-semibold"
            data-pf-full-actual-total
          >
            <span>{copy.fullActualIncludingGeneral ?? copy.total}</span>
            <MoneyText value={fullActualTotal} />
          </div>
        </div>
      ) : showAllocatedGeneralRow ? (
        <>
          <ul className="flex flex-col gap-2">
            <AllocatedGeneralBreakdownCard
              allocatedGeneral={allocatedGeneral!}
              copy={copy}
              projectId={projectId}
              isOpen={openKey === 'allocatedGeneral'}
              onToggle={() =>
                setOpenKey(openKey === 'allocatedGeneral' ? null : 'allocatedGeneral')
              }
              percentDenominator={fullActualTotal}
            />
          </ul>
          <div
            className="flex justify-between gap-2 border-t border-[var(--pf-border-default)] pt-2 text-sm font-semibold"
            data-pf-full-actual-total
          >
            <span>{copy.fullActualIncludingGeneral ?? copy.total}</span>
            <MoneyText value={fullActualTotal} />
          </div>
        </>
      ) : (
        <div className="flex justify-between gap-2 border-t border-[var(--pf-border-default)] pt-2 text-sm font-semibold">
          <span>{copy.total}</span>
          <MoneyText value={fullActualTotal} />
        </div>
      )}
    </div>
  );
}

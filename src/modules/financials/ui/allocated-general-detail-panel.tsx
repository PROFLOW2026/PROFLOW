'use client';

import { useState } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import {
  buildExpenseDetailHref,
  buildProjectReturnTo,
} from '@/modules/expenses/domain/expense-return-navigation';
import { showsCanonicalPoolWeight } from '../domain/allocated-general-percent-display';
import type { ProjectAllocatedGeneralDetail } from '../domain/project-allocated-general-detail';

export type AllocatedGeneralDetailCopy = {
  readonly expand: string;
  readonly collapse: string;
  readonly expenseAmount: string;
  readonly allocatedToProject: string;
  readonly poolWeightPercent: string;
  readonly informationalPercent: string;
  readonly monthBreakdownTitle: string;
  readonly supplier: string;
  readonly method: string;
  readonly poolOther: string;
  readonly openExpense: string;
  readonly sharedAcrossProjects: string;
  readonly methods: Readonly<Record<string, string>>;
};

function resolveMethodLabel(
  row: ProjectAllocatedGeneralDetail['rows'][number],
  copy: AllocatedGeneralDetailCopy,
): string | null {
  if (row.allocationMethodKey && copy.methods[row.allocationMethodKey]) {
    return copy.methods[row.allocationMethodKey] ?? null;
  }
  return row.allocationMethodLabel;
}

function formatYearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  if (!year || !month) return yearMonth;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(date);
}

export function AllocatedGeneralDetailPanel({
  detail,
  copy,
  projectId,
  inlineExpanded = false,
}: {
  detail: ProjectAllocatedGeneralDetail;
  copy: AllocatedGeneralDetailCopy;
  projectId: string;
  /** When true, rows render immediately (parent controls expand). */
  inlineExpanded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const projectReturnTo = buildProjectReturnTo(projectId, 'financials');
  if (detail.rows.length === 0) return null;

  const showRows = inlineExpanded || open;

  return (
    <div
      className={inlineExpanded ? undefined : 'mt-2 border-t border-[var(--pf-border-default)] pt-2'}
      data-pf-allocated-general-detail
      data-pf-inline={inlineExpanded ? 'true' : undefined}
    >
      {!inlineExpanded ? (
        <button
          type="button"
          className="text-xs font-medium text-[var(--pf-text-secondary)] underline-offset-2 hover:underline"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? copy.collapse : copy.expand}
        </button>
      ) : null}
      {showRows ? (
        <ul className={`flex flex-col gap-2 ${inlineExpanded ? '' : 'mt-2'}`}>
          {detail.rows.map((row) => {
            const methodLabel = resolveMethodLabel(row, copy);
            const showPoolWeight =
              showsCanonicalPoolWeight(row.allocationMethodKey) && row.poolWeightPercent;
            return (
              <li
                key={row.id}
                className="rounded-md bg-[var(--pf-bg-muted)] p-2 text-xs text-[var(--pf-text-secondary)]"
                data-pf-allocated-general-source={row.sourceKind}
              >
                <div className="font-medium text-[var(--pf-text-primary)]">
                  {row.description ?? row.yearMonth ?? copy.poolOther}
                </div>
                {row.supplierName ? (
                  <p>
                    {copy.supplier}: {row.supplierName}
                  </p>
                ) : null}
                {row.expenseGrossAmount ? (
                  <p className="flex justify-between gap-2">
                    <span>{copy.expenseAmount}</span>
                    <MoneyText value={row.expenseGrossAmount} />
                  </p>
                ) : null}
                <p className="flex justify-between gap-2 font-medium text-[var(--pf-text-primary)]">
                  <span>{copy.allocatedToProject}</span>
                  <MoneyText value={row.allocatedAmount} />
                </p>
                {showPoolWeight ? (
                  <p>
                    {copy.poolWeightPercent}: {row.poolWeightPercent}%
                  </p>
                ) : null}
                {row.informationalPercent ? (
                  <p className="text-[var(--pf-text-muted)]">
                    {copy.informationalPercent}: {row.informationalPercent}%
                  </p>
                ) : null}
                {methodLabel ? (
                  <p>
                    {copy.method}: {methodLabel}
                  </p>
                ) : null}
                {row.monthSlices && row.monthSlices.length > 1 ? (
                  <div className="mt-2 border-t border-[var(--pf-border-default)] pt-2">
                    <p className="font-medium text-[var(--pf-text-primary)]">
                      {copy.monthBreakdownTitle}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {row.monthSlices.map((slice) => (
                        <li key={slice.yearMonth} data-pf-allocated-general-month={slice.yearMonth}>
                          <p className="font-medium text-[var(--pf-text-primary)]">
                            {formatYearMonthLabel(slice.yearMonth)}
                          </p>
                          {slice.poolWeightPercent ? (
                            <p>
                              {copy.poolWeightPercent}: {slice.poolWeightPercent}%
                            </p>
                          ) : null}
                          <p className="flex justify-between gap-2">
                            <span>{copy.allocatedToProject}</span>
                            <MoneyText value={slice.allocatedAmount} />
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {row.sharedProjectCount != null && row.sharedProjectCount > 1 ? (
                  <p className="text-[var(--pf-text-muted)]">
                    {typeof copy.sharedAcrossProjects === 'string'
                      ? copy.sharedAcrossProjects.replace(
                          '{count}',
                          String(row.sharedProjectCount),
                        )
                      : ''}
                  </p>
                ) : null}
                {row.expenseId ? (
                  <Link
                    href={buildExpenseDetailHref(row.expenseId, { returnTo: projectReturnTo })}
                    className={`${textNavLinkClassName} mt-1 inline-block`}
                  >
                    {copy.openExpense}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function AllocatedGeneralSummaryLine({
  label,
  amount,
  detail,
  copy,
  projectId,
  emphasis,
}: {
  label: string;
  amount: NonNullable<Parameters<typeof MoneyText>[0]['value']>;
  detail: ProjectAllocatedGeneralDetail | null;
  copy: AllocatedGeneralDetailCopy;
  projectId: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-pf-allocated-general-summary>
      <div
        className={`flex min-w-0 justify-between gap-3 text-sm ${emphasis ? 'font-semibold' : ''}`}
      >
        <span className="min-w-0 text-[var(--pf-text-secondary)]">{label}</span>
        <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
          <MoneyText value={amount} />
        </span>
      </div>
      {detail ? (
        <AllocatedGeneralDetailPanel detail={detail} copy={copy} projectId={projectId} />
      ) : null}
    </div>
  );
}

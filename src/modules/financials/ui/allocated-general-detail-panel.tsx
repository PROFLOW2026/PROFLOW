'use client';

import { useState } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import {
  buildExpenseDetailHref,
  buildProjectReturnTo,
} from '@/modules/expenses/domain/expense-return-navigation';
import type { ProjectAllocatedGeneralDetail } from '../domain/project-allocated-general-detail';

export type AllocatedGeneralDetailCopy = {
  readonly expand: string;
  readonly collapse: string;
  readonly expenseAmount: string;
  readonly allocatedToProject: string;
  readonly allocationPercent: string;
  readonly supplier: string;
  readonly method: string;
  readonly poolOther: string;
  readonly openExpense: string;
};

export function AllocatedGeneralDetailPanel({
  detail,
  copy,
  projectId,
}: {
  detail: ProjectAllocatedGeneralDetail;
  copy: AllocatedGeneralDetailCopy;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const projectReturnTo = buildProjectReturnTo(projectId, 'financials');
  if (detail.rows.length === 0) return null;

  return (
    <div className="mt-2 border-t border-[var(--pf-border-default)] pt-2" data-pf-allocated-general-detail>
      <button
        type="button"
        className="text-xs font-medium text-[var(--pf-text-secondary)] underline-offset-2 hover:underline"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? copy.collapse : copy.expand}
      </button>
      {open ? (
        <ul className="mt-2 flex flex-col gap-2">
          {detail.rows.map((row) => (
            <li
              key={row.id}
              className="rounded-md bg-[var(--pf-bg-muted)] p-2 text-xs text-[var(--pf-text-secondary)]"
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
              {row.allocationPercent ? (
                <p>
                  {copy.allocationPercent}: {row.allocationPercent}%
                </p>
              ) : null}
              {row.allocationMethodLabel ? (
                <p>
                  {copy.method}: {row.allocationMethodLabel}
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
          ))}
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

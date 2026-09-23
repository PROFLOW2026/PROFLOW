'use client';

import type { ReactNode } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import { formatBusinessDate } from '@/shared/dates/format';
import type {
  ProjectCostPaymentSummary,
  ProjectSourcePaymentDetail,
} from '../domain/project-source-payment-detail';

export type SourcePaymentDetailCopy = {
  readonly recognizedOnProject: string;
  readonly sourceNetTotal: string;
  readonly sourceGrossTotal: string;
  readonly paidGross: string;
  readonly remainingGross: string;
  readonly expenseDate: string;
  readonly dueDate: string;
  readonly paymentStatus: string;
  readonly projectShare: string;
  readonly multiProjectNote: string;
  readonly netBasis: string;
  readonly grossBasis: string;
  readonly paymentStatusLabels: {
    readonly paid: string;
    readonly partial: string;
    readonly unpaid: string;
    readonly upcoming: string;
    readonly due: string;
    readonly overdue: string;
  };
};

function paymentStatusLabel(
  status: ProjectSourcePaymentDetail['paymentStatus'],
  copy: SourcePaymentDetailCopy,
): string {
  switch (status) {
    case 'paid':
      return copy.paymentStatusLabels.paid;
    case 'partial':
      return copy.paymentStatusLabels.partial;
    case 'overdue':
      return copy.paymentStatusLabels.overdue;
    case 'due':
      return copy.paymentStatusLabels.due;
    case 'upcoming':
      return copy.paymentStatusLabels.upcoming;
    default:
      return copy.paymentStatusLabels.unpaid;
  }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-2">
      <span className="text-[var(--pf-text-muted)]">{label}</span>
      <span className="min-w-0 text-end font-medium">{value}</span>
    </div>
  );
}

export function ProjectSourcePaymentDetailView({
  detail,
  copy,
  locale,
}: {
  detail: ProjectSourcePaymentDetail;
  copy: SourcePaymentDetailCopy;
  locale: string;
}) {
  const shareLabel =
    detail.projectSharePercent && detail.touchesMultipleProjects
      ? copy.projectShare.replace('{percent}', detail.projectSharePercent)
      : null;

  return (
    <div
      className="mt-2 flex flex-col gap-1.5 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2 text-xs"
      data-pf-source-payment-detail={detail.sourceId}
    >
      <DetailRow
        label={copy.recognizedOnProject}
        value={<MoneyText value={detail.recognizedNetOnProject} />}
      />
      {detail.touchesMultipleProjects ? (
        <>
          <DetailRow
            label={copy.sourceNetTotal}
            value={<MoneyText value={detail.sourceNetTotal} />}
          />
          {shareLabel ? <p className="text-[var(--pf-text-muted)]">{shareLabel}</p> : null}
          <p className="text-[var(--pf-text-muted)]">{copy.multiProjectNote}</p>
        </>
      ) : null}
      <DetailRow
        label={copy.sourceGrossTotal}
        value={<MoneyText value={detail.sourceGrossTotal} />}
      />
      <DetailRow label={copy.paidGross} value={<MoneyText value={detail.paidGross} />} />
      <DetailRow
        label={copy.remainingGross}
        value={<MoneyText value={detail.remainingGross} />}
      />
      <DetailRow
        label={copy.paymentStatus}
        value={paymentStatusLabel(detail.paymentStatus, copy)}
      />
      {detail.expenseDate ? (
        <DetailRow
          label={copy.expenseDate}
          value={formatBusinessDate(detail.expenseDate, locale)}
        />
      ) : null}
      {detail.dueDate ? (
        <DetailRow label={copy.dueDate} value={formatBusinessDate(detail.dueDate, locale)} />
      ) : null}
      <p className="text-[10px] text-[var(--pf-text-muted)]">
        {copy.netBasis} · {copy.grossBasis}
      </p>
    </div>
  );
}

export function ProjectCostPaymentSummaryView({
  copy,
  summary,
  locale: _locale,
}: {
  copy: {
    readonly title: string;
    readonly recognizedNet: string;
    readonly paidGross: string;
    readonly remainingGross: string;
    readonly apOutstanding: string;
    readonly multiProjectHint: string;
    readonly laborPayrollHint: string;
    readonly unavailable: string;
  };
  summary: ProjectCostPaymentSummary;
  locale: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 text-sm"
      data-pf-cost-payment-summary
    >
      <h4 className="font-semibold">{copy.title}</h4>
      <DetailRow
        label={copy.recognizedNet}
        value={<MoneyText value={summary.recognizedNet} />}
      />
      <DetailRow
        label={copy.paidGross}
        value={<MoneyText value={summary.sourcePaidGross} />}
      />
      <DetailRow
        label={copy.remainingGross}
        value={<MoneyText value={summary.sourceRemainingGross} />}
      />
      {summary.apOutstandingGross ? (
        <DetailRow
          label={copy.apOutstanding}
          value={<MoneyText value={summary.apOutstandingGross} />}
        />
      ) : null}
      {summary.multiProjectSourceCount > 0 ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{copy.multiProjectHint}</p>
      ) : null}
      <p className="text-xs text-[var(--pf-text-muted)]">{copy.laborPayrollHint}</p>
    </div>
  );
}

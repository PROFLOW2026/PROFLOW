'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import { Link } from '@/shared/i18n/navigation';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { DashboardKpiDetailContent } from '../domain/dashboard-kpi-detail';

export interface DashboardKpiDetailTriggerCopy {
  readonly button: string;
  readonly whatIs: string;
  readonly formula: string;
  readonly breakdown: string;
  readonly fullScreen: string;
}

export function DashboardKpiDetailTrigger({
  detail,
  copy,
}: {
  detail: DashboardKpiDetailContent;
  copy: DashboardKpiDetailTriggerCopy;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto min-h-0 px-0 py-0 text-xs text-[var(--pf-text-muted)] hover:bg-transparent hover:text-[var(--pf-text-secondary)]"
        >
          <Info className="me-1 size-3.5" aria-hidden />
          {copy.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{detail.title}</DialogTitle>
          <DialogDescription className="sr-only">{detail.whatIs}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 text-sm">
          {detail.value ? (
            <p className="text-lg font-semibold">
              <MoneyText value={detail.value} />
            </p>
          ) : detail.valuePercent ? (
            <p className="text-lg font-semibold tabular-nums" dir="ltr">
              {detail.valuePercent}%
            </p>
          ) : null}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
              {copy.whatIs}
            </h3>
            <p className="text-[var(--pf-text-secondary)]">{detail.whatIs}</p>
          </section>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
              {copy.formula}
            </h3>
            <p className="whitespace-pre-line text-[var(--pf-text-secondary)]">{detail.formula}</p>
          </section>
          {detail.breakdown.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
                {copy.breakdown}
              </h3>
              <dl className="space-y-2">
                {detail.breakdown.map((line) => (
                  <div key={line.label} className="flex items-start justify-between gap-3">
                    <dt className="text-[var(--pf-text-secondary)]">{line.label}</dt>
                    <dd className="text-end font-medium">
                      {line.money ? (
                        <MoneyText value={line.money} />
                      ) : (
                        (line.text ?? '—')
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {detail.fullScreenHref ? (
            <p>
              <Link
                href={detail.fullScreenHref}
                className={textNavLinkClassName}
                prefetch={false}
                onClick={() => setOpen(false)}
              >
                {detail.fullScreenLabel ?? copy.fullScreen}
              </Link>
            </p>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';
import { Link } from '@/shared/i18n/navigation';
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
import { cn } from '@/shared/ui/cn';

export interface DashboardMissingDataItemView {
  readonly code: string;
  readonly kind: 'missing' | 'attention';
  readonly title: string;
  readonly description: string;
  readonly why: string;
  readonly scope: string;
  readonly affectedLabel: string;
  readonly actionHref: string;
  readonly actionLabel: string;
}

export interface DashboardMissingDataTriggerCopy {
  readonly missingButtonOne: string;
  readonly missingButtonMany: string;
  readonly attentionButtonOne: string;
  readonly attentionButtonMany: string;
  readonly modalTitle: string;
  readonly modalDescription: string;
  readonly sectionMissing: string;
  readonly sectionAttention: string;
  readonly missingItemLabel: string;
  readonly attentionItemLabel: string;
  readonly whatHeading: string;
  readonly whyHeading: string;
  readonly scopeHeading: string;
  readonly affectedHeading: string;
}

export interface DashboardMissingDataTriggerProps {
  readonly missingItems: readonly DashboardMissingDataItemView[];
  readonly attentionItems: readonly DashboardMissingDataItemView[];
  readonly copy: DashboardMissingDataTriggerCopy;
}

function resolveTriggerLabel(
  missingCount: number,
  attentionCount: number,
  copy: DashboardMissingDataTriggerCopy,
): string {
  if (missingCount > 0) {
    return missingCount === 1
      ? copy.missingButtonOne
      : copy.missingButtonMany.replace('{count}', String(missingCount));
  }
  return attentionCount === 1
    ? copy.attentionButtonOne
    : copy.attentionButtonMany.replace('{count}', String(attentionCount));
}

function CompletenessItemCard({
  item,
  copy,
  onNavigate,
}: {
  item: DashboardMissingDataItemView;
  copy: DashboardMissingDataTriggerCopy;
  onNavigate: () => void;
}) {
  const isMissing = item.kind === 'missing';

  return (
    <article
      className={cn(
        'rounded-lg border p-4 text-sm',
        isMissing
          ? 'border-[var(--pf-status-danger-border,var(--pf-border-default))] bg-[var(--pf-status-danger-bg,var(--pf-bg-muted))]/40'
          : 'border-[var(--pf-status-warning-border,var(--pf-border-default))] bg-[var(--pf-status-warning-bg,var(--pf-bg-muted))]/30',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {isMissing ? (
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
        ) : (
          <Info className="size-4 shrink-0" aria-hidden />
        )}
        <span className="font-semibold">{item.title}</span>
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-xs font-medium',
            isMissing
              ? 'bg-[var(--pf-status-danger-bg,var(--pf-bg-muted))] text-[var(--pf-status-danger-fg,var(--pf-text-primary))]'
              : 'bg-[var(--pf-status-warning-bg,var(--pf-bg-muted))] text-[var(--pf-status-warning-fg,var(--pf-text-primary))]',
          )}
        >
          {isMissing ? copy.missingItemLabel : copy.attentionItemLabel}
        </span>
      </div>

      <dl className="grid gap-2 text-[var(--pf-text-secondary)]">
        <div>
          <dt className="text-xs font-medium text-[var(--pf-text-primary)]">{copy.whatHeading}</dt>
          <dd>{item.description}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--pf-text-primary)]">{copy.whyHeading}</dt>
          <dd>{item.why}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--pf-text-primary)]">{copy.scopeHeading}</dt>
          <dd>{item.scope}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[var(--pf-text-primary)]">
            {copy.affectedHeading}
          </dt>
          <dd>{item.affectedLabel}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <Button asChild size="sm" variant="secondary">
          <Link href={item.actionHref} prefetch={false} onClick={onNavigate}>
            {item.actionLabel}
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function DashboardMissingDataTrigger({
  missingItems,
  attentionItems,
  copy,
}: DashboardMissingDataTriggerProps) {
  const [open, setOpen] = useState(false);

  const missingCount = missingItems.length;
  const attentionCount = attentionItems.length;

  if (missingCount === 0 && attentionCount === 0) {
    return null;
  }

  const hasMissing = missingCount > 0;
  const buttonLabel = resolveTriggerLabel(missingCount, attentionCount, copy);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="dashboard-missing-data-trigger"
          data-kind={hasMissing ? 'missing' : 'attention'}
          className={cn(
            'h-auto max-w-full whitespace-normal px-2.5 py-1 text-xs font-medium',
            hasMissing
              ? 'border-[var(--pf-status-danger-border,var(--pf-border-default))] bg-[var(--pf-status-danger-bg,var(--pf-bg-muted))] text-[var(--pf-status-danger-fg,var(--pf-text-primary))] hover:bg-[var(--pf-status-danger-bg,var(--pf-bg-muted))]'
              : 'border-[var(--pf-status-warning-border,var(--pf-border-default))] bg-[var(--pf-status-warning-bg,var(--pf-bg-muted))] text-[var(--pf-status-warning-fg,var(--pf-text-primary))] hover:bg-[var(--pf-status-warning-bg,var(--pf-bg-muted))]',
          )}
        >
          {hasMissing ? (
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <Info className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{buttonLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.modalTitle}</DialogTitle>
          <DialogDescription>{copy.modalDescription}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex max-h-[min(70vh,32rem)] flex-col gap-5 overflow-y-auto">
          {missingCount > 0 ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{copy.sectionMissing}</h3>
              {missingItems.map((item) => (
                <CompletenessItemCard
                  key={`missing-${item.code}-${item.scope}-${item.title}`}
                  item={item}
                  copy={copy}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </section>
          ) : null}
          {attentionCount > 0 ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{copy.sectionAttention}</h3>
              {attentionItems.map((item) => (
                <CompletenessItemCard
                  key={`attention-${item.code}-${item.scope}-${item.title}`}
                  item={item}
                  copy={copy}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </section>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

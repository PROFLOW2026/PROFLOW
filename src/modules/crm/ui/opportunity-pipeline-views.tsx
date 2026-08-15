'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Columns3, Table2 } from 'lucide-react';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { formatBusinessDate } from '@/shared/dates/format';
import { isBusinessDate } from '@/shared/dates/dates';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  groupOpportunitiesByStage,
  isOpportunityStage,
  nextActionUrgency,
  type OpportunityBoardCard,
} from '../domain/pipeline-board';
import { OPPORTUNITY_STAGES } from '../domain/types';
import { updateOpportunityAction, type CrmFormState } from '@/app/[locale]/(app)/crm/actions';

function NextActionBadge({
  nextActionAt,
  nextActionText,
  locale,
}: {
  nextActionAt: Date | string | null;
  nextActionText: string | null;
  locale: string;
}) {
  const t = useTranslations('crm.followUp');
  const urgency = nextActionUrgency(nextActionAt);
  const dueLabel =
    nextActionAt != null && nextActionAt !== ''
      ? new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(typeof nextActionAt === 'string' ? new Date(nextActionAt) : nextActionAt)
      : null;
  const toneClass =
    urgency === 'overdue'
      ? 'text-[var(--pf-status-danger-fg)]'
      : urgency === 'due'
        ? 'text-[var(--pf-status-warning-fg)]'
        : 'text-[var(--pf-text-secondary)]';

  return (
    <p className={cn('mt-2 text-start text-xs', toneClass)}>
      {urgency === 'overdue' ? `${t('overdue')}: ` : urgency === 'due' ? `${t('due')}: ` : `${t('nextActionShort')}: `}
      {itemText(nextActionText, dueLabel)}
    </p>
  );
}

function itemText(nextActionText: string | null, dueLabel: string | null): string {
  const text = nextActionText?.trim() ?? '';
  if (text && dueLabel) return `${text} · ${dueLabel}`;
  return text || dueLabel || '';
}

function statusShape(status: string): 'active' | 'archived' {
  return status === 'open' ? 'active' : 'archived';
}

function OpportunityValue({
  amount,
  currency,
}: {
  amount: string | null;
  currency: string | null;
}) {
  if (!amount) return <span>—</span>;
  return (
    <span dir="ltr">
      {`${amount} ${currency ?? ''}`.trim()}
    </span>
  );
}

function BoardStageSelect({
  opportunityId,
  stage,
}: {
  opportunityId: string;
  stage: OpportunityBoardCard['stage'];
}) {
  const t = useTranslations('crm');
  const [, formAction, pending] = useActionState<CrmFormState, FormData>(
    updateOpportunityAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="mt-2"
      onClick={(event) => event.stopPropagation()}
    >
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <label className="sr-only" htmlFor={`opportunity-stage-${opportunityId}`}>
        {t('list.columns.stage')}
      </label>
      <select
        id={`opportunity-stage-${opportunityId}`}
        name="stage"
        data-testid={`opportunity-stage-${opportunityId}`}
        defaultValue={stage}
        disabled={pending}
        className="block min-h-9 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs"
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
      >
        {OPPORTUNITY_STAGES.map((value) => (
          <option key={value} value={value}>
            {t(`stages.${value}`)}
          </option>
        ))}
      </select>
    </form>
  );
}

function BoardCard({
  item,
  canMoveStages,
}: {
  item: OpportunityBoardCard;
  canMoveStages: boolean;
}) {
  const t = useTranslations('crm');
  const locale = useLocale();
  const notesPreview = item.notes?.trim() ? item.notes.trim() : null;

  return (
    <article className={cn(pressableCardLinkClassName, 'hover:bg-[var(--pf-bg-surface)]')}>
      <Link href={`/crm/opportunities/${item.id}`} className="min-w-0 font-semibold">
        {item.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge
          className="shrink-0"
          shape={statusShape(item.status)}
          label={
            t.has(`statuses.opportunity.${item.status}`)
              ? t(`statuses.opportunity.${item.status}`)
              : item.status
          }
        />
        {item.expectedValueAmount ? (
          <span className="text-sm text-[var(--pf-text-secondary)]">
            <OpportunityValue amount={item.expectedValueAmount} currency={item.currency} />
          </span>
        ) : null}
      </div>
      {item.expectedStartDate && isBusinessDate(item.expectedStartDate) ? (
        <p className="mt-2 text-start text-xs text-[var(--pf-text-secondary)]">
          {t('followUp.expectedStartShort')}: {formatBusinessDate(item.expectedStartDate, locale, 'short')}
        </p>
      ) : null}
      {item.nextActionAt || item.nextActionText?.trim() ? (
        <NextActionBadge
          nextActionAt={item.nextActionAt}
          nextActionText={item.nextActionText}
          locale={locale}
        />
      ) : null}
      {notesPreview ? (
        <p className="mt-1 line-clamp-2 text-start text-xs text-[var(--pf-text-muted)]">
          {t('followUp.notesShort')}: {notesPreview}
        </p>
      ) : null}
      {canMoveStages ? <BoardStageSelect opportunityId={item.id} stage={item.stage} /> : null}
    </article>
  );
}

function OpportunityTable({ items }: { items: readonly OpportunityBoardCard[] }) {
  const t = useTranslations('crm');

  return (
    <ResponsiveTable
      items={items}
      getRowKey={(row) => row.id}
      desktop={
        <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.columns.name')}</TableHead>
                <TableHead>{t('list.columns.stage')}</TableHead>
                <TableHead>{t('list.columns.status')}</TableHead>
                <TableHead numeric>{t('list.columns.value')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/crm/opportunities/${row.id}`}
                      className={cn(textNavLinkClassName, 'font-medium')}
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {isOpportunityStage(row.stage) ? t(`stages.${row.stage}`) : row.stage}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      shape={statusShape(row.status)}
                      label={
                        t.has(`statuses.opportunity.${row.status}`)
                          ? t(`statuses.opportunity.${row.status}`)
                          : row.status
                      }
                    />
                  </TableCell>
                  <TableCell numeric>
                    <OpportunityValue amount={row.expectedValueAmount} currency={row.currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(row) => (
        <Link href={`/crm/opportunities/${row.id}`} className={pressableCardLinkClassName}>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-start font-semibold">{row.name}</span>
            <StatusBadge
              className="shrink-0"
              shape={statusShape(row.status)}
              label={
                t.has(`statuses.opportunity.${row.status}`)
                  ? t(`statuses.opportunity.${row.status}`)
                  : row.status
              }
            />
          </div>
          <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
            {isOpportunityStage(row.stage) ? t(`stages.${row.stage}`) : row.stage}
            {row.expectedValueAmount ? (
              <>
                {' · '}
                <OpportunityValue amount={row.expectedValueAmount} currency={row.currency} />
              </>
            ) : null}
          </p>
        </Link>
      )}
    />
  );
}

export function OpportunityPipelineViews({
  items,
  canMoveStages = false,
}: {
  items: readonly OpportunityBoardCard[];
  canMoveStages?: boolean;
}) {
  const t = useTranslations('crm');
  const columns = groupOpportunitiesByStage(items);

  return (
    <Tabs defaultValue="board">
      <TabsList aria-label={t('list.viewLabel')}>
        <TabsTrigger value="board" className="inline-flex items-center gap-1.5">
          <Columns3 aria-hidden className="size-4" />
          {t('list.boardView')}
        </TabsTrigger>
        <TabsTrigger value="table" className="inline-flex items-center gap-1.5">
          <Table2 aria-hidden className="size-4" />
          {t('list.tableView')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="board">
        <div className="flex min-w-0 max-w-full gap-3 overflow-x-auto overscroll-x-contain pb-2">
          {columns.map((column) => (
            <section
              key={column.stage}
              data-testid={`pipeline-column-${column.stage}`}
              aria-labelledby={`pipeline-stage-${column.stage}`}
              className="flex w-[min(18rem,80vw)] shrink-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-3"
            >
              <h2
                id={`pipeline-stage-${column.stage}`}
                className="flex items-baseline justify-between gap-2 text-sm font-semibold"
              >
                <span>
                  {isOpportunityStage(column.stage) ? t(`stages.${column.stage}`) : column.stage}
                </span>
                <span className="text-xs font-normal text-[var(--pf-text-muted)]" aria-hidden>
                  {column.items.length}
                </span>
              </h2>
              {column.items.length === 0 ? (
                <p className="text-xs text-[var(--pf-text-muted)]">{t('board.emptyColumn')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {column.items.map((item) => (
                    <li key={item.id}>
                      <BoardCard item={item} canMoveStages={canMoveStages} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="table">
        <OpportunityTable items={items} />
      </TabsContent>
    </Tabs>
  );
}

import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBusinessDate } from '@/shared/dates/format';
import { listAuditEventSummariesForEntity } from '@/shared/audit';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import type { OrgContext } from '@/shared/auth/context';

const EXPENSE_TIMELINE_ACTIONS = [
  AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMATION_VOIDED,
  AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMED,
  'expense.finalized',
  'expense.created',
  'expense.updated',
  'expense.voided',
] as const;

const EXPENSE_TIMELINE_ACTION_KEYS = new Set<string>(EXPENSE_TIMELINE_ACTIONS);

export async function ExpenseActivityTimeline({
  context,
  expenseId,
  locale,
}: {
  readonly context: OrgContext;
  readonly expenseId: string;
  readonly locale: string;
}) {
  const t = await getTranslations('expenses.activityTimeline');
  const events = await listAuditEventSummariesForEntity(context, {
    entityType: 'expense',
    entityId: expenseId,
    limit: 40,
  });

  const filtered = events.filter((event) =>
    (EXPENSE_TIMELINE_ACTIONS as readonly string[]).includes(event.action),
  );

  if (filtered.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {filtered.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
            >
              <span>
                {EXPENSE_TIMELINE_ACTION_KEYS.has(event.action)
                  ? t(`actions.${event.action}` as 'actions.expense.payment_confirmation_voided')
                  : event.action}
              </span>
              <span dir="ltr" className="text-xs text-[var(--pf-text-muted)]">
                {formatBusinessDate(event.createdAt.toISOString().slice(0, 10), locale)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

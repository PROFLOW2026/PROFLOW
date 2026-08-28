import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { ExpenseCorrectionChain } from '@/modules/expenses';
import { statusShape } from '@/modules/expenses/domain/lifecycle';
import { formatReversalDescription } from '@/modules/expenses/ui/expense-list-label';
import { buildExpenseDetailHref } from '@/modules/expenses/domain/expense-return-navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function ExpenseCorrectionHistory({
  chain,
  currentExpenseId,
  returnTo,
}: {
  readonly chain: ExpenseCorrectionChain;
  readonly currentExpenseId: string;
  readonly returnTo?: string | null;
}) {
  if (!chain.hasLinks) return null;

  const t = await getTranslations('expenses');
  const tStatus = await getTranslations('status');
  const locale = await getLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.correctionHistory')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.correctionHistoryHint')}</p>
        <ul className="flex flex-col gap-2">
          {chain.entries.map((entry) => {
            const isCurrent = entry.id === currentExpenseId;
            return (
              <li
                key={entry.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--pf-border-default)] py-2 last:border-0"
              >
                <div className="min-w-0 flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`detail.correctionRole.${entry.role}`)}</span>
                    <StatusBadge
                      shape={statusShape(entry.status)}
                      label={tStatus(`expense.${entry.status}`)}
                    />
                    {isCurrent ? (
                      <span className="text-xs text-[var(--pf-text-muted)]">({t('detail.title')})</span>
                    ) : (
                      <Link
                        href={buildExpenseDetailHref(entry.id, { returnTo })}
                        className={cn(textNavLinkClassName, 'text-xs')}
                      >
                        {entry.id.slice(0, 8)}…
                      </Link>
                    )}
                  </div>
                  <span className="text-xs text-[var(--pf-text-muted)]">
                    {formatBusinessDate(entry.expenseDate, locale)}
                    {entry.description
                      ? ` · ${
                          entry.role === 'reversal'
                            ? formatReversalDescription(entry.description, t)
                            : entry.description
                        }`
                      : null}
                  </span>
                </div>
                <MoneyText value={entry.netAmount} className="shrink-0 font-medium" />
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--pf-border-default)] pt-3 font-medium">
          <span>{t('detail.correctionNet')}</span>
          <MoneyText value={chain.netAmount} />
        </div>
      </CardContent>
    </Card>
  );
}

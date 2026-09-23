import { withOrgContext } from '@/shared/auth/session';
import { ExpenseActivityTimeline } from './expense-activity-timeline';

export async function ExpenseActivityTimelineSection({
  expenseId,
  locale,
}: {
  readonly expenseId: string;
  readonly locale: string;
}) {
  return withOrgContext(async (context) => (
    <ExpenseActivityTimeline context={context} expenseId={expenseId} locale={locale} />
  ));
}

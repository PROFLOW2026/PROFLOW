import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VendorFinancialActivity } from '../application/get-vendor-financial-activity';
import { VendorFinancialActivityView } from './vendor-financial-activity-view';

export async function VendorFinancialActivityPanel({
  activity,
  locale,
}: {
  readonly activity: VendorFinancialActivity | null;
  readonly locale: string;
}) {
  const t = await getTranslations('vendors.financialActivity');

  if (!activity || activity.expenses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        </CardContent>
      </Card>
    );
  }

  return <VendorFinancialActivityView activity={activity} locale={locale} />;
}

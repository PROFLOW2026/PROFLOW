import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listReceivedExpenseImports } from '@/modules/expense-ingestion/server';
import { getOrgExpenseIngestionSettings } from '@/modules/expense-ingestion/server';
import { isSumitExpenseIngestionEnabled } from '@/modules/expense-ingestion';
import { isOcrReviewUiAllowed } from '@/modules/ocr/domain/feature-gate';
import { ReceivedExpensesList } from './received-expenses-list';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('received.title') };
}

export default async function ReceivedExpensesPage() {
  const t = await getTranslations('expenses');

  const data = await withOrgContext(async (context) => {
    const [rows, settings] = await Promise.all([
      listReceivedExpenseImports(context),
      getOrgExpenseIngestionSettings(context),
    ]);
    return {
      rows,
      ingestionEnabled: isSumitExpenseIngestionEnabled(settings),
    };
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('received.title')}
        description={t('received.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/expenses">{t('backToList')}</Link>
            </Button>
            {isOcrReviewUiAllowed() ? (
              <Button asChild variant="secondary">
                <Link href="/documents/ocr-review?target=vendor_bill">
                  {t('received.openOcrReview')}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {!data.ingestionEnabled ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('received.ingestionOff')}</p>
      ) : null}

      <ReceivedExpensesList rows={data.rows} />
    </div>
  );
}

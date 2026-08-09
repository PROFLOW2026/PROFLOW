import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { getChangeRequestDetail } from '@/modules/commercial';
import { QuoteVersionForm } from '@/modules/commercial/ui/quote-version-form';
import { withOrgContext } from '@/shared/auth/session';
import { createQuoteVersionAction } from '../../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('changes');
  return { title: t('quote.pageTitle') };
}

export default async function PriceChangePage({
  params,
}: {
  params: Promise<{ changeRequestId: string }>;
}) {
  const t = await getTranslations('changes');
  const { changeRequestId } = await params;

  const detail = await withOrgContext(async (context) =>
    getChangeRequestDetail(context, changeRequestId).catch(() => null),
  );

  if (!detail || detail.status !== 'draft') notFound();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('quote.pageTitle')} description={t('quote.pageDescription')} />
      <QuoteVersionForm
        changeRequestId={changeRequestId}
        action={createQuoteVersionAction}
        currency={detail.currency}
      />
    </div>
  );
}

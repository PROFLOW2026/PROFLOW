import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import { CommercialDocsHub } from '@/modules/quotes/ui/commercial-docs-hub';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quotes' });
  return { title: t('hub.salesTitle') };
}

export default async function SalesHubPage() {
  const t = await getTranslations('quotes');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('hub.salesTitle')} description={t('hub.salesDescription')} />

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/quotes" className={cn(pressableCardLinkClassName, 'min-w-0 hover:bg-[var(--pf-bg-subtle)]')}>
          <p className="text-xs font-medium text-[var(--pf-text-brand)]">{t('hub.primary')}</p>
          <p className="mt-1 font-semibold">{t('hub.quotesBidsTitle')}</p>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('hub.quotesBidsBody')}</p>
        </Link>
        <Link href="/crm" className={cn(pressableCardLinkClassName, 'min-w-0 hover:bg-[var(--pf-bg-subtle)]')}>
          <p className="text-xs font-medium text-[var(--pf-text-muted)]">{t('hub.optional')}</p>
          <p className="mt-1 font-semibold">{t('hub.pipelineTitle')}</p>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('hub.pipelineBody')}</p>
        </Link>
      </div>

      <CommercialDocsHub current="hub" />
    </div>
  );
}

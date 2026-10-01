import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { listQuoteSettingsBlocks } from '@/modules/quotes/application/manage-quote-settings';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { QuoteSettingsPanel } from './quote-settings-panel';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quotes.settings' });
  return { title: t('title') };
}

export default async function QuoteModuleSettingsPage() {
  const t = await getTranslations('quotes.settings');
  const tQuotes = await getTranslations('quotes');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.QUOTES_READ)) {
      return { allowed: false as const };
    }
    const blocks = await listQuoteSettingsBlocks(context);
    return {
      allowed: true as const,
      blocks,
      canEdit: hasPermission(context, PERMISSIONS.QUOTES_MANAGE),
    };
  });

  if (!data.allowed) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        breadcrumb={
          <Link href="/quotes" className={textNavLinkMutedClassName}>
            {tQuotes('title')}
          </Link>
        }
      />
      <Card className="min-w-0 overflow-hidden p-5">
        <QuoteSettingsPanel blocks={data.blocks} canEdit={data.canEdit} />
      </Card>
    </div>
  );
}

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { listQuickCaptureInboxAction } from '@/modules/quick-capture/application/quick-capture-actions';
import { QuickCaptureInboxList } from '@/modules/quick-capture/ui/quick-capture-inbox-list';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quickCapture' });
  return { title: t('inbox.title') };
}

export default async function QuickCaptureInboxPage() {
  const t = await getTranslations('quickCapture');
  const inbox = await listQuickCaptureInboxAction();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('inbox.title')}
        actions={
          <Link
            href="/quick-capture"
            className={cn(textNavLinkClassName, 'rounded-sm text-sm font-medium')}
          >
            {t('title')}
          </Link>
        }
      />

      {!inbox.ok ? <Alert tone="warning">{inbox.error}</Alert> : <QuickCaptureInboxList items={inbox.data} />}
    </div>
  );
}

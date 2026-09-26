import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { getQuickCaptureFormDataAction } from '@/modules/quick-capture/application/quick-capture-actions';
import { QuickCaptureForm } from '@/modules/quick-capture/ui/quick-capture-form';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quickCapture' });
  return { title: t('title') };
}

export default async function QuickCapturePage() {
  const t = await getTranslations('quickCapture');
  const formData = await getQuickCaptureFormDataAction();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('form.description')}
        actions={
          <Link
            href="/quick-capture/inbox"
            className={cn(textNavLinkClassName, 'rounded-sm text-sm font-medium')}
          >
            {t('inbox.title')}
          </Link>
        }
      />

      {!formData.ok ? (
        <Alert tone="warning">{formData.error}</Alert>
      ) : (
        <QuickCaptureForm
          projects={formData.data.projects}
          canManageDocuments={formData.data.canManageDocuments}
          storageConfigured={formData.data.storageConfigured}
        />
      )}
    </div>
  );
}

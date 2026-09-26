import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { getQuickCaptureReviewAction } from '@/modules/quick-capture/application/quick-capture-actions';
import { QuickCaptureReview } from '@/modules/quick-capture/ui/quick-capture-review';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; captureId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quickCapture' });
  return { title: t('review.title') };
}

export default async function QuickCaptureReviewPage({
  params,
}: {
  params: Promise<{ captureId: string }>;
}) {
  const { captureId } = await params;
  const t = await getTranslations('quickCapture');
  const review = await getQuickCaptureReviewAction(captureId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('review.title')}
        actions={
          <Link
            href="/quick-capture/inbox"
            className={cn(textNavLinkClassName, 'rounded-sm text-sm font-medium')}
          >
            {t('inbox.title')}
          </Link>
        }
      />

      {!review.ok ? (
        <Alert tone="warning">{review.error}</Alert>
      ) : (
        <QuickCaptureReview initialData={review.data} />
      )}
    </div>
  );
}

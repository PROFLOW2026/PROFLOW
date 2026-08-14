import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BoqMeasurePanel } from '@/modules/boq/ui/boq-measure-panel';
import { getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';

interface BoqMeasurePageProps {
  params: Promise<{ locale: string; projectId: string }>;
}

export async function generateMetadata({ params }: BoqMeasurePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'boq.measure' });
  return { title: t('title') };
}

export default async function BoqMeasurePage({ params }: BoqMeasurePageProps) {
  const { projectId } = await params;
  const shell = await getShellContext();
  const canRead = shell?.permissions.has(PERMISSIONS.BOQ_READ) ?? false;
  if (!shell?.modules.boq || !canRead) notFound();

  return <BoqMeasurePanel projectId={projectId} />;
}

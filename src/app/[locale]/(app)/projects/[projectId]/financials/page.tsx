import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';

interface ProjectFinancialsPageProps {
  params: Promise<{ projectId: string; locale: string }>;
}

/** Legacy route — financials live on the project workspace tab. */
export default async function ProjectFinancialsPage({ params }: ProjectFinancialsPageProps) {
  const { projectId, locale } = await params;
  redirect({ href: `/projects/${projectId}?tab=financials`, locale });
}

export async function generateMetadata() {
  return {};
}

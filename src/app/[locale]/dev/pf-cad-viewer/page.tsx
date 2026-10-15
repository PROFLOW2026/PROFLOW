import { notFound } from 'next/navigation';
import { PfCadLocalDevPage } from '@/modules/external-storage/ui/cad/pf-cad/pf-cad-local-dev-page';

export default async function PfCadLocalViewerRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  const { locale } = await params;
  return <PfCadLocalDevPage locale={locale} />;
}

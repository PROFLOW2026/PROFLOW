import { redirect } from '@/shared/i18n/navigation';

export default async function WorkforcePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/workforce/employees', locale });
}

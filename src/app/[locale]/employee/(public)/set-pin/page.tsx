import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmployeeSetPinForm } from '@/modules/employee-app/ui/employee-set-pin-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'employeeApp' });
  return { title: t('setPin.title') };
}

export default function EmployeeSetPinPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <EmployeeSetPinForm />
    </div>
  );
}

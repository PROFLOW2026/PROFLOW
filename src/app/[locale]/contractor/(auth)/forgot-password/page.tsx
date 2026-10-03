import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContractorForgotPasswordForm } from '@/modules/contractor-access/ui/contractor-auth-forms';
import { contractorForgotPasswordAction } from '../actions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorAccess' });
  return { title: t('auth.forgot.title') };
}

export default function ContractorForgotPasswordPage() {
  return <ContractorForgotPasswordForm action={contractorForgotPasswordAction} />;
}

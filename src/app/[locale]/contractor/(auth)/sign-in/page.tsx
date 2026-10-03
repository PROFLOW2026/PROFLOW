import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getExternalSessionState } from '@/modules/contractor-access';
import { ContractorSignInForm } from '@/modules/contractor-access/ui/contractor-auth-forms';
import { redirect } from '@/shared/i18n/navigation';
import { contractorSignInAction } from '../actions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorAccess' });
  return { title: t('auth.signIn.title') };
}

const REASONS = new Set(['not_contractor', 'inactive', 'session_revoked']);

export default async function ContractorSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const raw = (await searchParams) ?? {};
  const t = await getTranslations('contractorAccess');

  const session = await getExternalSessionState();
  if (session.status === 'authenticated') redirect({ href: '/contractor', locale });

  const reason = typeof raw.reason === 'string' && REASONS.has(raw.reason) ? raw.reason : null;
  const next = typeof raw.next === 'string' ? raw.next : undefined;

  return (
    <ContractorSignInForm
      action={contractorSignInAction}
      next={next}
      notice={reason ? t(`auth.signIn.reason.${reason}`) : null}
    />
  );
}

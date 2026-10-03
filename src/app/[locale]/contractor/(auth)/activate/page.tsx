import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { inspectContractorToken } from '@/modules/contractor-access';
import { ContractorLinkProblem, ContractorSetPasswordForm } from '@/modules/contractor-access/ui/contractor-auth-forms';
import { getAdminDb } from '@/shared/db/client';
import { contractorActivateAction } from '../actions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorAccess' });
  return { title: t('auth.activate.title') };
}

export default async function ContractorActivatePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams) ?? {};
  const token = typeof raw.token === 'string' ? raw.token : '';
  const t = await getTranslations('contractorAccess');
  const inspection = token ? await inspectContractorToken({ db: getAdminDb() }, token, 'invite') : null;

  if (!inspection || !inspection.ok) {
    return <ContractorLinkProblem message={t(`errors.link_${inspection?.reason ?? 'invalid'}`)} />;
  }
  return (
    <ContractorSetPasswordForm action={contractorActivateAction} token={token} username={inspection.username} mode="activate" />
  );
}

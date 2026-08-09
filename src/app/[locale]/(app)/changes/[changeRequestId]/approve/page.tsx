import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { getChangeRequestDetail } from '@/modules/commercial';
import { ApproveChangeForm } from '@/modules/commercial/ui/approve-change-form';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { approveChangeAction } from '../../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('changes');
  return { title: t('approve.pageTitle') };
}

export default async function ApproveChangePage({
  params,
}: {
  params: Promise<{ changeRequestId: string }>;
}) {
  const t = await getTranslations('changes');
  const { changeRequestId } = await params;
  const shell = await getShellContext();

  const detail = await withOrgContext(async (context) =>
    getChangeRequestDetail(context, changeRequestId).catch(() => null),
  );

  if (!detail || detail.status !== 'awaiting_approval') notFound();

  const canApprove = shell?.permissions.has(PERMISSIONS.CHANGES_APPROVE) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('approve.pageTitle')} description={t('approve.pageDescription')} />
      <ApproveChangeForm detail={detail} action={approveChangeAction} canApprove={canApprove} />
    </div>
  );
}

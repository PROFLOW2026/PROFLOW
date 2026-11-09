'use client';

import { useTranslations } from 'next-intl';
import { ActionForm, FormField } from '@/modules/subcontracts/ui/action-form';
import { reportPortalWarrantyIssueAction } from '@/app/[locale]/contractor/(portal)/projects/[projectId]/warranty/actions';

type AgreementOption = {
  readonly id: string;
  readonly title: string | null;
};

export function PortalWarrantyReportForm({
  organizationId,
  projectId,
  vendorId,
  agreements,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly agreements: readonly AgreementOption[];
}) {
  const t = useTranslations('handover');
  if (agreements.length === 0) return null;

  const defaultAgreementId = agreements.length === 1 ? agreements[0]!.id : '';

  return (
    <ActionForm
      action={reportPortalWarrantyIssueAction}
      hidden={{
        organizationId,
        projectId,
        vendorId,
        ...(defaultAgreementId ? { agreementId: defaultAgreementId } : {}),
      }}
      submitLabel={t('portalWarranty.submit')}
      successLabel={t('portalWarranty.submitted')}
    >
      {agreements.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('portalWarranty.agreement')}</span>
          <select
            name="agreementId"
            required
            className="min-h-10 rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg)] px-3"
            defaultValue=""
          >
            <option value="" disabled>
              {t('portalWarranty.chooseAgreement')}
            </option>
            {agreements.map((agreement) => (
              <option key={agreement.id} value={agreement.id}>
                {agreement.title ?? agreement.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <FormField label={t('portalWarranty.reportTitle')} name="title" required />
      <FormField label={t('portalWarranty.notes')} name="notes" multiline />
    </ActionForm>
  );
}

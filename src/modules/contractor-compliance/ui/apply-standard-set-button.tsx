'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/shared/i18n/navigation';
import { applyStandardRequirementSetAction } from '../actions/internal-actions';

export function ApplyStandardSetButton({
  projectId,
  agreementIds,
}: {
  projectId: string;
  agreementIds: readonly string[];
}) {
  const t = useTranslations('contractorCompliance');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (agreementIds.length === 0) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await applyStandardRequirementSetAction({
            projectId,
            agreementIds: [...agreementIds],
            titles: {
              insurance: t('kinds.insurance'),
              tax_certificate: t('kinds.tax_certificate'),
              bookkeeping_certificate: t('kinds.bookkeeping_certificate'),
              safety_certification: t('kinds.safety_certification'),
              license: t('kinds.license'),
              guarantee: t('kinds.guarantee'),
            },
          });
          router.refresh();
        });
      }}
    >
      {t('actions.applyStandardSet')}
    </Button>
  );
}

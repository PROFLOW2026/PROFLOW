'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { useRouter } from '@/shared/i18n/navigation';
import { archiveComplianceArtifactAction } from './actions';

export function ArchiveArtifactButton({ artifactId }: { artifactId: string }) {
  const t = useTranslations('compliance.detail');
  const tCommon = useTranslations('common');
  const router = useRouter();

  return (
    <ConfirmAction
      title={t('archiveTitle')}
      description={<p>{t('archiveBody')}</p>}
      confirmLabel={t('archive')}
      successMessage={t('archiveSuccess')}
      onConfirm={async () => {
        const result = await archiveComplianceArtifactAction(artifactId);
        if (result.error) return { error: result.error };
        router.push('/compliance');
        return { ok: true };
      }}
      trigger={
        <Button type="button" variant="ghost">
          {tCommon('actions.archive')}
        </Button>
      }
    />
  );
}

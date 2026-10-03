'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/shared/i18n/navigation';
import { submitContractorComplianceDocumentAction } from '../actions/external-actions';

export function ContractorComplianceSubmitForm({
  organizationId,
  projectId,
  requirementId,
  requirementTitle,
  requiresExpiry,
}: {
  organizationId: string;
  projectId: string;
  requirementId: string;
  requirementTitle: string;
  requiresExpiry: boolean;
}) {
  const t = useTranslations('contractorCompliance');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [expiresOn, setExpiresOn] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{requirementTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <p className="text-sm text-[var(--pf-danger)]">{error}</p> : null}
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('fields.referenceNumber')}</span>
          <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </label>
        {requiresExpiry ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('fields.expiresOn')}</span>
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required />
          </label>
        ) : null}
        <Button
          type="button"
          variant="primary"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await submitContractorComplianceDocumentAction({
                organizationId,
                projectId,
                requirementId,
                referenceNumber: referenceNumber || undefined,
                expiresOn: expiresOn || undefined,
              });
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        >
          {t('portal.submit')}
        </Button>
      </CardContent>
    </Card>
  );
}

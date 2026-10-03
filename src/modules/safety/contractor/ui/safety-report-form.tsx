'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/shared/i18n/navigation';
import { CONTRACTOR_SAFETY_RECORD_TYPES } from '../domain';
import { reportContractorSafetyAction } from '../actions/internal-actions';
import { reportSafetyFromPortalAction } from '../actions/external-actions';

type Mode = 'internal' | 'portal';

export function SafetyReportForm({
  mode,
  projectId,
  organizationId,
  vendorId,
}: {
  mode: Mode;
  projectId: string;
  organizationId?: string;
  vendorId?: string;
}) {
  const t = useTranslations('contractorCompliance');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recordType, setRecordType] = useState<(typeof CONTRACTOR_SAFETY_RECORD_TYPES)[number]>('observation');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('safety.reportTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <p className="text-sm text-[var(--pf-danger)]">{error}</p> : null}
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('safety.fields.type')}</span>
          <select
            className="min-h-10 rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg)] px-3"
            value={recordType}
            onChange={(e) => setRecordType(e.target.value as (typeof CONTRACTOR_SAFETY_RECORD_TYPES)[number])}
          >
            {CONTRACTOR_SAFETY_RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`safety.types.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('safety.fields.title')}</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('safety.fields.description')}</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <Button
          type="button"
          variant="primary"
          disabled={pending || !title.trim() || !description.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const occurredAt = new Date();
              const payload = {
                projectId,
                recordType,
                title: title.trim(),
                description: description.trim(),
                occurredAt,
              };
              const result =
                mode === 'internal' && vendorId
                  ? await reportContractorSafetyAction({ ...payload, vendorId })
                  : organizationId
                    ? await reportSafetyFromPortalAction({ ...payload, organizationId })
                    : { ok: false as const, error: t('safety.errors.missingScope') };
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        >
          {t('safety.submit')}
        </Button>
      </CardContent>
    </Card>
  );
}

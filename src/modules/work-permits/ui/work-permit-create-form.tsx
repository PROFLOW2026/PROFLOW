'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/shared/i18n/navigation';
import { createWorkPermitDraftAction } from '../actions/internal-actions';

export function WorkPermitCreateForm({ projectId, cancelHref }: { projectId: string; cancelHref: string }) {
  const t = useTranslations('workPermits');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [permitType, setPermitType] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('create.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <p className="text-sm text-[var(--pf-danger)]">{error}</p> : null}
        <MainAppFormGrid dense>
          <Field label={t('fields.title')} required className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} value={title} onChange={(e) => setTitle(e.target.value)} required />
            )}
          </Field>
          <Field label={t('fields.permitType')} required className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} value={permitType} onChange={(e) => setPermitType(e.target.value)} required />
            )}
          </Field>
          <Field label={t('fields.validFrom')} className={mainAppFieldSpan.md}>
            {(control) => (
              <Input {...control} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            )}
          </Field>
          <Field label={t('fields.validUntil')} className={mainAppFieldSpan.md}>
            {(control) => (
              <Input {...control} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            )}
          </Field>
          <Field label={t('fields.notes')} className={mainAppFieldSpan.full}>
            {(control) => (
              <Textarea {...control} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            )}
          </Field>
        </MainAppFormGrid>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={pending || !title.trim() || !permitType.trim()}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await createWorkPermitDraftAction({
                  projectId,
                  title: title.trim(),
                  permitType: permitType.trim(),
                  validFrom: validFrom || null,
                  validUntil: validUntil || null,
                  notes: notes.trim() || null,
                });
                if (!result.ok) setError(result.error);
                else router.push(cancelHref);
              });
            }}
          >
            {t('create.submit')}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => router.push(cancelHref)}>
            {t('create.cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

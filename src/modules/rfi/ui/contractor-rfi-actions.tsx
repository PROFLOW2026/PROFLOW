'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/shared/i18n/navigation';
import { submitContractorRfiAction, updateContractorRfiAction } from '../actions/external-actions';
import { FormError, FormRow } from './form-controls';

export function ContractorRfiActions({
  organizationId,
  rfiId,
  canEdit,
  canSubmit,
  subject,
  question,
}: {
  organizationId: string;
  rfiId: string;
  canEdit: boolean;
  canSubmit: boolean;
  subject: string;
  question: string;
}) {
  const t = useTranslations('rfi');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState(subject);
  const [draftQuestion, setDraftQuestion] = useState(question);

  if (!canEdit && !canSubmit) return null;

  function refresh() {
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('actions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError message={error} />
        {canEdit ? (
          <>
            <FormRow label={t('fields.subject')}>
              <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
            </FormRow>
            <FormRow label={t('fields.question')}>
              <Textarea value={draftQuestion} onChange={(e) => setDraftQuestion(e.target.value)} rows={4} />
            </FormRow>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await updateContractorRfiAction({
                    organizationId,
                    rfiId,
                    subject: draftSubject,
                    question: draftQuestion,
                  });
                  if (!result.ok) setError(result.error);
                  else refresh();
                });
              }}
            >
              {t('actions.save')}
            </Button>
          </>
        ) : null}
        {canSubmit ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await submitContractorRfiAction({ organizationId, rfiId });
                if (!result.ok) setError(result.error);
                else refresh();
              });
            }}
          >
            {t('actions.submit')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

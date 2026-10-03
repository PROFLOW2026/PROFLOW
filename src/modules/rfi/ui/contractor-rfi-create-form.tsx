'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RFI_PRIORITIES } from '../domain/types';
import { useRouter } from '@/shared/i18n/navigation';
import { createContractorRfiAction } from '../actions/external-actions';
import type { LocationOption, WorkPackageOption } from '../data/project-options.repository';
import { FormError, FormRow, selectClassName } from './form-controls';

export function ContractorRfiCreateForm({
  organizationId,
  projectId,
  basePath,
  locations,
  workPackages,
}: {
  organizationId: string;
  projectId: string;
  basePath: string;
  locations: readonly LocationOption[];
  workPackages: readonly WorkPackageOption[];
}) {
  const t = useTranslations('rfi');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const submitNow = form.get('intent') === 'submit';
    startTransition(async () => {
      const result = await createContractorRfiAction({
        organizationId,
        projectId,
        subject: String(form.get('subject') ?? ''),
        question: String(form.get('question') ?? ''),
        locationId: String(form.get('locationId') ?? '') || null,
        workPackageId: String(form.get('workPackageId') ?? '') || null,
        drawingReference: String(form.get('drawingReference') ?? '') || null,
        priority: (String(form.get('priority') ?? 'normal') || 'normal') as (typeof RFI_PRIORITIES)[number],
        dueDate: String(form.get('dueDate') ?? '') || null,
        submit: submitNow,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`${basePath}/${result.data.rfiId}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal.newTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FormError message={error} />
          <FormRow label={t('fields.subject')}>
            <Input name="subject" required maxLength={300} />
          </FormRow>
          <FormRow label={t('fields.question')}>
            <Textarea name="question" required rows={5} />
          </FormRow>
          <FormRow label={t('fields.location')}>
            <select name="locationId" className={selectClassName()} defaultValue="">
              <option value="">{t('fields.noLocation')}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.label}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label={t('fields.workPackage')}>
            <select name="workPackageId" className={selectClassName()} defaultValue="">
              <option value="">{t('fields.noWorkPackage')}</option>
              {workPackages.map((wp) => (
                <option key={wp.id} value={wp.id}>
                  {wp.name}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label={t('fields.drawingReference')} hint={t('fields.drawingReferenceHint')}>
            <Input name="drawingReference" maxLength={300} />
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label={t('fields.priority')}>
              <select name="priority" className={selectClassName()} defaultValue="normal">
                {RFI_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('fields.dueDate')}>
              <Input name="dueDate" type="date" />
            </FormRow>
          </div>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.draftHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
              {t('create.saveDraft')}
            </Button>
            <Button type="submit" name="intent" value="submit" variant="primary" disabled={pending}>
              {t('create.submit')}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(basePath)}>
              {tCommon('actions.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

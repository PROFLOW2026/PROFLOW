'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SUBMITTAL_TYPES } from '../domain/types';
import { useRouter } from '@/shared/i18n/navigation';
import { createSubmittalAction } from '../actions/internal-actions';
import type { SubmittalFormOptions } from '../application/form-options';
import { FormError, FormRow, selectClassName } from './form-controls';

export function SubmittalCreateForm({
  projectId,
  options,
  cancelHref,
}: {
  projectId: string;
  options: SubmittalFormOptions;
  cancelHref: string;
}) {
  const t = useTranslations('submittals');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createSubmittalAction({
        projectId,
        subcontractAgreementId: String(form.get('subcontractAgreementId') ?? ''),
        type: String(form.get('type') ?? 'product') as (typeof SUBMITTAL_TYPES)[number],
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? '') || null,
        specSection: String(form.get('specSection') ?? '') || null,
        locationId: String(form.get('locationId') ?? '') || null,
        workPackageId: String(form.get('workPackageId') ?? '') || null,
        drawingReference: String(form.get('drawingReference') ?? '') || null,
        dueDate: String(form.get('dueDate') ?? '') || null,
        reviewerUserId: String(form.get('reviewerUserId') ?? '') || null,
        notes: String(form.get('notes') ?? '') || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`${cancelHref}/${result.data.submittalId}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('create.title')}</CardTitle>
        <CardDescription>{t('create.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FormError message={error} />
          <FormRow label={t('fields.contractor')}>
            <select name="subcontractAgreementId" required className={selectClassName()} defaultValue="">
              <option value="" disabled>
                —
              </option>
              {options.agreements.map((agreement) => (
                <option key={agreement.id} value={agreement.id}>
                  {agreement.vendorName} · {agreement.title}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label={t('fields.type')}>
            <select name="type" className={selectClassName()} defaultValue="product">
              {SUBMITTAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`type.${type}`)}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label={t('fields.title')}>
            <Input name="title" required maxLength={300} />
          </FormRow>
          <FormRow label={t('fields.description')}>
            <Textarea name="description" rows={3} />
          </FormRow>
          <FormRow label={t('fields.specSection')}>
            <Input name="specSection" maxLength={120} />
          </FormRow>
          <FormRow label={t('fields.notes')} hint={t('fields.notesHint')}>
            <Textarea name="notes" rows={3} />
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label={t('fields.location')}>
              <select name="locationId" className={selectClassName()} defaultValue="">
                <option value="">{t('fields.noLocation')}</option>
                {options.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('fields.workPackage')}>
              <select name="workPackageId" className={selectClassName()} defaultValue="">
                <option value="">{t('fields.noWorkPackage')}</option>
                {options.workPackages.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.name}
                  </option>
                ))}
              </select>
            </FormRow>
          </div>
          <FormRow label={t('fields.drawingReference')} hint={t('fields.drawingReferenceHint')}>
            <Input name="drawingReference" maxLength={300} />
          </FormRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label={t('fields.dueDate')}>
              <Input name="dueDate" type="date" />
            </FormRow>
            <FormRow label={t('fields.reviewer')}>
              <select name="reviewerUserId" className={selectClassName()} defaultValue="">
                <option value="">{t('fields.unassigned')}</option>
                {options.reviewers.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FormRow>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {t('create.save')}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(cancelHref)}>
              {tCommon('actions.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

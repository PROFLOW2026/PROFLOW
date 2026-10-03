'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SUBMITTAL_TYPES } from '../domain/types';
import { useRouter } from '@/shared/i18n/navigation';
import { createContractorSubmittalAction } from '../actions/external-actions';
import type { LocationOption, WorkPackageOption } from '@/modules/rfi';
import { FormError, FormRow, selectClassName } from './form-controls';

export function ContractorSubmittalCreateForm({
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
      const result = await createContractorSubmittalAction({
        organizationId,
        projectId,
        type: String(form.get('type') ?? 'product') as (typeof SUBMITTAL_TYPES)[number],
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? '') || null,
        specSection: String(form.get('specSection') ?? '') || null,
        locationId: String(form.get('locationId') ?? '') || null,
        workPackageId: String(form.get('workPackageId') ?? '') || null,
        drawingReference: String(form.get('drawingReference') ?? '') || null,
        notes: String(form.get('notes') ?? '') || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`${basePath}/${result.data.submittalId}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('create.contractorTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FormError message={error} />
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {t('create.save')}
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

'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContextualInfo } from '@/components/ui/contextual-info';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RFI_PRIORITIES } from '../domain/types';
import { Link, useRouter } from '@/shared/i18n/navigation';
import { createRfiAction } from '../actions/internal-actions';
import type { RfiFormOptions } from '../application/form-options';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { FormError, FormRow, selectClassName } from './form-controls';

export function RfiCreateForm({
  projectId,
  options,
  cancelHref,
}: {
  projectId: string;
  options: RfiFormOptions;
  cancelHref: string;
}) {
  const t = useTranslations('rfi');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const submitNow = form.get('intent') === 'submit';
    startTransition(async () => {
      const result = await createRfiAction({
        projectId,
        subject: String(form.get('subject') ?? ''),
        question: String(form.get('question') ?? ''),
        subcontractAgreementId: String(form.get('subcontractAgreementId') ?? '') || null,
        assigneeUserId: String(form.get('assigneeUserId') ?? '') || null,
        locationId: String(form.get('locationId') ?? '') || null,
        workPackageId: String(form.get('workPackageId') ?? '') || null,
        drawingReference: String(form.get('drawingReference') ?? '') || null,
        priority: (String(form.get('priority') ?? 'normal') || 'normal') as (typeof RFI_PRIORITIES)[number],
        dueDate: String(form.get('dueDate') ?? '') || null,
        submit: submitNow,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push(`${cancelHref}/${result.data.rfiId}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-1.5">
          <CardTitle className="min-w-0 flex-1">{t('create.title')}</CardTitle>
          <ContextualInfo dialogTitle={t('create.title')} content={t('create.description')} size="sm" />
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FormError message={error} />
          <MainAppFormGrid dense>
          <FormRow label={t('fields.subject')} error={fieldErrors.subject} className={mainAppFieldSpan.full}>
            <Input name="subject" required maxLength={300} />
          </FormRow>
          <FormRow label={t('fields.question')} error={fieldErrors.question} className={mainAppFieldSpan.full}>
            <Textarea name="question" required rows={5} maxLength={20000} />
          </FormRow>
          <FormRow label={t('fields.contractor')} className={mainAppFieldSpan.lg}>
            <select name="subcontractAgreementId" className={selectClassName()} defaultValue="">
              <option value="">{t('fields.noContractor')}</option>
              {options.agreements.map((agreement) => (
                <option key={agreement.id} value={agreement.id}>
                  {agreement.vendorName} · {agreement.title}
                </option>
              ))}
            </select>
          </FormRow>
            <FormRow label={t('fields.location')} className={mainAppFieldSpan.lg}>
              <select name="locationId" className={selectClassName()} defaultValue="">
                <option value="">{t('fields.noLocation')}</option>
                {options.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('fields.workPackage')} className={mainAppFieldSpan.lg}>
              <select name="workPackageId" className={selectClassName()} defaultValue="">
                <option value="">{t('fields.noWorkPackage')}</option>
                {options.workPackages.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.name}
                  </option>
                ))}
              </select>
            </FormRow>
          <FormRow label={t('fields.drawingReference')} hint={t('fields.drawingReferenceHint')} className={mainAppFieldSpan.full}>
            <Input name="drawingReference" maxLength={300} />
          </FormRow>
            <FormRow label={t('fields.priority')} className={mainAppFieldSpan.lg}>
              <select name="priority" className={selectClassName()} defaultValue="normal">
                {RFI_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('fields.dueDate')} className={mainAppFieldSpan.lg}>
              <Input name="dueDate" type="date" />
            </FormRow>
            <FormRow label={t('fields.assignee')} className={mainAppFieldSpan.lg}>
              <select name="assigneeUserId" className={selectClassName()} defaultValue="">
                <option value="">{t('fields.unassigned')}</option>
                {options.assignees.map((a) => (
                  <option key={a.userId} value={a.userId} disabled={!a.selectable}>
                    {a.selectable ? a.name : t('fields.assigneeRosterOnly', { name: a.name })}
                  </option>
                ))}
              </select>
              {options.assignees.some((a) => !a.selectable) ? (
                <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                  {t('fields.assigneeRosterHint')}{' '}
                  <Link
                    href={`/projects/${projectId}/team`}
                    className="font-medium text-[var(--pf-text-brand)] hover:underline"
                  >
                    {t('fields.assigneeAddToTeam')}
                  </Link>
                </p>
              ) : null}
            </FormRow>
          </MainAppFormGrid>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
              {t('create.saveDraft')}
            </Button>
            <Button type="submit" name="intent" value="submit" variant="primary" disabled={pending}>
              {t('create.submit')}
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

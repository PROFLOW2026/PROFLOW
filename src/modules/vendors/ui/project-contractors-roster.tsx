'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { ProjectVendorEngagementSummary, VendorType } from '@/modules/vendors';
import {
  addVendorEngagementAction,
  cancelVendorEngagementAction,
  endVendorEngagementAction,
  type VendorFormState,
} from '@/app/[locale]/(app)/vendors/actions';

export interface ProjectContractorVendorOption {
  readonly id: string;
  readonly name: string;
  readonly type: VendorType;
}

export interface ProjectContractorsRosterProps {
  readonly projectId: string;
  readonly engagements: readonly ProjectVendorEngagementSummary[];
  readonly history?: readonly ProjectVendorEngagementSummary[];
  readonly candidateVendors: readonly ProjectContractorVendorOption[];
  readonly canManage: boolean;
  readonly defaultStartDate: string;
}

function formatSpan(
  startDate: string | null,
  endDate: string | null,
  ongoingLabel: string,
): string {
  if (!startDate && !endDate) return ongoingLabel;
  if (!endDate) return `${startDate ?? '—'} · ${ongoingLabel}`;
  return `${startDate ?? '—'} → ${endDate}`;
}

/**
 * Project overview → contractors roster.
 * Engagement never creates expense / AP / labor Actual.
 * Overlapping multi-project engagements are allowed.
 */
export function ProjectContractorsRoster({
  projectId,
  engagements,
  history = [],
  candidateVendors,
  canManage,
  defaultStartDate,
}: ProjectContractorsRosterProps) {
  const t = useTranslations('vendors');
  const tCommon = useTranslations('common');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    addVendorEngagementAction,
    {},
  );

  const resolvedVendorId =
    vendorId && candidateVendors.some((vendor) => vendor.id === vendorId)
      ? vendorId
      : (candidateVendors[0]?.id ?? '');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <h2 className="text-lg font-semibold">{t('projectPanel.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('projectPanel.description')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canManage ? (
            <>
              <Button asChild size="sm" variant="secondary">
                <Link href="/vendors/new">{t('projectPanel.newVendor')}</Link>
              </Button>
              <Button type="button" size="sm" onClick={() => setShowAdd((value) => !value)}>
                {t('projectPanel.addEngagement')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {canManage && showAdd ? (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <p className="text-sm font-medium">{t('projectPanel.addEngagement')}</p>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('projectPanel.addSuccess')}</Alert> : null}

          {candidateVendors.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('projectPanel.noCandidates')}</p>
          ) : (
            <>
              <Field label={t('projectPanel.vendorLabel')} required>
                {(control) => (
                  <>
                    <input type="hidden" name="vendorId" value={resolvedVendorId} />
                    <Select value={resolvedVendorId} onValueChange={setVendorId}>
                      <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                        <SelectValue placeholder={t('projectPanel.vendorPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {candidateVendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('projectPanel.startDate')}>
                  {(control) => (
                    <Input
                      {...control}
                      name="startDate"
                      type="date"
                      defaultValue={defaultStartDate}
                      dir="ltr"
                    />
                  )}
                </Field>
                <Field
                  label={t('projectPanel.endDate')}
                  optionalLabel={tCommon('labels.optional')}
                >
                  {(control) => <Input {...control} name="endDate" type="date" dir="ltr" />}
                </Field>
              </div>
              <Field label={t('projectPanel.roleLabel')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Input
                    {...control}
                    name="role"
                    placeholder={t('projectPanel.rolePlaceholder')}
                  />
                )}
              </Field>
              <Button type="submit" size="sm" loading={pending} className="self-start">
                {t('projectPanel.addSave')}
              </Button>
            </>
          )}
        </form>
      ) : null}

      {engagements.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('projectPanel.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {engagements.map((engagement) => (
            <li
              key={engagement.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
            >
              <div className="min-w-0 flex-1 text-start">
                <Link
                  href={`/vendors/${engagement.vendorId}`}
                  className={cn(textNavLinkClassName, 'font-medium')}
                >
                  {engagement.vendorName}
                </Link>
                <p className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                  {formatSpan(
                    engagement.startDate,
                    engagement.endDate,
                    t('projectPanel.ongoing'),
                  )}
                  {engagement.role ? ` · ${engagement.role}` : ''}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <ConfirmAction
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        {t('projectPanel.endEngagement')}
                      </Button>
                    }
                    title={t('projectPanel.endEngagementTitle')}
                    description={t('projectPanel.endEngagementDescription', {
                      name: engagement.vendorName,
                    })}
                    confirmLabel={t('projectPanel.endEngagement')}
                    successMessage={t('projectPanel.endEngagementSuccess')}
                    onConfirm={() =>
                      endVendorEngagementAction({
                        engagementId: engagement.id,
                        projectId,
                        vendorId: engagement.vendorId,
                      })
                    }
                  />
                  <ConfirmAction
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        {t('projectPanel.cancelEngagement')}
                      </Button>
                    }
                    title={t('projectPanel.cancelEngagementTitle')}
                    description={t('projectPanel.cancelEngagementDescription', {
                      name: engagement.vendorName,
                    })}
                    confirmLabel={t('projectPanel.cancelEngagement')}
                    successMessage={t('projectPanel.cancelEngagementSuccess')}
                    onConfirm={() =>
                      cancelVendorEngagementAction({
                        engagementId: engagement.id,
                        projectId,
                        vendorId: engagement.vendorId,
                      })
                    }
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setShowHistory((value) => !value)}
          >
            {showHistory ? t('projectPanel.hideHistory') : t('projectPanel.showHistory')}
          </Button>
          {showHistory ? (
            <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)] opacity-90">
              {history.map((engagement) => (
                <li
                  key={engagement.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1 text-start">
                    <span className="font-medium">{engagement.vendorName}</span>
                    <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                      {formatSpan(
                        engagement.startDate,
                        engagement.endDate,
                        t('projectPanel.ongoing'),
                      )}
                      {engagement.role ? ` · ${engagement.role}` : ''}
                    </p>
                  </div>
                  <StatusBadge
                    shape="archived"
                    label={t(`engagementStatus.${engagement.status}`)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

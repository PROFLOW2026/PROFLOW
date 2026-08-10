'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { VendorEngagementSummary } from '@/modules/vendors';
import {
  addVendorEngagementAction,
  cancelVendorEngagementAction,
  endVendorEngagementAction,
  type VendorFormState,
} from '@/app/[locale]/(app)/vendors/actions';

export interface VendorEngagementProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface VendorEngagementsPanelProps {
  readonly vendorId: string;
  readonly engagements: readonly VendorEngagementSummary[];
  readonly history?: readonly VendorEngagementSummary[];
  readonly candidateProjects: readonly VendorEngagementProjectOption[];
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
 * Vendor detail → Projects / Engagements.
 * Add / end / cancel with dates. Engagement ≠ Actual cost.
 */
export function VendorEngagementsPanel({
  vendorId,
  engagements,
  history = [],
  candidateProjects,
  canManage,
  defaultStartDate,
}: VendorEngagementsPanelProps) {
  const t = useTranslations('vendors');
  const tCommon = useTranslations('common');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    addVendorEngagementAction,
    {},
  );

  const resolvedProjectId =
    projectId && candidateProjects.some((project) => project.id === projectId)
      ? projectId
      : (candidateProjects[0]?.id ?? '');

  const active = engagements.filter((engagement) => engagement.status === 'active');
  const ended =
    history.length > 0
      ? history
      : engagements.filter((engagement) => engagement.status !== 'active');

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <h2 className="text-base font-semibold">{t('detail.engagementsSection')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.engagementsHint')}</p>
        </div>
        {canManage ? (
          <Button type="button" size="sm" onClick={() => setShowAdd((value) => !value)}>
            {t('detail.addEngagement')}
          </Button>
        ) : null}
      </div>

      {canManage && showAdd ? (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
        >
          <input type="hidden" name="vendorId" value={vendorId} />
          <p className="text-sm font-medium">{t('detail.addEngagement')}</p>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('detail.addEngagementSuccess')}</Alert> : null}

          {candidateProjects.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('detail.noProjects')}</p>
          ) : (
            <>
              <Field label={t('detail.projectLabel')} required>
                {(control) => (
                  <>
                    <input type="hidden" name="projectId" value={resolvedProjectId} />
                    <Select value={resolvedProjectId} onValueChange={setProjectId}>
                      <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                        <SelectValue placeholder={t('detail.projectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {candidateProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('detail.startDate')}>
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
                <Field label={t('detail.endDate')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => <Input {...control} name="endDate" type="date" dir="ltr" />}
                </Field>
              </div>
              <Field label={t('detail.roleLabel')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Input {...control} name="role" placeholder={t('detail.rolePlaceholder')} />
                )}
              </Field>
              <Button type="submit" size="sm" loading={pending} className="self-start">
                {t('detail.addEngagementSave')}
              </Button>
            </>
          )}
        </form>
      ) : null}

      {active.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.engagementsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((engagement) => (
            <li
              key={engagement.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
            >
              <div className="min-w-0 flex-1 text-start">
                <Link
                  href={`/projects/${engagement.projectId}`}
                  className={cn(textNavLinkClassName, 'font-medium')}
                >
                  {engagement.projectName}
                </Link>
                <p className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                  {formatSpan(engagement.startDate, engagement.endDate, t('detail.ongoing'))}
                  {engagement.role ? ` · ${engagement.role}` : ''}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <ConfirmAction
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        {t('detail.endEngagement')}
                      </Button>
                    }
                    title={t('detail.endEngagementTitle')}
                    description={t('detail.endEngagementDescription', {
                      name: engagement.projectName,
                    })}
                    confirmLabel={t('detail.endEngagement')}
                    successMessage={t('detail.endEngagementSuccess')}
                    onConfirm={() =>
                      endVendorEngagementAction({
                        engagementId: engagement.id,
                        projectId: engagement.projectId,
                        vendorId,
                      })
                    }
                  />
                  <ConfirmAction
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        {t('detail.cancelEngagement')}
                      </Button>
                    }
                    title={t('detail.cancelEngagementTitle')}
                    description={t('detail.cancelEngagementDescription', {
                      name: engagement.projectName,
                    })}
                    confirmLabel={t('detail.cancelEngagement')}
                    successMessage={t('detail.cancelEngagementSuccess')}
                    onConfirm={() =>
                      cancelVendorEngagementAction({
                        engagementId: engagement.id,
                        projectId: engagement.projectId,
                        vendorId,
                      })
                    }
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ended.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setShowHistory((value) => !value)}
          >
            {showHistory ? t('detail.hideHistory') : t('detail.showHistory')}
          </Button>
          {showHistory ? (
            <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)] opacity-90">
              {ended.map((engagement) => (
                <li
                  key={engagement.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1 text-start">
                    <span className="font-medium">{engagement.projectName}</span>
                    <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                      {formatSpan(engagement.startDate, engagement.endDate, t('detail.ongoing'))}
                      {engagement.role ? ` · ${engagement.role}` : ''}
                    </p>
                  </div>
                  <StatusBadge
                    shape={engagement.status === 'cancelled' ? 'cancelled' : 'completed'}
                    label={t(`engagementStatus.${engagement.status}`)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('detail.engagementNote')}</p>
    </Card>
  );
}

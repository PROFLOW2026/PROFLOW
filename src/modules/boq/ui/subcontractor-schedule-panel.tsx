'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  activateSubcontractorScheduleAction,
  addSubcontractorScheduleLineAction,
  approveSubcontractorValuationAction,
  createDraftApFromSubcontractorValuationAction,
  createSubcontractorScheduleAction,
  createSubcontractorValuationDraftAction,
  type BoqFormState,
} from './actions';

export interface SubEngagementOption {
  readonly id: string;
  readonly vendorId: string;
  readonly label: string;
}

export interface SubAgreementOption {
  readonly id: string;
  readonly vendorId: string;
  readonly title: string;
  readonly retentionPercent: string | null;
  readonly status: string;
}

export interface SubBoqItemOption {
  readonly id: string;
  readonly label: string;
}

export interface SubScheduleLineView {
  readonly id: string;
  readonly boqNodeId: string;
  readonly agreedQuantity: string;
  readonly unitRate: string;
  readonly amount: string;
}

export interface SubValuationView {
  readonly id: string;
  readonly periodLabel: string;
  readonly status: string;
  readonly proposedVendorBillId: string | null;
}

export interface SubScheduleView {
  readonly id: string;
  readonly title: string | null;
  readonly status: string;
  readonly currency: string;
  readonly subcontractAgreementId: string | null;
  readonly retentionPercent: string | null;
  readonly lines: readonly SubScheduleLineView[];
  readonly valuations: readonly SubValuationView[];
}

export interface SubcontractorSchedulePanelProps {
  readonly projectId: string;
  readonly boqId: string;
  readonly canManage: boolean;
  readonly canProposeApDraft: boolean;
  readonly engagements: readonly SubEngagementOption[];
  readonly agreements: readonly SubAgreementOption[];
  readonly items: readonly SubBoqItemOption[];
  readonly schedules: readonly SubScheduleView[];
}

/**
 * Subcontractor schedule of COST rates.
 * Flow: draft → lines → activate → valuation (period qty default 0) → approve
 * → create draft vendor bill (not auto-post). proposed_vendor_bill_id via approved→proposed_ap.
 */
export function SubcontractorSchedulePanel({
  projectId,
  boqId,
  canManage,
  canProposeApDraft,
  engagements,
  agreements,
  items,
  schedules,
}: SubcontractorSchedulePanelProps) {
  const t = useTranslations('boq');
  const [selectedScheduleId, setSelectedScheduleId] = useState(schedules[0]?.id ?? '');
  const [engagementId, setEngagementId] = useState(engagements[0]?.id ?? '');
  const [agreementId, setAgreementId] = useState('');
  const [createState, createAction, createPending] = useActionState(
    createSubcontractorScheduleAction,
    {} as BoqFormState,
  );
  const [lineState, lineAction, linePending] = useActionState(
    addSubcontractorScheduleLineAction,
    {} as BoqFormState,
  );
  const [activateState, activateAction, activatePending] = useActionState(
    activateSubcontractorScheduleAction,
    {} as BoqFormState,
  );
  const [valState, valAction, valPending] = useActionState(
    createSubcontractorValuationDraftAction,
    {} as BoqFormState,
  );
  const [approveValState, approveValAction, approveValPending] = useActionState(
    approveSubcontractorValuationAction,
    {} as BoqFormState,
  );
  const [draftApState, draftApAction, draftApPending] = useActionState(
    createDraftApFromSubcontractorValuationAction,
    {} as BoqFormState,
  );

  const selected = schedules.find((s) => s.id === selectedScheduleId) ?? schedules[0] ?? null;
  const isDraft = selected?.status === 'draft';
  const isActive = selected?.status === 'active';
  const selectedEngagement = engagements.find((row) => row.id === engagementId) ?? engagements[0];
  const agreementsForVendor = selectedEngagement
    ? agreements.filter((row) => row.vendorId === selectedEngagement.vendorId)
    : [];
  const resolvedAgreementId =
    agreementId && agreementsForVendor.some((row) => row.id === agreementId) ? agreementId : '';
  const selectedAgreement = agreementsForVendor.find((row) => row.id === resolvedAgreementId);
  const draftRetentionDefault = selected?.retentionPercent ?? '';

  return (
    <section className="flex min-w-0 flex-col gap-4 border-t border-[var(--pf-border-default)] pt-6">
      <div className="min-w-0 text-start">
        <h3 className="text-base font-semibold">{t('subcontractor.title')}</h3>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subcontractor.description')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('subcontractor.costSideOnly')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('subcontractor.flowHint')}</p>
      </div>

      <Alert tone="info">{t('subcontractor.apManualNote')}</Alert>

      {schedules.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subcontractor.empty')}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-xs text-[var(--pf-text-muted)]">{t('subcontractor.title')}</label>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => setSelectedScheduleId(e.target.value)}
            className="w-full max-w-md rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
          >
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.title || s.id.slice(0, 8)) + ` · ${s.status} · ${s.lines.length} lines`}
              </option>
            ))}
          </select>
          {selected ? (
            <>
              <ul className="mt-2 space-y-1 text-sm">
                {selected.lines.map((line) => (
                  <li key={line.id} className="text-[var(--pf-text-secondary)]">
                    {items.find((i) => i.id === line.boqNodeId)?.label ?? line.boqNodeId}
                    {' · '}
                    {line.agreedQuantity} × {line.unitRate} = {line.amount} {selected.currency}
                  </li>
                ))}
              </ul>
              {selected.valuations.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-[var(--pf-text-muted)]">
                    {t('subcontractor.valuationHistory')}
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-[var(--pf-text-secondary)]">
                    {selected.valuations.map((valuation) => (
                      <li key={valuation.id}>
                        {valuation.periodLabel} · {valuation.status}
                        {valuation.proposedVendorBillId
                          ? ` · AP ${valuation.proposedVendorBillId.slice(0, 8)}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {canManage ? (
        <>
          <form action={createAction} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="boqId" value={boqId} />
            <label className="flex flex-col gap-1 text-sm text-start">
              <span>{t('subcontractor.vendorEngagement')}</span>
              <select
                name="vendorEngagementId"
                required
                value={selectedEngagement?.id ?? ''}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setEngagementId(nextId);
                  const nextEngagement = engagements.find((row) => row.id === nextId);
                  if (
                    resolvedAgreementId &&
                    nextEngagement &&
                    !agreements.some(
                      (row) => row.id === resolvedAgreementId && row.vendorId === nextEngagement.vendorId,
                    )
                  ) {
                    setAgreementId('');
                  }
                }}
                className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
              >
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-start">
              <span>{t('subcontractor.agreement')}</span>
              <select
                name="subcontractAgreementId"
                value={resolvedAgreementId}
                onChange={(event) => {
                  const nextAgreementId = event.target.value;
                  setAgreementId(nextAgreementId);
                  const agreement = agreements.find((row) => row.id === nextAgreementId);
                  if (!agreement) return;
                  const preferred = engagements.find((row) => row.vendorId === agreement.vendorId);
                  if (preferred) setEngagementId(preferred.id);
                }}
                className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
              >
                <option value="">{t('subcontractor.agreementNone')}</option>
                {agreementsForVendor.map((agreement) => (
                  <option key={agreement.id} value={agreement.id}>
                    {agreement.title}
                    {agreement.retentionPercent ? ` · ${agreement.retentionPercent}%` : ''}
                  </option>
                ))}
              </select>
              {selectedAgreement?.retentionPercent ? (
                <span className="text-xs text-[var(--pf-text-muted)]">
                  {t('subcontractor.agreementRetention', {
                    percent: selectedAgreement.retentionPercent,
                  })}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm text-start">
              <span>{t('fields.title')}</span>
              <Input name="title" />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createPending || engagements.length === 0}>
                {t('subcontractor.create')}
              </Button>
              {createState.error ? (
                <p className="mt-2 text-xs text-[var(--pf-status-danger-fg)]">{createState.error}</p>
              ) : null}
            </div>
          </form>

          {selected && isDraft ? (
            <>
              <form action={lineAction} className="grid min-w-0 gap-3 sm:grid-cols-3">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="scheduleId" value={selected.id} />
                <label className="flex flex-col gap-1 text-sm text-start">
                  <span>{t('nodes.item')}</span>
                  <select
                    name="boqNodeId"
                    required
                    className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-start">
                  <span>{t('subcontractor.agreedQty')}</span>
                  <Input name="agreedQuantity" required defaultValue="0" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-start">
                  <span>{t('subcontractor.unitRate')}</span>
                  <Input name="unitRate" required defaultValue="0" />
                </label>
                <div className="sm:col-span-3">
                  <Button type="submit" disabled={linePending || items.length === 0}>
                    {t('subcontractor.addLine')}
                  </Button>
                  {lineState.error ? (
                    <p className="mt-2 text-xs text-[var(--pf-status-danger-fg)]">{lineState.error}</p>
                  ) : null}
                </div>
              </form>

              <form action={activateAction} className="flex min-w-0 flex-col gap-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="scheduleId" value={selected.id} />
                <p className="text-xs text-[var(--pf-text-muted)]">{t('subcontractor.activateHint')}</p>
                <Button
                  type="submit"
                  disabled={activatePending || selected.lines.length === 0}
                  loading={activatePending}
                >
                  {t('subcontractor.activate')}
                </Button>
                {activateState.error ? (
                  <p className="text-xs text-[var(--pf-status-danger-fg)]">{activateState.error}</p>
                ) : null}
                {activateState.ok ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">{t('subcontractor.activated')}</p>
                ) : null}
              </form>
            </>
          ) : null}

          {selected && isActive ? (
            <>
              <form action={valAction} className="grid min-w-0 gap-3 sm:grid-cols-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="scheduleId" value={selected.id} />
                <label className="flex flex-col gap-1 text-sm text-start sm:col-span-2">
                  <span>{t('subcontractor.periodLabel')}</span>
                  <Input name="periodLabel" required />
                </label>
                <p className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
                  {t('subcontractor.periodQtyHint')}
                </p>
                {selected.lines.map((line) => (
                  <label key={line.id} className="flex flex-col gap-1 text-sm text-start">
                    <span>
                      {items.find((i) => i.id === line.boqNodeId)?.label ?? line.boqNodeId}
                      {' · '}
                      {t('subcontractor.agreedQty')}: {line.agreedQuantity}
                    </span>
                    <Input
                      name={`qty_${line.id}`}
                      required
                      defaultValue="0"
                      inputMode="decimal"
                      dir="ltr"
                    />
                  </label>
                ))}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={valPending || selected.lines.length === 0}>
                    {t('subcontractor.createValuation')}
                  </Button>
                </div>
                {valState.ok ? (
                  <p className="sm:col-span-2 text-xs text-[var(--pf-text-secondary)]">
                    {t('subcontractor.valuationCreated')}
                  </p>
                ) : null}
                {valState.error ? (
                  <p className="sm:col-span-2 text-xs text-[var(--pf-status-danger-fg)]">{valState.error}</p>
                ) : null}
              </form>

              {selected.valuations
                .filter((v) => v.status === 'draft')
                .map((valuation) => (
                  <form
                    key={valuation.id}
                    action={approveValAction}
                    className="flex min-w-0 flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="valuationId" value={valuation.id} />
                    <span className="text-sm">
                      {valuation.periodLabel} · {t('status.draft')}
                    </span>
                    <Button type="submit" size="sm" disabled={approveValPending}>
                      {t('subcontractor.approveValuation')}
                    </Button>
                  </form>
                ))}
              {approveValState.error ? (
                <p className="text-xs text-[var(--pf-status-danger-fg)]">{approveValState.error}</p>
              ) : null}
              {approveValState.ok ? (
                <p className="text-xs text-[var(--pf-text-secondary)]">
                  {t('subcontractor.valuationApproved')}
                </p>
              ) : null}

              {selected.valuations
                .filter((v) => v.status === 'approved' && !v.proposedVendorBillId)
                .map((valuation) => (
                  <form
                    key={`draft-ap-${valuation.id}`}
                    action={draftApAction}
                    className="flex min-w-0 flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="valuationId" value={valuation.id} />
                    <span className="text-sm">
                      {valuation.periodLabel} · {valuation.status}
                    </span>
                    {canProposeApDraft ? (
                      <>
                        <label className="flex min-w-32 flex-col gap-1 text-xs text-start">
                          <span>{t('subcontractor.retentionPercent')}</span>
                          <Input
                            name="retentionPercent"
                            defaultValue={draftRetentionDefault}
                            inputMode="decimal"
                            dir="ltr"
                            placeholder={selected?.retentionPercent ?? undefined}
                          />
                        </label>
                        <Button type="submit" size="sm" disabled={draftApPending}>
                          {t('subcontractor.createDraftAp')}
                        </Button>
                      </>
                    ) : (
                      <p className="text-xs text-[var(--pf-text-muted)]">
                        {t('subcontractor.draftApNeedsPermission')}
                      </p>
                    )}
                  </form>
                ))}
              {draftApState.error ? (
                <p className="text-xs text-[var(--pf-status-danger-fg)]">{draftApState.error}</p>
              ) : null}
              {draftApState.ok ? (
                <p className="text-xs text-[var(--pf-text-secondary)]">
                  {t('subcontractor.draftApCreated')}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

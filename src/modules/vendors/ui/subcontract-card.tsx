'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyText } from '@/components/patterns/money-text';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { money } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { SubcontractDetail, SubcontractListItem, SubcontractStatus } from '@/modules/vendors';
import {
  addSubcontractChangeAction,
  changeSubcontractStatusAction,
  linkSubcontractDocumentAction,
  type VendorFormState,
} from '@/app/[locale]/(app)/vendors/actions';

function statusShape(status: SubcontractStatus) {
  if (status === 'draft') return 'draft' as const;
  if (status === 'active') return 'active' as const;
  if (status === 'completed') return 'completed' as const;
  return 'cancelled' as const;
}

export interface SubcontractCardProps {
  readonly item: SubcontractListItem;
  readonly detail?: SubcontractDetail;
  readonly canManage: boolean;
  readonly counterpartHref: string;
  readonly counterpartLabel: string;
  readonly documentCandidates: readonly { id: string; originalFilename: string }[];
}

export function SubcontractCard({
  item,
  detail,
  canManage,
  counterpartHref,
  counterpartLabel,
  documentCandidates,
}: SubcontractCardProps) {
  const t = useTranslations('vendors.subcontracts');
  const [showChange, setShowChange] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [kind, setKind] = useState<'change_order' | 'adjustment'>('change_order');
  const [direction, setDirection] = useState<'addition' | 'reduction'>('addition');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [changeState, changeAction, changePending] = useActionState<VendorFormState, FormData>(
    addSubcontractChangeAction,
    {},
  );
  const [docState, docAction, docPending] = useActionState<VendorFormState, FormData>(
    linkSubcontractDocumentAction,
    {},
  );

  const resolvedDocumentId =
    documentId && documentCandidates.some((document) => document.id === documentId)
      ? documentId
      : (documentCandidates[0]?.id ?? '');

  const flags = detail?.documentFlags;

  return (
    <li className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <p className="font-medium">{item.title}</p>
          <Link href={counterpartHref} className={cn(textNavLinkClassName, 'text-sm')}>
            {counterpartLabel}
          </Link>
          {item.subcontractNumber ? (
            <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
              {item.subcontractNumber}
            </p>
          ) : null}
        </div>
        <StatusBadge shape={statusShape(item.status)} label={t(`status.${item.status}`)} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="text-start">
          <dt className="text-[var(--pf-text-muted)]">{t('originalAmountLabel')}</dt>
          <dd>
            <MoneyText value={money(item.originalAmount, item.currency)} />
          </dd>
        </div>
        <div className="text-start">
          <dt className="text-[var(--pf-text-muted)]">{t('currentAmountLabel')}</dt>
          <dd>
            <MoneyText value={money(item.currentAmount, item.currency)} />
          </dd>
        </div>
        <div className="text-start">
          <dt className="text-[var(--pf-text-muted)]">{t('paidLabel')}</dt>
          <dd>
            <MoneyText value={money(item.paidAmount, item.currency)} />
          </dd>
        </div>
        <div className="text-start">
          <dt className="text-[var(--pf-text-muted)]">{t('outstandingLabel')}</dt>
          <dd>
            <MoneyText value={money(item.outstandingAmount, item.currency)} />
          </dd>
        </div>
      </dl>

      {flags ? (
        <p className="text-start text-xs text-[var(--pf-text-secondary)]">
          {flags.insuranceExpired
            ? t('insuranceExpired')
            : flags.hasInsurance
              ? t('insuranceValid')
              : t('insuranceMissing')}
          {flags.expiredRequiredCount > 0
            ? ` · ${t('requiredExpired', { count: flags.expiredRequiredCount })}`
            : null}
        </p>
      ) : null}

      {canManage && item.status === 'draft' ? (
        <div className="flex flex-wrap gap-2">
          <ConfirmAction
            trigger={
              <Button type="button" size="sm">
                {t('activate')}
              </Button>
            }
            title={t('activateTitle')}
            description={t('activateDescription', { name: item.title })}
            confirmLabel={t('activate')}
            successMessage={t('activateSuccess')}
            onConfirm={() =>
              changeSubcontractStatusAction({
                subcontractId: item.id,
                vendorId: item.vendorId,
                projectId: item.projectId,
                status: 'active',
              })
            }
          />
          <ConfirmAction
            trigger={
              <Button type="button" size="sm" variant="ghost">
                {t('cancel')}
              </Button>
            }
            title={t('cancelTitle')}
            description={t('cancelDescription', { name: item.title })}
            confirmLabel={t('cancel')}
            successMessage={t('cancelSuccess')}
            onConfirm={() =>
              changeSubcontractStatusAction({
                subcontractId: item.id,
                vendorId: item.vendorId,
                projectId: item.projectId,
                status: 'cancelled',
              })
            }
          />
        </div>
      ) : null}

      {canManage && item.status === 'active' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setShowChange((value) => !value)}>
            {t('addChange')}
          </Button>
          <ConfirmAction
            trigger={
              <Button type="button" size="sm" variant="ghost">
                {t('complete')}
              </Button>
            }
            title={t('completeTitle')}
            description={t('completeDescription', { name: item.title })}
            confirmLabel={t('complete')}
            successMessage={t('completeSuccess')}
            onConfirm={() =>
              changeSubcontractStatusAction({
                subcontractId: item.id,
                vendorId: item.vendorId,
                projectId: item.projectId,
                status: 'completed',
              })
            }
          />
          <ConfirmAction
            trigger={
              <Button type="button" size="sm" variant="ghost">
                {t('cancel')}
              </Button>
            }
            title={t('cancelTitle')}
            description={t('cancelDescription', { name: item.title })}
            confirmLabel={t('cancel')}
            successMessage={t('cancelSuccess')}
            onConfirm={() =>
              changeSubcontractStatusAction({
                subcontractId: item.id,
                vendorId: item.vendorId,
                projectId: item.projectId,
                status: 'cancelled',
              })
            }
          />
        </div>
      ) : null}

      {canManage && showChange && item.status === 'active' ? (
        <form
          action={changeAction}
          className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
        >
          <input type="hidden" name="subcontractId" value={item.id} />
          <input type="hidden" name="vendorId" value={item.vendorId} />
          <input type="hidden" name="projectId" value={item.projectId} />
          {changeState.error ? <Alert tone="danger">{changeState.error}</Alert> : null}
          {changeState.ok ? <Alert tone="success">{t('addChangeSuccess')}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('changeKindLabel')} required>
              {(control) => (
                <>
                  <input type="hidden" name="kind" value={kind} />
                  <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
                    <SelectTrigger id={control.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="change_order">{t('kind.change_order')}</SelectItem>
                      <SelectItem value="adjustment">{t('kind.adjustment')}</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
            <Field label={t('changeDirectionLabel')} required>
              {(control) => (
                <>
                  <input type="hidden" name="direction" value={direction} />
                  <Select
                    value={direction}
                    onValueChange={(value) => setDirection(value as typeof direction)}
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="addition">{t('direction.addition')}</SelectItem>
                      <SelectItem value="reduction">{t('direction.reduction')}</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
            <Field label={t('changeAmountLabel')} required>
              {(control) => (
                <Input {...control} name="amount" inputMode="decimal" dir="ltr" required />
              )}
            </Field>
            <Field label={t('changeReasonLabel')}>
              {(control) => <Input {...control} name="reason" />}
            </Field>
          </div>
          <Button type="submit" size="sm" loading={changePending} className="self-start">
            {t('addChangeSave')}
          </Button>
        </form>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => setShowDocs((value) => !value)}
      >
        {t('documentsTitle')}
      </Button>

      {showDocs ? (
        <div className="flex flex-col gap-2">
          {detail && detail.documents.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('documentsEmpty')}</p>
          ) : null}
          {detail?.documents.map((document) => (
            <p key={document.linkId} className="text-start text-sm">
              {document.originalFilename}
              {document.isRequired ? ` · ${t('requiredFlag')}` : ''}
              {document.requiredType === 'insurance' ? ` · ${t('insuranceFlag')}` : ''}
              {document.expiresAt ? (
                <>
                  {' · '}
                  <span dir="ltr">{document.expiresAt}</span>
                </>
              ) : null}
            </p>
          ))}
          {canManage ? (
            <form
              action={docAction}
              className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
            >
              <input type="hidden" name="subcontractId" value={item.id} />
              <input type="hidden" name="vendorId" value={item.vendorId} />
              <input type="hidden" name="projectId" value={item.projectId} />
              {docState.error ? <Alert tone="danger">{docState.error}</Alert> : null}
              {documentCandidates.length === 0 ? (
                <p className="text-sm text-[var(--pf-text-muted)]">{t('noDocuments')}</p>
              ) : (
                <>
                  <Field label={t('documentLabel')} required>
                    {(control) => (
                      <>
                        <input type="hidden" name="documentId" value={resolvedDocumentId} />
                        <Select value={resolvedDocumentId} onValueChange={setDocumentId}>
                          <SelectTrigger id={control.id}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {documentCandidates.map((document) => (
                              <SelectItem key={document.id} value={document.id}>
                                {document.originalFilename}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </Field>
                  <Field label={t('expiresLabel')}>
                    {(control) => <Input {...control} name="expiresAt" type="date" dir="ltr" />}
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isInsurance" />
                    {t('insuranceFlag')}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isRequired" />
                    {t('requiredFlag')}
                  </label>
                  <Button type="submit" size="sm" loading={docPending} className="self-start">
                    {t('linkDocumentSave')}
                  </Button>
                </>
              )}
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

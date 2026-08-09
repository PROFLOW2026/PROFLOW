'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MAINTENANCE_STATUSES,
  type MaintenanceStatus,
} from '@/modules/assets/domain/types';
import { canTransitionMaintenanceStatus } from '@/modules/assets/domain/maintenance';
import {
  createMaintenanceAction,
  updateMaintenanceStatusAction,
  type AssetsFormState,
} from '../actions';

export function MaintenanceCreateForm({
  assetId,
  defaultCurrency,
  vendors,
}: {
  assetId: string;
  defaultCurrency: string;
  vendors: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('assets.detail');
  const tStatus = useTranslations('status.maintenance');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createMaintenanceAction,
    {},
  );
  const [status, setStatus] = useState<MaintenanceStatus>('planned');
  const [vendorId, setVendorId] = useState('__none__');

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <input type="hidden" name="assetId" value={assetId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{tCommon('states.saved')}</Alert> : null}

      <Field label={t('maintenanceTitle')} required>
        {(control) => <Input {...control} name="title" required />}
      </Field>

      <Field label={t('maintenanceStatus')}>
        {(control) => (
          <>
            <input type="hidden" name="status" value={status} />
            <Select value={status} onValueChange={(v) => setStatus(v as MaintenanceStatus)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tStatus(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('performedOn')}>
        {(control) => <Input {...control} type="date" name="performedOn" />}
      </Field>

      <Field label={t('vendor')}>
        {(control) => (
          <>
            <input type="hidden" name="vendorId" value={vendorId} />
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('vendorNone')}</SelectItem>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('costAmount')}>
        {(control) => <Input {...control} name="costAmount" inputMode="decimal" numeric />}
      </Field>

      <Field label={t('currency')}>
        {(control) => (
          <Input
            {...control}
            name="currency"
            defaultValue={defaultCurrency}
            maxLength={3}
            dir="ltr"
          />
        )}
      </Field>

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('costNotExpense')}</p>

      <Field label={t('notes')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? tCommon('states.saving') : t('submitMaintenance')}
      </Button>
    </form>
  );
}

export function MaintenanceStatusForm({
  assetId,
  maintenanceRecordId,
  currentStatus,
}: {
  assetId: string;
  maintenanceRecordId: string;
  currentStatus: MaintenanceStatus;
}) {
  const t = useTranslations('assets.detail');
  const tStatus = useTranslations('status.maintenance');
  const [status, setStatus] = useState(currentStatus);
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    updateMaintenanceStatusAction,
    {},
  );

  const options = MAINTENANCE_STATUSES.filter(
    (value) => value === currentStatus || canTransitionMaintenanceStatus(currentStatus, value),
  );

  if (options.length <= 1) {
    return <span className="text-sm">{tStatus(currentStatus)}</span>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="maintenanceRecordId" value={maintenanceRecordId} />
      <input type="hidden" name="status" value={status} />
      <Select value={status} onValueChange={(v) => setStatus(v as MaintenanceStatus)}>
        <SelectTrigger className="min-h-11 w-full sm:w-[10rem] md:h-9 md:min-h-9" aria-label={t('maintenanceStatus')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((value) => (
            <SelectItem key={value} value={value}>
              {tStatus(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending || status === currentStatus}
        className="min-h-11 md:min-h-8"
      >
        {pending ? t('updateStatusPending') : t('updateStatus')}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

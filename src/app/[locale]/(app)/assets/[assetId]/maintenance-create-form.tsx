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
import { MAINTENANCE_STATUSES, type MaintenanceStatus } from '@/modules/assets';
import { createMaintenanceAction, type AssetsFormState } from '../actions';

export function MaintenanceCreateForm({
  assetId,
  defaultCurrency,
}: {
  assetId: string;
  defaultCurrency: string;
}) {
  const t = useTranslations('assets.detail');
  const tStatus = useTranslations('status.maintenance');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createMaintenanceAction,
    {},
  );
  const [status, setStatus] = useState<MaintenanceStatus>('planned');

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

      <Field label={t('costAmount')}>
        {(control) => <Input {...control} name="costAmount" inputMode="decimal" />}
      </Field>

      <Field label={t('currency')}>
        {(control) => (
          <Input {...control} name="currency" defaultValue={defaultCurrency} maxLength={3} />
        )}
      </Field>

      <Field label={t('notes')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? tCommon('states.saving') : t('submitMaintenance')}
      </Button>
    </form>
  );
}

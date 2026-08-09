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
import { createInventoryItemAction, type AssetsFormState } from '../actions';

const NONE = '__none__';

export function InventoryItemCreateForm({
  materials = [],
}: {
  materials?: readonly { id: string; name: string; sku: string | null }[];
}) {
  const t = useTranslations('assets.inventory');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    createInventoryItemAction,
    {},
  );
  const [materialItemId, setMaterialItemId] = useState(NONE);

  return (
    <form action={formAction} className="flex w-full min-w-0 max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => <Input {...control} name="name" required autoFocus />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('skuLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="sku" />}
        </Field>
        <Field label={t('unitLabel')}>
          {(control) => <Input {...control} name="unit" defaultValue="ea" />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('quantityLabel')}>
          {(control) => (
            <Input
              {...control}
              name="quantityOnHand"
              inputMode="decimal"
              numeric
              defaultValue="0"
            />
          )}
        </Field>
        <Field label={t('reorderLevelLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input {...control} name="reorderLevel" inputMode="decimal" numeric />
          )}
        </Field>
      </div>

      {materials.length > 0 ? (
        <Field label={t('materialLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <>
              <input type="hidden" name="materialItemId" value={materialItemId} />
              <Select value={materialItemId} onValueChange={setMaterialItemId}>
                <SelectTrigger id={control.id}>
                  <SelectValue placeholder={t('materialNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('materialNone')}</SelectItem>
                  {materials.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name}
                      {material.sku ? ` (${material.sku})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      <Button type="submit" loading={pending}>
        {pending ? tCommon('states.saving') : t('submitItem')}
      </Button>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { CustomFieldValueView } from '../domain/types';

export interface EntityFieldActionState {
  ok?: boolean;
  error?: string;
}

type EntityFieldAction = (
  prev: EntityFieldActionState,
  formData: FormData,
) => Promise<EntityFieldActionState>;

export function EntityCustomFieldsPanel({
  entityId,
  fields,
  revalidatePath,
  saveAction,
}: {
  entityId: string;
  fields: CustomFieldValueView[];
  revalidatePath: string;
  saveAction: EntityFieldAction;
}) {
  const t = useTranslations('customFields');
  const [state, action, pending] = useActionState(saveAction, {} as EntityFieldActionState);

  if (fields.length === 0) return null;

  return (
    <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="font-medium">{t('entityTitle')}</h2>
      <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('reportingNote')}</p>
      {state.error ? <Alert tone="danger" className="mt-2">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success" className="mt-2" role="status">
          {t('valueSaved')}
        </Alert>
      ) : null}

      <div className="mt-3 flex flex-col gap-4">
        {fields.map(({ definition, value }) => (
          <form
            key={definition.id}
            action={action}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="definitionId" value={definition.id} />
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="fieldType" value={definition.fieldType} />
            <input type="hidden" name="revalidatePath" value={revalidatePath} />

            <div className="min-w-0 flex-1">
              <Field label={definition.label}>
                {(props) => {
                  if (definition.fieldType === 'boolean') {
                    return (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="valueBool"
                          value="true"
                          defaultChecked={value?.valueBool === true}
                          className="size-4 rounded border-[var(--pf-border-strong)]"
                        />
                        {definition.label}
                      </label>
                    );
                  }
                  if (definition.fieldType === 'date') {
                    return (
                      <Input
                        {...props}
                        name="valueDate"
                        type="date"
                        defaultValue={value?.valueDate ?? ''}
                      />
                    );
                  }
                  if (definition.fieldType === 'number' || definition.fieldType === 'money') {
                    return (
                      <Input
                        {...props}
                        name="valueNumber"
                        inputMode="decimal"
                        defaultValue={value?.valueNumber ?? ''}
                      />
                    );
                  }
                  const jsonDefault =
                    value?.valueJson && Array.isArray(value.valueJson)
                      ? value.valueJson.join(', ')
                      : '';
                  return (
                    <Input
                      {...props}
                      name="valueText"
                      defaultValue={
                        definition.fieldType === 'multi_select' ||
                        definition.fieldType === 'reference'
                          ? jsonDefault
                          : (value?.valueText ?? '')
                      }
                    />
                  );
                }}
              </Field>
            </div>
            <Button type="submit" variant="secondary" size="sm" loading={pending}>
              {t('saveValue')}
            </Button>
          </form>
        ))}
      </div>
    </section>
  );
}

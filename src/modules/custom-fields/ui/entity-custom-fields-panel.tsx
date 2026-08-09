'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseSelectOptions } from '../domain/validate-value';
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
        {fields.map(({ definition, value }) => {
          const options = parseSelectOptions(definition.config);
          const label = definition.required ? `${definition.label} *` : definition.label;

          return (
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
                <Field label={label}>
                  {(props) => {
                    if (definition.fieldType === 'boolean') {
                      return (
                        <div className="flex min-h-11 items-center">
                          <input
                            {...props}
                            type="checkbox"
                            name="valueBool"
                            value="true"
                            defaultChecked={value?.valueBool === true}
                            className="size-5 rounded border-[var(--pf-border-strong)]"
                          />
                        </div>
                      );
                    }
                    if (definition.fieldType === 'date') {
                      return (
                        <Input
                          {...props}
                          name="valueDate"
                          type="date"
                          defaultValue={value?.valueDate ?? ''}
                          required={definition.required}
                        />
                      );
                    }
                    if (definition.fieldType === 'number' || definition.fieldType === 'money') {
                      return (
                        <Input
                          {...props}
                          name="valueNumber"
                          inputMode="decimal"
                          dir="ltr"
                          defaultValue={value?.valueNumber ?? ''}
                          required={definition.required}
                        />
                      );
                    }
                    if (definition.fieldType === 'select' && options.length > 0) {
                      return (
                        <Select
                          name="valueText"
                          defaultValue={
                            value?.valueText ?? (definition.required ? options[0] : '__none__')
                          }
                        >
                          <SelectTrigger id={props.id}>
                            <SelectValue placeholder={t('selectPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {!definition.required ? (
                              <SelectItem value="__none__">{t('selectNone')}</SelectItem>
                            ) : null}
                            {options.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                        required={definition.required}
                        placeholder={
                          definition.fieldType === 'multi_select'
                            ? t('multiSelectPlaceholder')
                            : undefined
                        }
                      />
                    );
                  }}
                </Field>
              </div>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                loading={pending}
                className="min-h-11 md:min-h-8"
              >
                {t('saveValue')}
              </Button>
            </form>
          );
        })}
      </div>
    </section>
  );
}

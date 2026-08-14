'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = '__none__';

export interface WorkOrderChecklistTemplateOption {
  readonly id: string;
  readonly name: string;
}

export function WorkOrderChecklistField({
  templates,
  defaultTemplateId,
  error,
}: {
  templates: readonly WorkOrderChecklistTemplateOption[];
  defaultTemplateId?: string | null;
  error?: string;
}) {
  const t = useTranslations('service');
  const tCommon = useTranslations('common');
  const initial = defaultTemplateId ? defaultTemplateId : NONE;
  const [value, setValue] = useState(initial);
  const options =
    defaultTemplateId && !templates.some((row) => row.id === defaultTemplateId)
      ? [{ id: defaultTemplateId, name: t('create.checklistUnavailable') }, ...templates]
      : templates;

  return (
    <>
      <input type="hidden" name="checklistTemplateId" value={value === NONE ? '' : value} />
      <Field
        label={t('create.checklistLabel')}
        optionalLabel={tCommon('labels.optional')}
        description={t('create.checklistHint')}
        error={error}
      >
        {(control) => (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue placeholder={t('create.checklistNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('create.checklistNone')}</SelectItem>
              {options.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </>
  );
}

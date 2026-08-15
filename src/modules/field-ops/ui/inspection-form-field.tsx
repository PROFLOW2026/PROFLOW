'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = '__none__';

export interface InspectionFormTemplateOption {
  readonly id: string;
  readonly name: string;
}

export function InspectionFormTemplateField({
  templates,
  defaultTemplateId,
  error,
}: {
  templates: readonly InspectionFormTemplateOption[];
  defaultTemplateId?: string | null;
  error?: string;
}) {
  const t = useTranslations('fieldOps.form');
  const tCommon = useTranslations('common');
  const initial = defaultTemplateId ? defaultTemplateId : NONE;
  const [value, setValue] = useState(initial);
  const options =
    defaultTemplateId && !templates.some((row) => row.id === defaultTemplateId)
      ? [{ id: defaultTemplateId, name: t('templateUnavailable') }, ...templates]
      : templates;

  return (
    <>
      <input type="hidden" name="formTemplateId" value={value === NONE ? '' : value} />
      <Field
        label={t('templateLabel')}
        optionalLabel={tCommon('labels.optional')}
        description={t('templateHint')}
        error={error}
      >
        {(control) => (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue placeholder={t('templateNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('templateNone')}</SelectItem>
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

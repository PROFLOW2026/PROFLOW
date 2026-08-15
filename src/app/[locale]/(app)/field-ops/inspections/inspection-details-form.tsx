'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InspectionFormTemplateField } from '@/modules/field-ops/ui/inspection-form-field';
import { updateInspectionDetailsAction, type FieldOpsFormState } from '../actions';

const NONE = '__none__';

export function InspectionDetailsForm({
  inspectionId,
  inspectorEmployeeId,
  formTemplateId,
  employees,
  formTemplates,
}: {
  inspectionId: string;
  inspectorEmployeeId: string | null;
  formTemplateId: string | null;
  employees: readonly { id: string; name: string }[];
  formTemplates: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('fieldOps');
  const tCommon = useTranslations('common');
  const [inspector, setInspector] = useState(inspectorEmployeeId ?? NONE);
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    updateInspectionDetailsAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('detail.saved')}</Alert> : null}

      {employees.length > 0 ? (
        <Field label={t('createInspection.inspectorLabel')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="inspectorEmployeeId"
                value={inspector === NONE ? '' : inspector}
              />
              <Select value={inspector} onValueChange={setInspector}>
                <SelectTrigger id={control.id}>
                  <SelectValue placeholder={t('createInspection.inspectorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('createInspection.inspectorNone')}</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

      {formTemplates.length > 0 || formTemplateId ? (
        <InspectionFormTemplateField
          templates={formTemplates}
          defaultTemplateId={formTemplateId}
          error={state.fieldErrors?.formTemplateId}
        />
      ) : null}

      <Button type="submit" variant="secondary" className="h-11 w-full sm:w-auto" loading={pending}>
        {pending ? tCommon('states.saving') : t('updateStatus.submit')}
      </Button>
    </form>
  );
}

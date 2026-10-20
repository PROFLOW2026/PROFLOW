'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import {
  EmployeeEditPanel,
  EMPLOYEE_EDIT_FORM_ID,
  type EmployeeEditPanelProps,
} from '@/modules/workforce/ui/employee-edit-panel';
import { useEmployeeDetailUnsaved } from './employee-detail-unsaved-context';

export function EmployeeEditPanelSection(props: EmployeeEditPanelProps) {
  const t = useTranslations('workforce');
  const [dirty, setDirty] = useState(false);
  useEmployeeDetailUnsaved('employee-edit', dirty);

  return (
    <CollapsibleSection
      id="employee-edit"
      className="scroll-mt-24"
      title={t('employees.detail.editTitle')}
      keepMounted
      collapsedActions={
        dirty ? (
          <Button type="submit" form={EMPLOYEE_EDIT_FORM_ID} size="sm">
            {t('employees.detail.save')}
          </Button>
        ) : null
      }
    >
      <div
        className="min-w-0 max-w-full"
        onInput={() => setDirty(true)}
        onChange={() => setDirty(true)}
      >
        <EmployeeEditPanel {...props} showHeader={false} onFormDirtyChange={setDirty} />
      </div>
    </CollapsibleSection>
  );
}

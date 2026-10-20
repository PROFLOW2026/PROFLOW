'use client';

import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EMPLOYEE_ADD_RATE_FORM_ID } from '@/modules/workforce/ui/add-rate-version-form';
import { useEmployeeDetailUnsaved } from './employee-detail-unsaved-context';

interface EmployeeSalarySectionsProps {
  readonly salaryUpdate: ReactNode;
  readonly rateHistory: ReactNode;
  readonly showSalaryUpdate: boolean;
  readonly rateHistorySummary?: string;
}

export function EmployeeSalarySections({
  salaryUpdate,
  rateHistory,
  showSalaryUpdate,
  rateHistorySummary,
}: EmployeeSalarySectionsProps) {
  const t = useTranslations('workforce');
  const [salaryDirty, setSalaryDirty] = useState(false);
  useEmployeeDetailUnsaved('employee-salary', salaryDirty);

  return (
    <MainAppPage>
      <MainAppSection>
        {showSalaryUpdate ? (
        <CollapsibleSection
          id="salary-update"
          className="scroll-mt-24"
          title={t('employees.detail.updateSalary')}
          summary={t('employees.detail.updateSalaryHint')}
          keepMounted
          collapsedActions={
            salaryDirty ? (
              <Button type="submit" form={EMPLOYEE_ADD_RATE_FORM_ID} size="sm">
                {t('employees.detail.updateSalarySave')}
              </Button>
            ) : null
          }
        >
          <div
            className="min-w-0 max-w-full"
            onInput={() => setSalaryDirty(true)}
            onChange={() => setSalaryDirty(true)}
          >
            {salaryUpdate}
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        title={t('employees.detail.salaryHistory')}
        summary={rateHistorySummary}
      >
        <div className="min-w-0 max-w-full overflow-x-auto">{rateHistory}</div>
      </CollapsibleSection>
    
      </MainAppSection>
    </MainAppPage>
  );
}

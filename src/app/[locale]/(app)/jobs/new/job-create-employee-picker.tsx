'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';

export interface JobCreateEmployeeOption {
  readonly id: string;
  readonly name: string;
  readonly jobTitle: string | null;
}

interface JobCreateEmployeePickerProps {
  readonly employees: readonly JobCreateEmployeeOption[];
  readonly error?: string;
}

/**
 * Multi-select for formal job team assignment at create.
 * Submits `employeeIds` — Assignment ≠ Actual.
 */
export function JobCreateEmployeePicker({ employees, error }: JobCreateEmployeePickerProps) {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((item) => item !== id),
    );
  }

  return (
    <Field
      label={t('create.assignLabel')}
      optionalLabel={tCommon('labels.optional')}
      description={t('create.assignHint')}
      error={error}
    >
      {(control) => (
        <div className="flex flex-col gap-2" id={control.id} aria-describedby={control['aria-describedby']}>
          {selected.map((id) => (
            <input key={id} type="hidden" name="employeeIds" value={id} />
          ))}
          {employees.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">
              {t('create.assignEmpty')}{' '}
              <Link href="/workforce/employees/new" className={textNavLinkClassName}>
                {t('create.newEmployee')}
              </Link>
            </p>
          ) : (
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-[var(--pf-border-default)]">
              {employees.map((employee) => {
                const checkboxId = `${control.id}-${employee.id}`;
                const checked = selected.includes(employee.id);
                return (
                  <li key={employee.id} className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      onCheckedChange={(value) => toggle(employee.id, value === true)}
                    />
                    <label htmlFor={checkboxId} className="min-w-0 flex-1 text-start text-sm">
                      {employee.name}
                      {employee.jobTitle ? (
                        <span className="text-[var(--pf-text-muted)]"> · {employee.jobTitle}</span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

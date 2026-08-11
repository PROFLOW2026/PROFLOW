'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DISPATCH_WINDOWS, type DispatchWindow } from '@/modules/service/domain/types';

interface DispatchWindowFiltersProps {
  initialWindow: DispatchWindow;
  initialAssignee: string;
  employees: { id: string; name: string }[];
}

export function DispatchWindowFilters({
  initialWindow,
  initialAssignee,
  employees,
}: DispatchWindowFiltersProps) {
  const t = useTranslations('service');
  const tCommon = useTranslations('common');
  const [window, setWindow] = useState<DispatchWindow>(initialWindow);
  const [assignee, setAssignee] = useState(initialAssignee || 'all');

  return (
    <form
      method="get"
      className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-end"
    >
      <Field label={t('dispatch.windowLabel')} className="min-w-0 sm:w-44">
        {(control) => (
          <>
            <input type="hidden" name="window" value={window} />
            <Select value={window} onValueChange={(value) => setWindow(value as DispatchWindow)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPATCH_WINDOWS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`dispatch.windows.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>
      {employees.length > 0 ? (
        <Field label={t('dispatch.assigneeFilter')} className="min-w-0 sm:w-52">
          {(control) => (
            <>
              {assignee !== 'all' ? <input type="hidden" name="assignee" value={assignee} /> : null}
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('dispatch.allAssignees')}</SelectItem>
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
      <Button type="submit" variant="secondary">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}

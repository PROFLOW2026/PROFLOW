'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  TaskAssigneePicker,
  type TaskAssigneePickerOption,
} from '@/modules/tasks/ui/task-assignee-picker';
import {
  employeeFilterInputClass,
  employeePrimaryButtonClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { cn } from '@/shared/ui/cn';

interface ProjectOption {
  readonly id: string;
  readonly displayName: string;
}

export interface EmployeeTaskCreateFieldsProps {
  readonly projects: readonly ProjectOption[];
  readonly lockedProjectId?: string | null;
  readonly lockedProjectLabel?: string | null;
  readonly loadAssigneeOptions: (projectId: string) => Promise<TaskAssigneePickerOption[]>;
  readonly formAction: (formData: FormData) => void | Promise<void>;
}

export function EmployeeTaskCreateFields({
  projects,
  lockedProjectId = null,
  lockedProjectLabel = null,
  loadAssigneeOptions,
  formAction,
}: EmployeeTaskCreateFieldsProps) {
  const t = useTranslations('employeeApp.tasks.create');
  const [projectId, setProjectId] = useState(lockedProjectId ?? projects[0]?.id ?? '');
  const [assigneeOptions, setAssigneeOptions] = useState<TaskAssigneePickerOption[]>([]);
  const [assigneeKeys, setAssigneeKeys] = useState<string[]>([]);
  const [assignAllProjectTeam, setAssignAllProjectTeam] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void loadAssigneeOptions(projectId).then((options) => {
      if (!cancelled) setAssigneeOptions(options);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, loadAssigneeOptions]);

  const activeAssigneeOptions = projectId ? assigneeOptions : [];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="assigneeKeys" value={assigneeKeys.join(',')} />
      <input type="hidden" name="assignAllProjectTeam" value={assignAllProjectTeam ? '1' : '0'} />

      {lockedProjectId ? (
        <div className="space-y-2">
          <span className="text-sm font-medium text-[var(--pf-text-primary)]">{t('project')}</span>
          <input type="hidden" name="projectId" value={lockedProjectId} />
          <p className="text-sm text-[var(--pf-text-secondary)]">{lockedProjectLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor="projectId" className="text-sm font-medium text-[var(--pf-text-primary)]">
            {t('project')}
          </label>
          <select
            id="projectId"
            name="projectId"
            required
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setAssigneeKeys([]);
              setAssignAllProjectTeam(false);
            }}
            className={employeeFilterInputClass}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('title')}
        </label>
        <input id="title" name="title" required className={employeeFilterInputClass} />
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('description')}
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className={cn(employeeFilterInputClass, 'min-h-[88px]')}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="priority" className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('priority')}
        </label>
        <select id="priority" name="priority" defaultValue="medium" className={employeeFilterInputClass}>
          <option value="none">{t('priorityNone')}</option>
          <option value="low">{t('priorityLow')}</option>
          <option value="medium">{t('priorityMedium')}</option>
          <option value="high">{t('priorityHigh')}</option>
          <option value="urgent">{t('priorityUrgent')}</option>
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="dueDate" className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('dueDate')}
        </label>
        <input id="dueDate" name="dueDate" type="date" className={employeeFilterInputClass} />
      </div>

      {activeAssigneeOptions.length > 0 ? (
        <div className="space-y-2">
          <span className="text-sm font-medium text-[var(--pf-text-primary)]">{t('assignees')}</span>
          <TaskAssigneePicker
            options={activeAssigneeOptions}
            selectedKeys={assigneeKeys}
            onChange={setAssigneeKeys}
            allowWholeTeam
            wholeTeamSelected={assignAllProjectTeam}
            onWholeTeamChange={setAssignAllProjectTeam}
          />
        </div>
      ) : null}

      <button type="submit" className={cn(employeePrimaryButtonClass, 'w-full')}>
        {t('submit')}
      </button>
    </form>
  );
}

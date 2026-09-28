'use client';

import { useActionState, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TaskAssigneePicker, type TaskAssigneePickerOption } from '@/modules/tasks/ui/task-assignee-picker';
import {
  archiveProjectTaskTemplateAction,
  createProjectTaskTemplateAction,
  toggleProjectTaskTemplateEnabledAction,
  updateProjectTaskTemplateAction,
  type ProjectTaskTemplateActionState,
} from './actions';

interface EmployeeOption {
  id: string;
  name: string;
}

interface TemplateDefaultAssignee {
  employeeId: string;
  name: string | null;
  invalid: boolean;
}

interface ProjectTaskTemplateRow {
  id: string;
  title: string;
  description: string | null;
  isEnabled: boolean;
  isArchived: boolean;
  defaultAssigneeEmployeeIds: readonly string[];
  defaultAssignees: readonly TemplateDefaultAssignee[];
  defaultAssigneeInvalid: boolean;
}

function employeeOptionsFromList(employees: EmployeeOption[]): TaskAssigneePickerOption[] {
  return employees.map((employee) => ({
    key: `e:${employee.id}`,
    displayName: employee.name,
  }));
}

function TemplateAssigneeMultiSelect({
  employees,
  selectedEmployeeIds,
  onChange,
  inputName = 'defaultAssigneeEmployeeIds',
}: {
  employees: EmployeeOption[];
  selectedEmployeeIds: string[];
  onChange: (ids: string[]) => void;
  inputName?: string;
}) {
  const options = employeeOptionsFromList(employees);
  const selectedKeys = selectedEmployeeIds.map((id) => `e:${id}`);

  return (
    <>
      <input type="hidden" name={inputName} value={JSON.stringify(selectedEmployeeIds)} readOnly />
      <TaskAssigneePicker
        options={options}
        selectedKeys={selectedKeys}
        onChange={(keys) => onChange(keys.map((key) => key.replace(/^e:/, '')))}
      />
    </>
  );
}

function assigneeSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function TemplateRow({
  template,
  employees,
  canEdit,
}: {
  template: ProjectTaskTemplateRow;
  employees: EmployeeOption[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.projectTaskTemplatesPanel');
  const tActions = useTranslations('common.actions');
  const [editing, setEditing] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([
    ...template.defaultAssigneeEmployeeIds,
  ]);
  const formRef = useRef<HTMLFormElement>(null);
  const [updateState, updateAction, updatePending] = useActionState(
    updateProjectTaskTemplateAction,
    {} as ProjectTaskTemplateActionState,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleProjectTaskTemplateEnabledAction,
    {} as ProjectTaskTemplateActionState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveProjectTaskTemplateAction,
    {} as ProjectTaskTemplateActionState,
  );

  const submitWithScope = (scope: 'future_only' | 'existing_tasks') => {
    setApplyDialogOpen(false);
    const form = formRef.current;
    if (!form) return;
    const scopeInput = form.querySelector<HTMLInputElement>('input[name="applyScope"]');
    if (scopeInput) scopeInput.value = scope;
    form.requestSubmit();
  };

  const handleSaveClick = () => {
    const form = formRef.current;
    if (!form) return;
    const title = (form.querySelector<HTMLInputElement>('input[name="title"]')?.value ?? '').trim();
    const description =
      form.querySelector<HTMLTextAreaElement>('textarea[name="description"]')?.value ?? '';

    const titleChanged = title !== template.title;
    const descriptionChanged = (description.trim() || null) !== (template.description ?? null);
    const assigneeChanged = !assigneeSetsEqual(selectedAssigneeIds, template.defaultAssigneeEmployeeIds);

    if (titleChanged || descriptionChanged || assigneeChanged) {
      setApplyDialogOpen(true);
      return;
    }

    form.requestSubmit();
  };

  const assigneeLabel =
    template.defaultAssignees.length > 0
      ? template.defaultAssignees
          .map((assignee) => assignee.name ?? t('unknownAssignee'))
          .join(', ')
      : null;

  return (
    <div
      className={`flex flex-col gap-2 border-b border-[var(--pf-border-default)] py-3 last:border-0 ${template.isArchived ? 'opacity-50' : ''}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{template.title}</p>
          {template.description && (
            <p className="text-sm text-[var(--pf-text-secondary)]">{template.description}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {!template.isEnabled && !template.isArchived && (
              <Badge tone="neutral" className="text-xs">
                {t('disabledBadge')}
              </Badge>
            )}
            {assigneeLabel ? (
              <Badge tone="neutral" className="text-xs">
                {t('assigneesBadge', { names: assigneeLabel })}
              </Badge>
            ) : (
              <Badge tone="neutral" className="text-xs">
                {t('unassignedBadge')}
              </Badge>
            )}
            {template.defaultAssigneeInvalid && (
              <Badge tone="danger" className="text-xs">
                {t('invalidAssigneeBadge')}
              </Badge>
            )}
            {template.isArchived && (
              <Badge tone="neutral" className="text-xs text-[var(--pf-text-muted)]">
                {t('archivedBadge')}
              </Badge>
            )}
          </div>
        </div>

        {canEdit && !template.isArchived && (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
              {editing ? tActions('cancel') : tActions('edit')}
            </Button>
            <form action={toggleAction}>
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="enabled" value={template.isEnabled ? 'false' : 'true'} />
              <Button type="submit" size="sm" variant="ghost" loading={togglePending}>
                {template.isEnabled ? t('disable') : t('enable')}
              </Button>
            </form>
            <form action={archiveAction}>
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="restore" value="false" />
              <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
                {tActions('archive')}
              </Button>
            </form>
          </div>
        )}

        {canEdit && template.isArchived && (
          <form action={archiveAction}>
            <input type="hidden" name="id" value={template.id} />
            <input type="hidden" name="restore" value="true" />
            <Button type="submit" size="sm" variant="ghost" loading={archivePending}>
              {tActions('restore')}
            </Button>
          </form>
        )}
      </div>

      {editing && (
        <>
          <form ref={formRef} action={updateAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
            <input type="hidden" name="id" value={template.id} />
            <input type="hidden" name="applyScope" defaultValue="future_only" />
            <input type="hidden" name="isEnabled" value={template.isEnabled ? 'true' : 'false'} />
            <Input name="title" defaultValue={template.title} placeholder={t('templateTitle')} required />
            <Textarea
              name="description"
              defaultValue={template.description ?? ''}
              placeholder={t('descriptionOptional')}
              rows={2}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm text-[var(--pf-text-secondary)]">{t('defaultAssignees')}</label>
              <TemplateAssigneeMultiSelect
                employees={employees}
                selectedEmployeeIds={selectedAssigneeIds}
                onChange={setSelectedAssigneeIds}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" loading={updatePending} onClick={handleSaveClick}>
                {tActions('save')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {tActions('cancel')}
              </Button>
            </div>
            {updateState.error && <Alert tone="danger">{updateState.error}</Alert>}
            {updateState.ok && (
              <Alert tone="success" role="status">
                {updateState.message}
              </Alert>
            )}
          </form>

          <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('retroactiveTitle')}</DialogTitle>
                <DialogDescription>{t('retroactiveDescription')}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col gap-2 sm:flex-col">
                <Button type="button" onClick={() => submitWithScope('future_only')}>
                  {t('retroactiveFutureOnly')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => submitWithScope('existing_tasks')}>
                  {t('retroactiveExistingTasks')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setApplyDialogOpen(false)}>
                  {tActions('cancel')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {toggleState.error && <Alert tone="danger">{toggleState.error}</Alert>}
      {archiveState.error && <Alert tone="danger">{archiveState.error}</Alert>}
    </div>
  );
}

function CreateTemplateForm({
  employees,
  canEdit,
}: {
  employees: EmployeeOption[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.projectTaskTemplatesPanel');
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [state, action, pending] = useActionState(
    createProjectTaskTemplateAction,
    {} as ProjectTaskTemplateActionState,
  );

  if (!canEdit) return null;

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4"
    >
      <p className="text-sm font-medium">{t('createTitle')}</p>
      <Input name="title" placeholder={t('templateTitle')} required />
      <Textarea name="description" placeholder={t('descriptionOptional')} rows={2} />
      <div className="flex flex-col gap-1">
        <label className="text-sm text-[var(--pf-text-secondary)]">{t('defaultAssignees')}</label>
        <TemplateAssigneeMultiSelect
          employees={employees}
          selectedEmployeeIds={selectedAssigneeIds}
          onChange={setSelectedAssigneeIds}
        />
      </div>
      <Button type="submit" size="sm" loading={pending}>
        {t('createButton')}
      </Button>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && (
        <Alert tone="success" role="status">
          {state.message}
        </Alert>
      )}
    </form>
  );
}

export function ProjectTaskTemplatesPanel({
  templates,
  employees,
  canEdit,
  showArchived,
}: {
  templates: ProjectTaskTemplateRow[];
  employees: EmployeeOption[];
  canEdit: boolean;
  showArchived: boolean;
}) {
  const t = useTranslations('settings.projectTaskTemplatesPanel');
  const visible = showArchived ? templates : templates.filter((tpl) => !tpl.isArchived);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>

      {visible.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
      ) : (
        visible.map((template) => (
          <TemplateRow
            key={template.id}
            template={template}
            employees={employees}
            canEdit={canEdit}
          />
        ))
      )}

      <CreateTemplateForm employees={employees} canEdit={canEdit} />
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { MainAppListSearchToolbar } from '@/components/patterns/main-app';

interface Option {
  readonly id: string;
  readonly name: string;
}

interface ContractsListFiltersProps {
  initialStatus: string;
  initialType: string;
  initialClientId: string;
  initialProjectId: string;
  selectedClientName?: string | null;
  selectedProjectName?: string | null;
  clients: readonly Option[];
  projects: readonly Option[];
  listKit?: boolean;
}

/** Keep a selected id that is missing from the option list from rendering as a raw uuid. */
export function resolveNamedFilterValue(
  selectedId: string,
  options: readonly Option[],
  loadedName: string | null | undefined,
): { value: string; extra: Option | null } {
  const id = selectedId.trim();
  if (!id || id === 'all') return { value: 'all', extra: null };
  if (options.some((option) => option.id === id)) return { value: id, extra: null };
  const name = loadedName?.trim();
  if (name && name !== id) return { value: id, extra: { id, name } };
  return { value: 'all', extra: null };
}

export function ContractsListFilters({
  initialStatus,
  initialType,
  initialClientId,
  initialProjectId,
  selectedClientName = null,
  selectedProjectName = null,
  clients,
  projects,
  listKit = true,
}: ContractsListFiltersProps) {
  const t = useTranslations('contracts');
  const tCommon = useTranslations('common');
  const clientSelection = resolveNamedFilterValue(initialClientId, clients, selectedClientName);
  const projectSelection = resolveNamedFilterValue(initialProjectId, projects, selectedProjectName);
  const clientOptions = clientSelection.extra ? [...clients, clientSelection.extra] : clients;
  const projectOptions = projectSelection.extra ? [...projects, projectSelection.extra] : projects;

  const filterFields = (
    <>
      <Field label={t('list.columns.status')} className="min-w-0 w-full sm:w-36">
        {(control) => (
          <Select name="status" defaultValue={initialStatus}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="draft">{t('statuses.draft')}</SelectItem>
              <SelectItem value="active">{t('statuses.active')}</SelectItem>
              <SelectItem value="closed">{t('statuses.closed')}</SelectItem>
              <SelectItem value="cancelled">{t('statuses.cancelled')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={t('list.columns.type')} className="min-w-0 w-full sm:w-36">
        {(control) => (
          <Select name="type" defaultValue={initialType}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="primary">{t('types.primary')}</SelectItem>
              <SelectItem value="additional">{t('types.additional')}</SelectItem>
              <SelectItem value="secondary">{t('types.secondary')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={t('list.columns.client')} className="min-w-0 w-full sm:w-44">
        {(control) => (
          <Select name="clientId" defaultValue={clientSelection.value}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              {clientOptions.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={t('list.columns.project')} className="min-w-0 w-full sm:w-44">
        {(control) => (
          <Select name="projectId" defaultValue={projectSelection.value}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              {projectOptions.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </>
  );

  if (!listKit) {
    return (
      <form
        method="get"
        className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        {filterFields}
        <Button type="submit" variant="secondary" className="min-h-11 w-full sm:w-auto">
          {tCommon('actions.filter')}
        </Button>
      </form>
    );
  }

  return (
    <MainAppListSearchToolbar
      initialQuery=""
      searchPlaceholder=""
      filterFields={filterFields}
      compact
      showSearch={false}
    />
  );
}

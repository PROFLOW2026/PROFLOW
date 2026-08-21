'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Option {
  readonly id: string;
  readonly name: string;
}

interface ContractsListFiltersProps {
  initialStatus: string;
  initialType: string;
  initialClientId: string;
  initialProjectId: string;
  clients: readonly Option[];
  projects: readonly Option[];
}

export function ContractsListFilters({
  initialStatus,
  initialType,
  initialClientId,
  initialProjectId,
  clients,
  projects,
}: ContractsListFiltersProps) {
  const t = useTranslations('contracts');
  const tCommon = useTranslations('common');

  return (
    <form method="get" className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field label={t('list.columns.status')} className="min-w-0 sm:w-36">
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
      <Field label={t('list.columns.type')} className="min-w-0 sm:w-36">
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
      <Field label={t('list.columns.client')} className="min-w-0 sm:w-44">
        {(control) => (
          <Select name="clientId" defaultValue={initialClientId || 'all'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={t('list.columns.project')} className="min-w-0 sm:w-44">
        {(control) => (
          <Select name="projectId" defaultValue={initialProjectId || 'all'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Button type="submit" variant="secondary">
        {tCommon('actions.search')}
      </Button>
    </form>
  );
}

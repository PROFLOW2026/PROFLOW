'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Option {
  readonly id: string;
  readonly name: string;
}

interface SubcontractsListFiltersProps {
  initialVendorId: string;
  initialProjectId: string;
  initialStatus: string;
  vendors: readonly Option[];
  projects: readonly Option[];
}

export function SubcontractsListFilters({
  initialVendorId,
  initialProjectId,
  initialStatus,
  vendors,
  projects,
}: SubcontractsListFiltersProps) {
  const t = useTranslations('vendors.subcontractsWorkspace');
  const tCommon = useTranslations('common');
  const tSub = useTranslations('vendors.subcontracts');

  return (
    <form method="get" className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field label={t('list.columns.vendor')} className="min-w-0 sm:w-44">
        {(control) => (
          <Select name="vendorId" defaultValue={initialVendorId || 'all'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
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
      <Field label={t('list.columns.status')} className="min-w-0 sm:w-36">
        {(control) => (
          <Select name="status" defaultValue={initialStatus}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="draft">{tSub('status.draft')}</SelectItem>
              <SelectItem value="active">{tSub('status.active')}</SelectItem>
              <SelectItem value="completed">{tSub('status.completed')}</SelectItem>
              <SelectItem value="cancelled">{tSub('status.cancelled')}</SelectItem>
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

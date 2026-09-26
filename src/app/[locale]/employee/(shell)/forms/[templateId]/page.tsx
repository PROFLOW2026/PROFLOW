import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { getFormTemplateForOrg } from '@/modules/forms';
import { templateRequiresAcknowledgement } from '@/modules/forms/domain/schema';
import type { FormFieldDefinition } from '@/modules/forms/domain/types';
import { listEmployeeFormOwnerProjects } from '@/modules/employee-app/application/employee-operational';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { employeePrimaryButtonClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeSubmitFormAction } from '../actions';

function FieldInputs({
  field,
  yesLabel,
  noLabel,
}: {
  field: FormFieldDefinition;
  yesLabel: string;
  noLabel: string;
}) {
  const name = `answer_${field.key}`;

  switch (field.type) {
    case 'checklist':
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{field.label}</legend>
          {(field.items ?? []).map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`${name}__${item.key}`} value="true" />
              {item.label}
            </label>
          ))}
        </fieldset>
      );
    case 'yes_no':
      return (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name={name} value="yes" required={field.required} />
            {yesLabel}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={name} value="no" />
            {noLabel}
          </label>
        </div>
      );
    case 'notes':
      return (
        <textarea
          name={name}
          rows={4}
          required={field.required}
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        />
      );
    case 'number':
      return (
        <input
          name={name}
          type="number"
          inputMode="decimal"
          required={field.required}
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        />
      );
    case 'date':
      return (
        <input
          name={name}
          type="date"
          required={field.required}
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        />
      );
    case 'photo':
      return <input type="hidden" name={name} value='{"documentIds":[]}' />;
    case 'signature':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} value="true" required={field.required} />
          {field.label}
        </label>
      );
    default:
      return (
        <input
          name={name}
          required={field.required}
          className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
        />
      );
  }
}

export default async function EmployeeFormSubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { templateId } = await params;
  const query = await searchParams;
  const t = await getTranslations('employeeApp.forms');
  const tForms = await getTranslations('forms');

  const data = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.FORMS_SUBMIT)) return null;
    if (!employeeHasPermission(context, PERMISSIONS.FORMS_READ)) return null;
    try {
      const template = await getFormTemplateForOrg(context, templateId);
      if (!template.enabled || template.archivedAt) return null;
      const projects = await listEmployeeFormOwnerProjects(context);
      return { template, projects };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const needsAck = templateRequiresAcknowledgement(data.template.schema);
  const inputClass =
    'w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <Link
        href="/employee/forms"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>
      <div>
        <h1 className="text-lg font-semibold">{data.template.name}</h1>
        {data.template.description ? (
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{data.template.description}</p>
        ) : null}
      </div>
      <p className="text-sm text-[var(--pf-text-secondary)]">{tForms('acknowledgementDisclaimer')}</p>
      {query.error ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('error')}
        </p>
      ) : null}
      {data.projects.length === 0 ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('noProjects')}
        </p>
      ) : (
        <form action={employeeSubmitFormAction} className="space-y-4">
          <input type="hidden" name="templateId" value={data.template.id} />
          <div className="space-y-2">
            <label htmlFor="owner" className="text-sm font-medium">
              {t('project')}
            </label>
            <select id="owner" name="owner" required className={inputClass}>
              <option value="">{t('selectProject')}</option>
              {data.projects.map((project) => (
                <option key={project.id} value={`${project.workKind}:${project.id}`}>
                  {project.displayName}
                </option>
              ))}
            </select>
          </div>
          {data.template.schema.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              {field.type === 'signature' || field.type === 'photo' ? null : (
                <label className="text-sm font-medium">
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
              )}
              {field.helpText ? (
                <p className="text-xs text-[var(--pf-text-secondary)]">{field.helpText}</p>
              ) : null}
              {field.type === 'photo' ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">{t('photoSkipped')}</p>
              ) : null}
              <FieldInputs
                field={field}
                yesLabel={tForms('fill.yes')}
                noLabel={tForms('fill.no')}
              />
              {field.type === 'signature' ? (
                <p className="text-xs text-[var(--pf-text-secondary)]">{tForms('fill.signatureHelp')}</p>
              ) : null}
            </div>
          ))}
          {needsAck ? (
            <>
              <div className="space-y-2">
                <label htmlFor="acknowledgementName" className="text-sm font-medium">
                  {tForms('fill.acknowledgementName')}
                </label>
                <input
                  id="acknowledgementName"
                  name="acknowledgementName"
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="acknowledgementNote" className="text-sm font-medium">
                  {tForms('fill.acknowledgementNote')}
                </label>
                <textarea
                  id="acknowledgementNote"
                  name="acknowledgementNote"
                  rows={2}
                  className={inputClass}
                />
              </div>
            </>
          ) : null}
          <button type="submit" className={employeePrimaryButtonClass}>
            {t('submit')}
          </button>
        </form>
      )}
    </div>
  );
}

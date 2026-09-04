'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localizeCode } from '@/shared/i18n/code-display';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import type { LaborCostDefaults } from '@/modules/tenancy/domain/labor-cost-defaults';
import type { OrganizationDomainRow } from '@/modules/tenancy/domain/organization-domains';
import {
  archiveCatalogItemAction,
  createDocumentTypeAction,
  createServiceDomainAction,
  renameCatalogItemAction,
  saveLaborCostDefaultsAction,
  type SettingsActionState,
} from '../actions';

export function CatalogSettingsPanel({
  domains,
  documentTypes,
  laborDefaults,
  canEdit,
}: {
  domains: readonly OrganizationDomainRow[];
  documentTypes: readonly OrganizationDomainRow[];
  laborDefaults: LaborCostDefaults;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.catalog');

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      <CatalogList
        title={t('domainsTitle')}
        hint={t('domainsHint')}
        emptyTitle={t('domainsEmpty')}
        items={domains}
        canEdit={canEdit}
        createAction={createServiceDomainAction}
        addLabel={t('addDomain')}
      />

      <CatalogList
        title={t('documentTypesTitle')}
        hint={t('documentTypesHint')}
        emptyTitle={t('documentTypesEmpty')}
        items={documentTypes}
        canEdit={canEdit}
        createAction={createDocumentTypeAction}
        addLabel={t('addDocumentType')}
      />

      <LaborDefaultsForm defaults={laborDefaults} canEdit={canEdit} />
    </div>
  );
}

function CatalogList({
  title,
  hint,
  emptyTitle,
  items,
  canEdit,
  createAction,
  addLabel,
}: {
  title: string;
  hint: string;
  emptyTitle: string;
  items: readonly OrganizationDomainRow[];
  canEdit: boolean;
  createAction: (
    prev: SettingsActionState,
    formData: FormData,
  ) => Promise<SettingsActionState>;
  addLabel: string;
}) {
  const t = useTranslations('settings.catalog');
  const tCommon = useTranslations('common');
  const [createState, action, pending] = useActionState(createAction, {} as SettingsActionState);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{hint}</p>
      </div>

      {items.length === 0 ? (
        <EmptyState title={emptyTitle} description={hint} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <CatalogRow key={item.id} item={item} canEdit={canEdit} />
          ))}
        </ul>
      )}

      {canEdit ? (
        <form action={action} className="flex w-full max-w-md flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
          {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
          {createState.ok ? (
            <Alert tone="success" role="status" aria-live="polite">
              {tCommon('states.saved')}
            </Alert>
          ) : null}
          <Field label={tCommon('labels.name')} required>
            {(props) => <Input {...props} name="name" required />}
          </Field>
          <Button type="submit" size="sm" loading={pending}>
            {addLabel}
          </Button>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('copySemantics')}</p>
        </form>
      ) : null}
    </section>
  );
}

function CatalogRow({
  item,
  canEdit,
}: {
  item: OrganizationDomainRow;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.catalog');
  const tCommon = useTranslations('common');
  const [renameState, renameAction, renamePending] = useActionState(
    renameCatalogItemAction,
    {} as SettingsActionState,
  );

  async function handleArchive() {
    const result = await archiveCatalogItemAction(item.id);
    if (result.error) return { error: result.error };
    return { ok: true };
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2">
      {canEdit ? (
        <form action={renameAction} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <Input name="name" defaultValue={item.name} className="min-w-0 w-full max-w-xs flex-1" aria-label={item.name} />
          <Button type="submit" size="sm" variant="secondary" loading={renamePending}>
            {tCommon('actions.save')}
          </Button>
          {renameState.error ? <Alert tone="danger" className="w-full">{renameState.error}</Alert> : null}
        </form>
      ) : (
        <span className="flex-1 text-sm">{item.name}</span>
      )}
      {!item.enabled ? (
        <span className="text-xs text-[var(--pf-text-muted)]">{t('disabled')}</span>
      ) : null}
      {canEdit ? (
        <ConfirmAction
          title={tCommon('actions.archive')}
          description={<p>{t('archiveQuestion', { name: item.name })}</p>}
          confirmLabel={tCommon('actions.archive')}
          successMessage={t('archiveSuccess')}
          onConfirm={handleArchive}
          trigger={
            <Button type="button" size="sm" variant="ghost">
              {tCommon('actions.archive')}
            </Button>
          }
        />
      ) : null}
    </li>
  );
}

function LaborDefaultsForm({
  defaults,
  canEdit,
}: {
  defaults: LaborCostDefaults;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.catalog');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    saveLaborCostDefaultsAction,
    {} as SettingsActionState,
  );

  const initialRows: ComponentRow[] =
    defaults.components.length > 0
      ? defaults.components.map((component) => ({
          name: component.key,
          basis: component.basis,
          value: component.basis === 'percent' ? (component.percent ?? '') : (component.amount ?? ''),
        }))
      : [{ name: '', basis: 'percent' as const, value: '' }];

  if (!canEdit && !defaults.burdenPercent && defaults.components.length === 0
    && !defaults.standardHoursPerDay && !defaults.workingDaysPerMonth) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
      <div>
        <h2 className="text-base font-semibold">{t('laborTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('laborHint')}</p>
      </div>

      {canEdit ? (
        <form action={action} className="flex w-full max-w-lg flex-col gap-3">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? (
            <Alert tone="success" role="status" aria-live="polite">
              {t('laborSaved')}
            </Alert>
          ) : null}
          <Field label={t('burdenPercent')} optionalLabel={tCommon('labels.optional')}>
            {(props) => (
              <Input
                {...props}
                name="burdenPercent"
                inputMode="decimal"
                dir="ltr"
                defaultValue={defaults.burdenPercent ?? ''}
              />
            )}
          </Field>
          <Field label={t('standardHoursPerDay')} optionalLabel={tCommon('labels.optional')}>
            {(props) => (
              <Input
                {...props}
                name="standardHoursPerDay"
                inputMode="decimal"
                dir="ltr"
                placeholder="8"
                defaultValue={defaults.standardHoursPerDay ?? ''}
              />
            )}
          </Field>
          <Field label={t('workingDaysPerMonth')} optionalLabel={tCommon('labels.optional')}>
            {(props) => (
              <Input
                {...props}
                name="workingDaysPerMonth"
                inputMode="decimal"
                dir="ltr"
                placeholder="22.75"
                defaultValue={defaults.workingDaysPerMonth ?? ''}
              />
            )}
          </Field>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('workCalendarHint')}</p>
          <LaborComponentsEditor initialRows={initialRows} />
          <Button type="submit" loading={pending} variant="secondary">
            {tCommon('actions.save')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {defaults.burdenPercent
              ? t('burdenDisplay', { percent: defaults.burdenPercent })
              : t('noLaborDefaults')}
          </p>
          {defaults.components.length > 0 ? (
            <ul className="text-sm text-[var(--pf-text-secondary)]">
              {defaults.components.map((component) => (
                <li key={component.key}>
                  {localizeCode(locale, component.key)}
                  {' · '}
                  {component.basis === 'percent'
                    ? t('componentPercent')
                    : t('componentFixedAmount')}
                  {component.basis === 'percent' && component.percent
                    ? ` ${component.percent}%`
                    : component.amount
                      ? ` ${component.amount}`
                      : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}

type ComponentRow = {
  name: string;
  basis: 'percent' | 'fixed';
  value: string;
};

function serializeComponentRows(rows: readonly ComponentRow[]): string {
  return rows
    .filter((row) => row.name.trim() && row.value.trim())
    .map((row) => `${row.name.trim()}=${row.basis}:${row.value.trim()}`)
    .join('\n');
}

function LaborComponentsEditor({ initialRows }: { initialRows: ComponentRow[] }) {
  const t = useTranslations('settings.catalog');
  const tCommon = useTranslations('common');
  const [rows, setRows] = useState<ComponentRow[]>(initialRows);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('components')}</p>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('componentsHint')}</p>
      <input type="hidden" name="componentsText" value={serializeComponentRows(rows)} />
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-md border border-[var(--pf-border-default)] p-2 sm:grid-cols-[1fr_8rem_6rem_auto]">
          <Field label={t('componentName')}>
            {(props) => (
              <Input
                {...props}
                value={row.name}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)),
                  )
                }
              />
            )}
          </Field>
          <Field label={t('componentBasis')}>
            {(props) => (
              <select
                {...props}
                className="flex h-10 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm"
                value={row.basis}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, basis: event.target.value as 'percent' | 'fixed' } : item,
                    ),
                  )
                }
              >
                <option value="percent">{t('componentPercent')}</option>
                <option value="fixed">{t('componentFixedAmount')}</option>
              </select>
            )}
          </Field>
          <Field label={row.basis === 'percent' ? t('componentPercent') : t('componentFixedAmount')}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                dir="ltr"
                value={row.value}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)),
                  )
                }
              />
            )}
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              {t('removeComponent')}
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => setRows((current) => [...current, { name: '', basis: 'percent', value: '' }])}
      >
        {t('addComponent')}
      </Button>
      <span className="sr-only">{tCommon('labels.optional')}</span>
    </div>
  );
}

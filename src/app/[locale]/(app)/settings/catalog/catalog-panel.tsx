'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
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
        <form action={action} className="flex max-w-md flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
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
          <Input name="name" defaultValue={item.name} className="max-w-xs" aria-label={item.name} />
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
  const [state, action, pending] = useActionState(
    saveLaborCostDefaultsAction,
    {} as SettingsActionState,
  );

  if (!canEdit && !defaults.burdenPercent && defaults.components.length === 0) {
    return null;
  }

  const componentsText = defaults.components
    .map((c) =>
      c.basis === 'percent'
        ? `${c.key}=percent:${c.percent ?? ''}`
        : `${c.key}=fixed:${c.amount ?? ''}`,
    )
    .join('\n');

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
      <div>
        <h2 className="text-base font-semibold">{t('laborTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('laborHint')}</p>
      </div>

      {canEdit ? (
        <form action={action} className="flex max-w-lg flex-col gap-3">
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
          <Field label={t('components')} optionalLabel={tCommon('labels.optional')}>
            {(props) => (
              <textarea
                {...props}
                name="componentsText"
                rows={4}
                className="w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                defaultValue={componentsText}
                placeholder={t('componentsPlaceholder')}
              />
            )}
          </Field>
          <Button type="submit" loading={pending} variant="secondary">
            {tCommon('actions.save')}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {defaults.burdenPercent
            ? t('burdenDisplay', { percent: defaults.burdenPercent })
            : t('noLaborDefaults')}
        </p>
      )}
    </section>
  );
}

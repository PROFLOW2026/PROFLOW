'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import type { OrgStructureTemplatesBag } from '@/modules/tenancy/domain/org-structure-templates';
import {
  deleteOrgPhasePackAction,
  deleteOrgProjectTemplateAction,
  deleteOrgWorkPackagePackAction,
  upsertOrgPhasePackAction,
  upsertOrgProjectTemplateAction,
  upsertOrgWorkPackagePackAction,
  type SettingsActionState,
} from '../actions';

export function TemplatesSettingsPanel({
  bag,
  canEdit,
}: {
  bag: OrgStructureTemplatesBag;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.templates');

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('projectTemplates')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('projectTemplatesHint')}</p>
        {bag.projectTemplates.length === 0 ? (
          <EmptyState title={t('emptyProject')} description={t('projectTemplatesHint')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {bag.projectTemplates.map((template) => (
              <li
                key={template.id}
                className="rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{template.name}</p>
                    {template.description ? (
                      <p className="text-[var(--pf-text-secondary)]">{template.description}</p>
                    ) : null}
                    <p className="mt-1 text-[var(--pf-text-secondary)]">
                      {template.workPackages.map((pkg) => pkg.name).join(', ')}
                    </p>
                  </div>
                  {canEdit ? (
                    <ConfirmAction
                      title={t('delete')}
                      description={<p>{t('deleteConfirm', { name: template.name })}</p>}
                      confirmLabel={t('delete')}
                      successMessage={t('deleted')}
                      onConfirm={async () => {
                        const result = await deleteOrgProjectTemplateAction(template.id);
                        if (result.error) return { error: result.error };
                        return { ok: true };
                      }}
                      trigger={
                        <Button type="button" size="sm" variant="ghost">
                          {t('delete')}
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canEdit ? <UpsertProjectTemplateForm /> : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
        <h2 className="text-base font-semibold">{t('phasePacks')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('phasePacksHint')}</p>
        {bag.phasePacks.length === 0 ? (
          <EmptyState title={t('emptyPhase')} description={t('phasePacksHint')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {bag.phasePacks.map((pack) => (
              <li
                key={pack.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{pack.name}</p>
                  <p className="text-[var(--pf-text-secondary)]">{pack.phases.join(', ')}</p>
                </div>
                {canEdit ? (
                  <ConfirmAction
                    title={t('delete')}
                    description={<p>{t('deleteConfirm', { name: pack.name })}</p>}
                    confirmLabel={t('delete')}
                    successMessage={t('deleted')}
                    onConfirm={async () => {
                      const result = await deleteOrgPhasePackAction(pack.id);
                      if (result.error) return { error: result.error };
                      return { ok: true };
                    }}
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        {t('delete')}
                      </Button>
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? <UpsertPhasePackForm /> : null}
      </section>

      <section className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
        <h2 className="text-base font-semibold">{t('wpPacks')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('wpPacksHint')}</p>
        {bag.workPackagePacks.length === 0 ? (
          <EmptyState title={t('emptyWp')} description={t('wpPacksHint')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {bag.workPackagePacks.map((pack) => (
              <li
                key={pack.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{pack.name}</p>
                  <p className="text-[var(--pf-text-secondary)]">
                    {pack.workPackageNames.join(', ')}
                  </p>
                </div>
                {canEdit ? (
                  <ConfirmAction
                    title={t('delete')}
                    description={<p>{t('deleteConfirm', { name: pack.name })}</p>}
                    confirmLabel={t('delete')}
                    successMessage={t('deleted')}
                    onConfirm={async () => {
                      const result = await deleteOrgWorkPackagePackAction(pack.id);
                      if (result.error) return { error: result.error };
                      return { ok: true };
                    }}
                    trigger={
                      <Button type="button" size="sm" variant="ghost">
                        {t('delete')}
                      </Button>
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? <UpsertWpPackForm /> : null}
      </section>
    </div>
  );
}

function UpsertProjectTemplateForm() {
  const t = useTranslations('settings.templates');
  const tCommon = useTranslations('common');
  const [state, action, pending] = useActionState(
    upsertOrgProjectTemplateAction,
    {} as SettingsActionState,
  );

  return (
    <form action={action} className="flex max-w-lg flex-col gap-3 rounded-md border border-dashed border-[var(--pf-border-default)] p-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {t('saved')}
        </Alert>
      ) : null}
      <Field label={t('name')} required>
        {(props) => <Input {...props} name="name" required />}
      </Field>
      <Field label={t('description')} optionalLabel={tCommon('labels.optional')}>
        {(props) => <Input {...props} name="description" />}
      </Field>
      <Field label={t('workPackagesText')} required>
        {(props) => (
          <textarea
            {...props}
            name="workPackagesText"
            required
            rows={4}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
            placeholder={t('workPackagesPlaceholder')}
          />
        )}
      </Field>
      <Field label={t('milestonesText')} optionalLabel={tCommon('labels.optional')}>
        {(props) => (
          <textarea
            {...props}
            name="milestonesText"
            rows={3}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
            placeholder={t('milestonesPlaceholder')}
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        {t('addProjectTemplate')}
      </Button>
    </form>
  );
}

function UpsertPhasePackForm() {
  const t = useTranslations('settings.templates');
  const [state, action, pending] = useActionState(
    upsertOrgPhasePackAction,
    {} as SettingsActionState,
  );

  return (
    <form action={action} className="flex max-w-lg flex-col gap-3 rounded-md border border-dashed border-[var(--pf-border-default)] p-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {t('saved')}
        </Alert>
      ) : null}
      <Field label={t('name')} required>
        {(props) => <Input {...props} name="name" required />}
      </Field>
      <Field label={t('phasesText')} required>
        {(props) => (
          <textarea
            {...props}
            name="phasesText"
            required
            rows={3}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
            placeholder={t('phasesPlaceholder')}
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        {t('addPhasePack')}
      </Button>
    </form>
  );
}

function UpsertWpPackForm() {
  const t = useTranslations('settings.templates');
  const [state, action, pending] = useActionState(
    upsertOrgWorkPackagePackAction,
    {} as SettingsActionState,
  );

  return (
    <form action={action} className="flex max-w-lg flex-col gap-3 rounded-md border border-dashed border-[var(--pf-border-default)] p-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {t('saved')}
        </Alert>
      ) : null}
      <Field label={t('name')} required>
        {(props) => <Input {...props} name="name" required />}
      </Field>
      <Field label={t('wpNamesText')} required>
        {(props) => (
          <textarea
            {...props}
            name="workPackagesText"
            required
            rows={3}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
            placeholder={t('wpNamesPlaceholder')}
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        {t('addWpPack')}
      </Button>
    </form>
  );
}

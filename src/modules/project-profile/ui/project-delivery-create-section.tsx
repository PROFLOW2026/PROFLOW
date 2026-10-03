'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import { CHARACTERISTIC_COUNT_LIMITS, CONSTRUCTION_CATEGORIES } from '../domain/characteristics';
import { DELIVERY_CREATE_COUNT_FIELDS, DELIVERY_CREATE_FIELD } from '../domain/create-section';
import { OPERATING_ROLES, OWNERSHIP_MODELS, type OperatingRole, type OwnershipModel } from '../domain/profile';

/**
 * Optional collapsible section for the project create form. Renders plain named inputs
 * (`deliveryProfile.*`); the create action reads them with `parseDeliveryCreateFormData`
 * and calls `applyDeliveryAtProjectCreate` after `createProject`. Leaving it empty changes
 * nothing in the existing create flow. Requires the `projectProfile` client namespace.
 */
export function ProjectDeliveryCreateSection({ defaultOpen = false }: { readonly defaultOpen?: boolean }) {
  const t = useTranslations('projectProfile');
  const [roles, setRoles] = useState<OperatingRole[]>([]);
  const [ownership, setOwnership] = useState<OwnershipModel>('own_development');
  const isDeveloper = roles.includes('developer');

  const toggle = (role: OperatingRole, checked: boolean) =>
    setRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)));

  return (
    <CollapsibleSection title={t('createSection.title')} summary={t('createSection.summary')} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('createSection.description')}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('profile.rolesLabel')}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPERATING_ROLES.map((role) => (
              <label
                key={role}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--pf-border-default)] px-3"
              >
                <input
                  type="checkbox"
                  name={DELIVERY_CREATE_FIELD.roles}
                  value={role}
                  checked={roles.includes(role)}
                  onChange={(event) => toggle(role, event.target.checked)}
                  className="size-4.5 accent-[var(--pf-action-primary)]"
                />
                <span className="text-sm">{t(`profile.roles.${role}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {isDeveloper ? (
          <>
            <Field label={t('profile.ownershipLabel')}>
              {(props) => (
                <select
                  {...props}
                  name={DELIVERY_CREATE_FIELD.ownershipModel}
                  className={inputClassName}
                  value={ownership}
                  onChange={(event) => setOwnership(event.target.value as OwnershipModel)}
                >
                  {OWNERSHIP_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {t(`profile.ownership.${model}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {ownership !== 'client_project' ? (
              <Alert tone="info" role="status">
                <p className="text-sm">{t('createSection.developerNoClient')}</p>
              </Alert>
            ) : null}
          </>
        ) : null}

        <Field label={t('characteristics.category')}>
          {(props) => (
            <select {...props} name={DELIVERY_CREATE_FIELD.category} className={inputClassName} defaultValue="">
              <option value="">{t('characteristics.notSet')}</option>
              {CONSTRUCTION_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`characteristics.categories.${value}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {DELIVERY_CREATE_COUNT_FIELDS.map((field) => (
            <Field key={field} label={t(`characteristics.${field}`)}>
              {(props) => (
                <Input
                  {...props}
                  name={DELIVERY_CREATE_FIELD[field]}
                  numeric
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={CHARACTERISTIC_COUNT_LIMITS[field]}
                  step={1}
                />
              )}
            </Field>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

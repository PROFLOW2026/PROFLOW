'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { saveOrganizationLegalIdentityAction, type SettingsActionState } from '../actions';

export function LegalIdentityForm({
  taxId,
  companyNumber,
  canEdit,
}: {
  taxId: string | null;
  companyNumber: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('organization.profile');
  const tCommon = useTranslations('common');
  const [state, action, pending] = useActionState(
    saveOrganizationLegalIdentityAction,
    {} as SettingsActionState,
  );

  return (
    <form action={action} className="flex w-full max-w-lg flex-col gap-4 border-t border-[var(--pf-border-default)] pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t('legalIdentityTitle')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('legalIdentityHint')}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('legalIdentitySyncHint')}</p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('legalIdentitySaved')}</Alert> : null}

      <Field label={t('taxId')} optionalLabel={tCommon('labels.optional')} description={t('taxIdHint')}>
        {(props) => (
          <Input
            {...props}
            name="taxId"
            defaultValue={taxId ?? ''}
            disabled={!canEdit}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
          />
        )}
      </Field>

      <Field
        label={t('companyNumber')}
        optionalLabel={tCommon('labels.optional')}
        description={t('companyNumberHint')}
      >
        {(props) => (
          <Input
            {...props}
            name="companyNumber"
            defaultValue={companyNumber ?? ''}
            disabled={!canEdit}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
          />
        )}
      </Field>

      {canEdit ? (
        <div>
          <Button type="submit" loading={pending}>
            {tCommon('actions.save')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { DemoEntryErrorCode } from '@/modules/demo/domain/demo-entry-error';
import { DEMO_ROLE_CHOICES, type DemoRoleKey } from '@/modules/demo/domain/demo-roles';
import { LandingHeader } from '@/modules/marketing/ui/landing-header';
import type { BusinessProfileKey } from '@/modules/tenancy/domain/business-profiles';

const selectClass =
  'min-h-11 w-full min-w-0 max-w-xl rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 py-2 text-base text-[var(--pf-text-primary)]';

type DemoEntryScreenProps = {
  action: (formData: FormData) => Promise<void>;
  businessKeys: readonly BusinessProfileKey[];
  footer: ReactNode;
  demoError?: DemoEntryErrorCode;
};

function DemoEntrySubmit() {
  const { pending } = useFormStatus();
  const t = useTranslations('demo');
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      block
      className="min-h-11 max-w-xl"
      loading={pending}
      disabled={pending}
      aria-live="polite"
    >
      {pending ? t('entry.submitting') : t('entry.submit')}
    </Button>
  );
}

function DemoEntryChoices({
  businessKeys,
  profileKey,
  roleKey,
  onProfileKeyChange,
  onRoleKeyChange,
}: {
  businessKeys: readonly BusinessProfileKey[];
  profileKey: BusinessProfileKey;
  roleKey: DemoRoleKey;
  onProfileKeyChange: (key: BusinessProfileKey) => void;
  onRoleKeyChange: (key: DemoRoleKey) => void;
}) {
  const t = useTranslations('demo');

  const businessLabel = t(`businesses.${profileKey}`);
  const roleLabel = t(`roles.${roleKey}`);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 text-base font-bold text-[var(--pf-text-primary)]">
          {t('entry.businessLegend')}
        </legend>
        <p className="mb-4 text-sm leading-relaxed text-[var(--pf-text-secondary)]">
          {t('entry.businessHelp')}
        </p>
        <div className="min-w-0 max-w-xl" data-pf-demo-business-choices>
          <select
            name="profileKey"
            value={profileKey}
            required
            className={selectClass}
            onChange={(event) => onProfileKeyChange(event.target.value as BusinessProfileKey)}
            aria-describedby="demo-selected-summary"
          >
            {businessKeys.map((key) => (
              <option key={key} value={key}>
                {t(`businesses.${key}`)}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 text-base font-bold text-[var(--pf-text-primary)]">
          {t('entry.roleLegend')}
        </legend>
        <p className="mb-4 text-sm leading-relaxed text-[var(--pf-text-secondary)]">
          {t('entry.roleHelp')}
        </p>
        <div className="min-w-0 max-w-xl" data-pf-demo-role-choices>
          <select
            name="roleKey"
            value={roleKey}
            required
            className={selectClass}
            onChange={(event) => onRoleKeyChange(event.target.value as DemoRoleKey)}
            aria-describedby="demo-selected-summary"
          >
            {DEMO_ROLE_CHOICES.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {t(`roles.${choice.key}`)}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <div
        id="demo-selected-summary"
        className="min-w-0 max-w-xl rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3 text-sm text-[var(--pf-text-primary)]"
      >
        <p>{t('entry.selectedBusiness', { business: businessLabel })}</p>
        <p className="mt-1">{t('entry.selectedRole', { role: roleLabel })}</p>
      </div>
    </div>
  );
}

/**
 * Public demo entry — marketing shell, business profile + role selection.
 */
export function DemoEntryScreen({ action, businessKeys, footer, demoError }: DemoEntryScreenProps) {
  const t = useTranslations('demo');
  const defaultProfile = businessKeys[0] ?? 'GENERAL_CONTRACTOR';
  const [profileKey, setProfileKey] = useState<BusinessProfileKey>(defaultProfile);
  const [roleKey, setRoleKey] = useState<DemoRoleKey>('owner');

  return (
    <div className="min-h-dvh min-w-0 max-w-full bg-[var(--pf-bg-page)]" data-pf-demo-entry>
      <LandingHeader />

      <main id="main">
        <section
          className="relative overflow-hidden bg-[linear-gradient(180deg,var(--pf-bg-surface)_0%,var(--pf-bg-page)_100%)]"
          aria-labelledby="demo-entry-heading"
          data-pf-landing-section="demo-entry"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_85%_20%,color-mix(in_srgb,var(--pf-teal-600)_12%,transparent),transparent_55%)]"
            aria-hidden
          />
          <div className="relative mx-auto w-full min-w-0 max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
            <div className="mx-auto min-w-0 max-w-3xl">
              <p className="mb-3 text-2xl font-bold tracking-tight text-[var(--pf-text-brand)] sm:text-[1.75rem]">
                <span dir="ltr">{t('entry.brand')}</span>
              </p>
              <h1
                id="demo-entry-heading"
                className="text-[1.85rem] font-bold leading-tight tracking-tight text-[var(--pf-text-primary)] sm:text-4xl"
              >
                {t('entry.title')}
              </h1>
              <p className="mt-4 max-w-[36em] text-base leading-relaxed text-[var(--pf-text-secondary)] sm:text-lg">
                {t('entry.subtitle')}
              </p>

              {demoError ? (
                <div
                  role="alert"
                  className="mt-6 min-w-0 max-w-xl rounded-md border border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] px-4 py-3 text-sm text-[var(--pf-status-danger-fg)]"
                >
                  {t(`errors.${demoError}`)}
                </div>
              ) : null}

              <form action={action} className="mt-8 flex min-w-0 flex-col gap-6">
                <DemoEntryChoices
                  businessKeys={businessKeys}
                  profileKey={profileKey}
                  roleKey={roleKey}
                  onProfileKeyChange={setProfileKey}
                  onRoleKeyChange={setRoleKey}
                />
                <DemoEntrySubmit />
              </form>
            </div>
          </div>
        </section>
      </main>

      {footer}
    </div>
  );
}
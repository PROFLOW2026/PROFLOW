'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  applyDemoSessionChoicesAction,
  exitDemoAction,
} from '@/modules/demo/application/session-controls';
import type { DemoRoleKey } from '@/modules/demo/domain/demo-org';
import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';

type BusinessOption = { readonly key: OnboardingBusinessType; readonly label: string };
type RoleChoice = { readonly key: DemoRoleKey; readonly label: string };

function ApplyButton({
  label,
  applyingLabel,
  locked,
}: {
  label: string;
  applyingLabel: string;
  locked: boolean;
}) {
  const { pending } = useFormStatus();
  const showPending = pending || locked;
  return (
    <button
      type="submit"
      disabled={showPending}
      aria-busy={showPending}
      className="h-9 shrink-0 whitespace-nowrap rounded border border-amber-900/50 bg-white/80 px-2 text-[11px] font-semibold text-amber-950 disabled:opacity-60 sm:text-xs"
    >
      {showPending ? applyingLabel : label}
    </button>
  );
}

export function DemoSessionBar({
  profileKey,
  roleKey,
  businessOptions,
  roleChoices,
}: {
  profileKey: OnboardingBusinessType;
  roleKey: DemoRoleKey;
  businessOptions: readonly BusinessOption[];
  roleChoices: readonly RoleChoice[];
}) {
  const t = useTranslations('demo');
  const [profile, setProfile] = useState(profileKey);
  const [role, setRole] = useState(roleKey);
  const [applying, setApplying] = useState(false);
  const unchanged = profile === profileKey && role === roleKey;
  const selectClass =
    'h-9 min-w-0 flex-1 truncate rounded border border-amber-900/30 bg-white px-1 text-[11px] text-amber-950 sm:text-xs';

  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-1" aria-busy={applying}>
      <form
        action={applyDemoSessionChoicesAction}
        className="contents"
        onSubmit={(event) => {
          if (unchanged) {
            event.preventDefault();
            return;
          }
          setApplying(true);
        }}
      >
        <input type="hidden" name="profileKey" value={profile} />
        <input type="hidden" name="roleKey" value={role} />
        <label className="sr-only" htmlFor="demo-business-switch">
          {t('session.businessLabel')}
        </label>
        <select
          id="demo-business-switch"
          value={profile}
          onChange={(event) => setProfile(event.target.value as OnboardingBusinessType)}
          className={selectClass}
        >
          {businessOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {t(`businesses.${option.key}`)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="demo-role-switch">
          {t('session.roleLabel')}
        </label>
        <select
          id="demo-role-switch"
          value={role}
          onChange={(event) => setRole(event.target.value as DemoRoleKey)}
          className={`${selectClass} max-w-[34%]`}
        >
          {roleChoices.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {t(`roles.${choice.key}`)}
            </option>
          ))}
        </select>
        <ApplyButton
          label={t('session.apply')}
          applyingLabel={t('session.applying')}
          locked={applying || unchanged}
        />
      </form>
      <form action={exitDemoAction} className="contents">
        <button
          type="submit"
          aria-label={t('session.exitAria')}
          className="h-9 shrink-0 whitespace-nowrap rounded border border-amber-950/70 bg-amber-50 px-2 text-[11px] font-semibold text-amber-950 sm:text-xs"
        >
          {t('session.exit')}
        </button>
      </form>
    </div>
  );
}

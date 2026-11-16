'use client';

import { useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import {
  exitDemoAction,
  switchDemoBusinessProfileAction,
  switchDemoRoleInSessionAction,
} from '@/modules/demo/application/session-controls';
import type { DemoRoleKey } from '@/modules/demo/domain/demo-org';
import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';

type BusinessOption = { readonly key: OnboardingBusinessType; readonly label: string };
type RoleChoice = { readonly key: DemoRoleKey; readonly label: string };

function ApplyButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  const showPending = pending || disabled;
  return (
    <button
      type="submit"
      disabled={showPending}
      className="min-h-11 shrink-0 rounded border border-amber-900/50 bg-white/80 px-2 text-xs font-medium text-amber-950 disabled:opacity-60 sm:px-2.5"
    >
      {showPending ? '…' : label}
    </button>
  );
}

function DemoFormControls({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={busy || pending} className="contents" aria-busy={busy || pending}>
      {children}
    </fieldset>
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
  const [busy, setBusy] = useState(false);

  const selectClass =
    'min-h-11 max-w-[9.5rem] shrink rounded border border-amber-900/30 bg-white px-1.5 text-xs text-amber-950 sm:max-w-none sm:min-w-[7rem] sm:px-2';

  return (
    <div
      className="flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 sm:gap-2"
      aria-busy={busy}
    >
      <form
        action={switchDemoBusinessProfileAction}
        className="flex min-w-0 items-center gap-1"
        onSubmit={() => setBusy(true)}
      >
        <DemoFormControls busy={busy}>
          <label className="sr-only" htmlFor="demo-business-switch">
            סוג עסק
          </label>
          <select
            id="demo-business-switch"
            name="profileKey"
            defaultValue={profileKey}
            className={selectClass}
          >
            {businessOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <ApplyButton label="עסק" disabled={busy} />
        </DemoFormControls>
      </form>

      <form
        action={switchDemoRoleInSessionAction}
        className="flex min-w-0 items-center gap-1"
        onSubmit={() => setBusy(true)}
      >
        <DemoFormControls busy={busy}>
          <label className="sr-only" htmlFor="demo-role-switch">
            תפקיד
          </label>
          <select id="demo-role-switch" name="roleKey" defaultValue={roleKey} className={selectClass}>
            {roleChoices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
          <ApplyButton label="תפקיד" disabled={busy} />
        </DemoFormControls>
      </form>

      <form action={exitDemoAction} onSubmit={() => setBusy(true)}>
        <DemoFormControls busy={busy}>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded border border-amber-950/70 bg-amber-50 px-2.5 text-xs font-semibold text-amber-950 disabled:opacity-60 sm:text-sm"
          >
            יציאה מהדמו
          </button>
        </DemoFormControls>
      </form>
    </div>
  );
}
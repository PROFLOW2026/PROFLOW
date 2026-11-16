'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { DEMO_ROLE_CHOICES } from '@/modules/demo/domain/demo-roles';
import { LandingHeader } from '@/modules/marketing/ui/landing-header';
import { cn } from '@/shared/ui/cn';

export type DemoBusinessChoice = {
  key: string;
  label: string;
};

const choiceCardClass =
  'flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 py-2.5 text-sm font-medium text-[var(--pf-text-primary)] transition-colors has-[:checked]:border-[var(--pf-action-primary)] has-[:checked]:bg-[color-mix(in_srgb,var(--pf-action-primary)_6%,var(--pf-bg-page))] disabled:cursor-not-allowed disabled:opacity-60';

type DemoEntryScreenProps = {
  action: (formData: FormData) => Promise<void>;
  businessChoices: readonly DemoBusinessChoice[];
  footer: ReactNode;
};

function DemoEntrySubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      block
      className="min-h-11"
      loading={pending}
      disabled={pending}
      aria-live="polite"
    >
      {pending ? 'נכנסים לדמו…' : 'כניסה לדמו'}
    </Button>
  );
}

function DemoEntryChoices({
  businessChoices,
}: {
  businessChoices: readonly DemoBusinessChoice[];
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={pending}>
        <legend className="mb-3 text-base font-bold text-[var(--pf-text-primary)]">סוג העסק</legend>
        <p className="mb-4 text-sm leading-relaxed text-[var(--pf-text-secondary)]">
          בחרו את סוג הפעילות — המערכת תטעין סביבת הדגמה מותאמת עם נתונים לדוגמה.
        </p>
        <div
          className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          data-pf-demo-business-choices
        >
          {businessChoices.map((choice, index) => (
            <label key={choice.key} className={cn(choiceCardClass, 'justify-start')}>
              <input
                type="radio"
                name="profileKey"
                value={choice.key}
                required
                defaultChecked={index === 0}
                className="size-4 shrink-0 accent-[var(--pf-action-primary)]"
              />
              <span className="min-w-0 text-pretty">{choice.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={pending}>
        <legend className="mb-3 text-base font-bold text-[var(--pf-text-primary)]">תפקיד בהדגמה</legend>
        <p className="mb-4 text-sm leading-relaxed text-[var(--pf-text-secondary)]">
          כל תפקיד מציג הרשאות ומסכים שונים — אפשר להחליף תפקיד גם אחרי הכניסה.
        </p>
        <div
          className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          data-pf-demo-role-choices
        >
          {DEMO_ROLE_CHOICES.map((choice, index) => (
            <label key={choice.key} className={cn(choiceCardClass, 'justify-start')}>
              <input
                type="radio"
                name="roleKey"
                value={choice.key}
                required
                defaultChecked={index === 0}
                className="size-4 shrink-0 accent-[var(--pf-action-primary)]"
              />
              <span className="min-w-0 text-pretty">{choice.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * Public demo entry — marketing shell, business profile + role selection.
 */
export function DemoEntryScreen({ action, businessChoices, footer }: DemoEntryScreenProps) {
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
                <span dir="ltr">ProjectFlow</span>
              </p>
              <h1
                id="demo-entry-heading"
                className="text-[1.85rem] font-bold leading-tight tracking-tight text-[var(--pf-text-primary)] sm:text-4xl"
              >
                הדגמה חיה
              </h1>
              <p className="mt-4 max-w-[36em] text-base leading-relaxed text-[var(--pf-text-secondary)] sm:text-lg">
                בחרו סוג עסק ותפקיד כדי לחקור את המערכת עם נתונים לדוגמה בסביבה בטוחה.
              </p>

              <form action={action} className="mt-8 flex min-w-0 flex-col gap-6">
                <DemoEntryChoices businessChoices={businessChoices} />
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
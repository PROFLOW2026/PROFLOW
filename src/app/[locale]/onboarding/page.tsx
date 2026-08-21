import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { getSessionState } from '@/shared/auth/session';
import { OnboardingForm } from './onboarding-form';

/** Session-dependent: there is nothing here that can be prerendered. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.onboarding' });
  return { title: t('title') };
}

/**
 * The first-run setup step: business identity + Dynamic Experience questions.
 * Account creation stays on the signup form; this page only runs after auth.
 */
export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionState();
  if (session.status === 'unconfigured') redirect({ href: '/setup', locale });
  if (session.status === 'anonymous') redirect({ href: '/sign-in', locale });
  // Configured tenants (any membership) never re-enter first-run onboarding.
  if (session.status === 'authenticated' && session.memberships.length > 0) {
    redirect({ href: '/', locale });
  }

  const t = await getTranslations('auth.onboarding');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-start sm:py-10">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      <div className="mt-6 w-full min-w-0 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 sm:p-5">
        <OnboardingForm />
      </div>

      <p className="mt-4 text-xs text-[var(--pf-text-muted)]">{t('joinExisting')}</p>
    </div>
  );
}

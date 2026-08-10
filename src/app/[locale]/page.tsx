import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/shell/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { PublicHomepage } from '@/modules/marketing/ui';
import { getHomeDashboard, parseWorkKindFilter } from '@/modules/financials';
import { HomeDashboardContent } from '@/modules/financials/ui';
import { WorkKindFilterChrome } from '@/modules/financials/ui/work-kind-filter-chrome';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';
import { getSessionState, getShellContext, withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { DashboardSkeleton } from './(app)/(home)/dashboard-skeleton';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const session = await getSessionState();

  if (session.status === 'authenticated' && session.activeOrganizationId) {
    const t = await getTranslations({ locale, namespace: 'dashboard' });
    return { title: t('title') };
  }

  const t = await getTranslations({ locale, namespace: 'marketing' });
  const title = t('meta.title');
  const description = t('meta.description');
  const ogTitle = t('meta.ogTitle');
  const ogDescription = t('meta.ogDescription');
  const canonicalPath = locale === 'en' ? '/en' : '/he-IL';

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      locale: locale === 'en' ? 'en_US' : 'he_IL',
      type: 'website',
      url: canonicalPath,
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
    },
    robots: { index: true, follow: true },
  };
}

/**
 * Locale root (`/he-IL`, `/en`) — outside the `(app)` route group.
 *
 * Signed-out → public homepage (no AppShell; no access to product routes).
 * Signed-in with org → AppShell + Dashboard.
 * Signed-in without org → onboarding.
 * Unconfigured → setup.
 *
 * Product routes under `(app)` always use AppShell, which rejects anonymous
 * users — avoiding auth holes from an anonymous layout pass-through.
 */
export default async function LocaleRootPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ workKind?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const session = await getSessionState();

  if (session.status === 'unconfigured') {
    redirect({ href: '/setup', locale });
  }

  if (session.status === 'anonymous') {
    return <PublicHomepage />;
  }

  if (!session.activeOrganizationId) {
    redirect({ href: '/onboarding', locale });
  }

  return (
    <AppShell>
      <AuthenticatedDashboardHome workKind={query.workKind} />
    </AppShell>
  );
}

async function AuthenticatedDashboardHome({ workKind }: { workKind?: string }) {
  const [t, tCommon, shell] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('common'),
    getShellContext(),
  ]);
  const name = shell?.user.displayName;
  const workKindFilter = parseWorkKindFilter(workKind);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" data-pf-dashboard-home>
      <PageHeader title={name ? t('greeting', { name }) : t('greetingNoName')} />
      <PwaInstallCta variant="dashboard" />
      <WorkKindFilterChrome active={workKindFilter} pathname="/" />
      <Suspense
        fallback={<DashboardSkeleton showTitle={false} label={tCommon('states.loading')} />}
      >
        <HomeDashboardSection workKindFilter={workKindFilter} />
      </Suspense>
    </div>
  );
}

async function HomeDashboardSection({
  workKindFilter,
}: {
  workKindFilter: string;
}) {
  const data = await withOrgContext((context) =>
    getHomeDashboard(context, { workKindFilter }),
  );
  return <HomeDashboardContent data={data} />;
}

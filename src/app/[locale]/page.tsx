import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/shell/app-shell';
import { UnusedCapabilityDashboardTip } from '@/components/shell/unused-capability-dashboard-tip';
import { PageHeader } from '@/components/ui/page-header';
import { PublicHomepage } from '@/modules/marketing/ui';
import { getHomeDashboard, parseWorkKindFilter } from '@/modules/financials';
import { HomeDashboardContent } from '@/modules/financials/ui';
import { WorkKindFilterChrome } from '@/modules/financials/ui/work-kind-filter-chrome';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';
import {
  getUnusedCapabilityDismissals,
  isOptionalModuleKey,
  suggestUnusedCapabilities,
  type OptionalModuleKey,
} from '@/modules/tenancy';
import { getSessionState, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { redirect } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { DashboardSkeleton } from './(app)/(home)/dashboard-skeleton';
import { listModulePreferencesForOrg } from './(app)/settings/_lib/module-preferences';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Do not await the session here - it serializes first HTML (PWA splash)
  // behind Auth. `/[locale]` is the public homepage URL; signed-in title
  // is set by the dashboard heading itself.
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
 * Locale root (`/he-IL`, `/en`) - outside the `(app)` route group.
 *
 * Signed-out → public homepage (no AppShell; no access to product routes).
 * Signed-in with org → AppShell + Dashboard.
 * Signed-in without org → onboarding.
 * Unconfigured → setup.
 *
 * Product routes under `(app)` always use AppShell, which rejects anonymous
 * users - avoiding auth holes from an anonymous layout pass-through.
 */
export default async function LocaleRootPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ workKind?: string; month?: string }>;
}) {
  const [{ locale }, query, session] = await Promise.all([
    params,
    searchParams,
    getSessionState(),
  ]);
  setRequestLocale(locale);

  if (session.status === 'unconfigured') {
    redirect({ href: '/setup', locale });
  }

  if (session.status === 'anonymous') {
    return (
      <WithClientMessages extra={['marketing']}>
        <PublicHomepage />
      </WithClientMessages>
    );
  }

  if (!session.activeOrganizationId) {
    redirect({ href: '/onboarding', locale });
  }

  // Suspense around the dashboard body so AppShell (nav) can stream first paint
  // without waiting for org financial rollup — PWA splash dismisses on shell paint.
  const tCommon = await getTranslations('common');
  return (
    <AppShell>
      <Suspense
        fallback={<DashboardSkeleton showTitle label={tCommon('states.loading')} />}
      >
        <AuthenticatedDashboardHome
          workKind={query.workKind}
          month={query.month}
          displayName={session.user.displayName}
        />
      </Suspense>
    </AppShell>
  );
}

async function AuthenticatedDashboardHome({
  workKind,
  month,
  displayName,
}: {
  workKind?: string;
  month?: string;
  displayName: string | null;
}) {
  const [t, tCommon] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('common'),
  ]);
  const name = displayName;
  const workKindFilter = parseWorkKindFilter(workKind);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" data-pf-dashboard-home>
      <PageHeader title={name ? t('greeting', { name }) : t('greetingNoName')} />
      <Suspense fallback={null}>
        <DashboardCapabilityTip />
      </Suspense>
      <PwaInstallCta variant="dashboard" />
      <WorkKindFilterChrome active={workKindFilter} pathname="/" />
      <Suspense
        fallback={<DashboardSkeleton showTitle={false} label={tCommon('states.loading')} />}
      >
        <HomeDashboardSection workKindFilter={workKindFilter} selectedMonth={month} />
      </Suspense>
    </div>
  );
}

async function DashboardCapabilityTip() {
  const tip = await withOrgContext(async (context) => {
    if (!context.permissions.has(PERMISSIONS.SETTINGS_MANAGE)) {
      return null as OptionalModuleKey | null;
    }
    const [preferences, dismissals] = await Promise.all([
      listModulePreferencesForOrg(context),
      getUnusedCapabilityDismissals(context),
    ]);
    const suggestions = suggestUnusedCapabilities(preferences, {
      dismissedKeys: dismissals,
    });
    const key = suggestions[0];
    return key && isOptionalModuleKey(key) ? key : null;
  }).catch(() => null);

  if (!tip) return null;
  return (
    <WithClientMessages extra={['settings']}>
      <UnusedCapabilityDashboardTip moduleKey={tip} canEdit />
    </WithClientMessages>
  );
}

async function HomeDashboardSection({
  workKindFilter,
  selectedMonth,
}: {
  workKindFilter: string;
  selectedMonth?: string;
}) {
  const data = await withOrgContext((context) =>
    getHomeDashboard(context, { workKindFilter, selectedMonth }),
  );
  return <HomeDashboardContent data={data} />;
}

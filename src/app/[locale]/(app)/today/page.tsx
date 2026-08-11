import type { Metadata } from 'next';
import { Inbox } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getTodayInbox } from '@/modules/command-center';
import { TodayInboxPanel } from '@/modules/command-center/ui/today-inbox';
import { getModuleVisibility } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { DomainRuleError } from '@/shared/errors';
import { Link, redirect } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'commandCenter' });
  return { title: t('title') };
}

export default async function TodayPage() {
  const t = await getTranslations('commandCenter');
  const locale = await getLocale();

  const result = await withOrgContext(async (context) => {
    const canRead = hasPermission(context, PERMISSIONS.COMMAND_CENTER_READ);
    if (!canRead) {
      return { kind: 'forbidden' as const };
    }

    const modules = await getModuleVisibility(context);
    if (!modules.command_center) {
      return { kind: 'module_off' as const };
    }

    try {
      const inbox = await getTodayInbox(context);
      return { kind: 'ok' as const, inbox };
    } catch (error) {
      if (error instanceof DomainRuleError) {
        return { kind: 'module_off' as const };
      }
      throw error;
    }
  });

  if (result.kind === 'forbidden') {
    redirect({ href: '/', locale });
  }

  if (result.kind === 'module_off') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <EmptyState
          icon={Inbox}
          title={t('moduleOff.title')}
          description={t('moduleOff.body')}
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/features">{t('moduleOff.action')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('summary', { count: result.inbox.totalActive })}
      </p>
      <TodayInboxPanel inbox={result.inbox} />
    </div>
  );
}

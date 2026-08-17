import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listCommunications } from '@/modules/communications';
import { getEmailPort } from '@/shared/ports/email';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'communications' });
  return { title: t('title') };
}

export default async function CommunicationsPage() {
  const t = await getTranslations('communications');
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.COMMUNICATIONS_READ)) {
    return <EmptyState icon={Mail} title={t('notAllowed.title')} description={t('notAllowed.body')} />;
  }

  const canManage = shell.permissions.has(PERMISSIONS.COMMUNICATIONS_MANAGE);
  const configured = getEmailPort().configured;
  const rows = await withOrgContext(async (context) => {
    try {
      return await listCommunications(context, { limit: 80 });
    } catch {
      return [];
    }
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link href="/communications/new">{t('new')}</Link>
            </Button>
          ) : null
        }
      />
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {configured ? t('provider.configured') : t('provider.notConfigured')}
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={Mail} title={t('empty.title')} description={t('empty.body')} />
      ) : (
        <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/communications/${row.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-[var(--pf-bg-muted)]"
              >
                <span className="font-medium">{row.subject}</span>
                <span className="text-sm text-[var(--pf-text-secondary)]">
                  {row.recipientEmail} · {t(`status.${row.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

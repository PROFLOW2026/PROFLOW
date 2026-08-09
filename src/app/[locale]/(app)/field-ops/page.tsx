import { HardHat } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/shared/i18n/navigation';
import { FieldOpsSectionNav } from './field-ops-section-nav';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('title') };
}

export default async function FieldOpsIndexPage() {
  const t = await getTranslations('fieldOps');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <FieldOpsSectionNav active="logs" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/field-ops/logs"
          className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 hover:border-[var(--pf-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          <HardHat className="mb-2 size-5 text-[var(--pf-text-secondary)]" aria-hidden />
          <h2 className="font-semibold">{t('nav.logs')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('empty.logs.body')}</p>
        </Link>
        <Link
          href="/field-ops/punch"
          className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 hover:border-[var(--pf-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          <h2 className="font-semibold">{t('nav.punch')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('empty.punch.body')}</p>
        </Link>
        <Link
          href="/field-ops/inspections"
          className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 hover:border-[var(--pf-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          <h2 className="font-semibold">{t('nav.inspections')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('empty.inspections.body')}</p>
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/field-ops/logs/new">{t('newLog')}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/field-ops/punch/new">{t('newPunch')}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/field-ops/inspections/new">{t('newInspection')}</Link>
        </Button>
      </div>
    </div>
  );
}

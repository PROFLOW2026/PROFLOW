import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import {
  assertCanAccessImports,
  listImportableKinds,
} from '@/modules/imports';
import { ImportWizard } from '@/modules/imports/ui/import-wizard';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'imports' });
  return { title: t('title') };
}

export default async function ImportsPage() {
  const t = await getTranslations('imports');

  const data = await withOrgContext(async (context) => {
    try {
      assertCanAccessImports(context);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return { allowed: false as const, kinds: [] as const };
      }
      throw error;
    }
    return { allowed: true as const, kinds: listImportableKinds(context) };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {!data.allowed ? (
        <Alert tone="warning">{t('notAllowed')}</Alert>
      ) : (
        <ImportWizard allowedKinds={data.kinds} />
      )}
    </div>
  );
}

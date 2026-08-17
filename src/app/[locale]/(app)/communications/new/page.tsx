import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Mail } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getEmailPort } from '@/shared/ports/email';
import { getShellContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { CommunicationComposeForm } from '../compose-form';
import type { CommunicationEntityType } from '@/modules/communications/domain/types';
import { COMMUNICATION_ENTITY_TYPES } from '@/modules/communications/domain/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'communications' });
  return { title: t('new') };
}

function asEntityType(value: string | undefined): CommunicationEntityType {
  if (value && (COMMUNICATION_ENTITY_TYPES as readonly string[]).includes(value)) {
    return value as CommunicationEntityType;
  }
  return 'other';
}

export default async function NewCommunicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('communications');
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.COMMUNICATIONS_MANAGE)) {
    return <EmptyState icon={Mail} title={t('notAllowed.title')} description={t('notAllowed.body')} />;
  }
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        title={t('new')}
        description={t('description')}
        breadcrumb={
          <Link href="/communications" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />
      <CommunicationComposeForm
        emailConfigured={getEmailPort().configured}
        defaults={{
          relatedEntityType: asEntityType(one('entityType')),
          relatedEntityId: one('entityId'),
          projectId: one('projectId'),
          clientId: one('clientId'),
          vendorId: one('vendorId'),
          recipientEmail: one('to'),
          subject: one('subject'),
        }}
      />
    </div>
  );
}

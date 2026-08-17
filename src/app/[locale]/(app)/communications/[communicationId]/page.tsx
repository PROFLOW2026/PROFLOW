import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getCommunication } from '@/modules/communications';
import { getEmailPort } from '@/shared/ports/email';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { CommunicationComposeForm } from '../compose-form';
import { cancelAction, retryAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'communications' });
  return { title: t('title') };
}

export default async function CommunicationDetailPage({
  params,
}: {
  params: Promise<{ communicationId: string }>;
}) {
  const { communicationId } = await params;
  const t = await getTranslations('communications');
  const data = await withOrgContext(async (context) => {
    try {
      return {
        detail: await getCommunication(context, communicationId),
        canManage: hasPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE),
      };
    } catch {
      return null;
    }
  });
  if (!data) notFound();
  const { detail, canManage } = data;
  const configured = getEmailPort().configured;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader
        title={detail.subject}
        description={detail.recipientEmail}
        breadcrumb={
          <Link href="/communications" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        meta={<StatusBadge shape={detail.status === 'sent' ? 'completed' : 'pending'} label={t(`status.${detail.status}`)} />}
      />
      {detail.status !== 'sent' ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('provider.notSent')}</p>
      ) : null}

      {canManage && detail.status !== 'sent' && detail.status !== 'cancelled' ? (
        <CommunicationComposeForm
          emailConfigured={configured}
          defaults={{
            communicationId: detail.id,
            recipientEmail: detail.recipientEmail,
            recipientName: detail.recipientName ?? undefined,
            subject: detail.subject,
            bodyText: detail.bodyText,
            relatedEntityType: detail.relatedEntityType,
            relatedEntityId: detail.relatedEntityId ?? undefined,
            projectId: detail.projectId ?? undefined,
            clientId: detail.clientId ?? undefined,
            vendorId: detail.vendorId ?? undefined,
          }}
        />
      ) : (
        <pre className="whitespace-pre-wrap rounded-md border border-[var(--pf-border-default)] p-4 text-sm">
          {detail.bodyText}
        </pre>
      )}

      {canManage && (detail.status === 'failed' || detail.status === 'draft') ? (
        <form
          action={async () => {
            'use server';
            await retryAction(detail.id);
          }}
        >
          <Button type="submit" variant="secondary" size="sm">
            {t('actions.retry')}
          </Button>
        </form>
      ) : null}
      {canManage && detail.status !== 'sent' && detail.status !== 'cancelled' ? (
        <form
          action={async () => {
            'use server';
            await cancelAction(detail.id);
          }}
        >
          <Button type="submit" variant="ghost" size="sm">
            {t('actions.cancel')}
          </Button>
        </form>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('history.title')}</h2>
        {detail.attempts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('history.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {detail.attempts.map((attempt) => (
              <li key={attempt.id}>
                {t(`history.${attempt.result === 'not_configured' ? 'notConfigured' : attempt.result}`)}
                {attempt.errorMessage ? ` — ${attempt.errorMessage}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

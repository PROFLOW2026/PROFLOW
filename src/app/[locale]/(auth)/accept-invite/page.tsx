import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getInvitationPreview } from '@/modules/tenancy';
import { getSessionState } from '@/shared/auth/session';
import { getAdminDb, isDatabaseConfigured } from '@/shared/db/client';
import { Link } from '@/shared/i18n/navigation';
import { AcceptInviteForm } from './accept-invite-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('organization.invitations');
  return { title: t('title') };
}

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const { token } = await searchParams;
  const t = await getTranslations('organization.invitations');
  const tAuth = await getTranslations('auth');

  const preview = isDatabaseConfigured() ? await getInvitationPreview(getAdminDb(), token ?? '') : null;

  // A spent, expired or unknown token all look the same on purpose: the page
  // must not become a way to probe which invitations exist.
  if (!preview) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('acceptInvalidTitle')}</h1>
          <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('acceptInvalidBody')}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/sign-in">{tAuth('signIn.submit')}</Link>
        </Button>
      </div>
    );
  }

  const session = await getSessionState();
  const signedInEmail = session.status === 'authenticated' ? session.user.email : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">
          {t('acceptTitle', { organization: preview.organizationName })}
        </h1>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
          {t('acceptBody', { organization: preview.organizationName })}
        </p>
      </div>

      {signedInEmail === null ? (
        <>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('acceptSignInPrompt', { email: preview.email })}
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href={{ pathname: '/sign-in', query: { next: inviteReturnPath(token) } }}>
                {tAuth('signIn.submit')}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={{ pathname: '/sign-up', query: { next: inviteReturnPath(token) } }}>
                {tAuth('signUp.submit')}
              </Link>
            </Button>
          </div>
        </>
      ) : signedInEmail.toLowerCase() !== preview.email.toLowerCase() ? (
        <Alert tone="warning" title={t('acceptWrongAccountTitle')}>
          {t('acceptWrongAccount', { invited: preview.email, current: signedInEmail })}
        </Alert>
      ) : (
        <AcceptInviteForm token={token ?? ''} submitLabel={t('acceptSubmit')} />
      )}
    </div>
  );
}

function inviteReturnPath(token: string | undefined): string {
  return `/accept-invite?token=${encodeURIComponent(token ?? '')}`;
}

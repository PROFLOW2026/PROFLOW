import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from '@/shared/i18n/navigation';
import { ensureAgreementCloseoutAction, reportAgreementWarrantyAction } from './actions';

/** Contractor-scoped handover and warranty. Project-wide lists stay on their own routes. */
export async function AgreementHandoverPanel({
  projectId,
  agreementId,
  root,
  canManage,
}: {
  readonly projectId: string;
  readonly agreementId: string;
  readonly root: string;
  readonly canManage: boolean;
}) {
  const t = await getTranslations('handover');
  const actionLinkClass =
    'inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm font-semibold text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]';

  return (
    <section id="handover" className="flex scroll-mt-20 flex-col gap-3">
      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>{t('agreement.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('agreement.description')}</p>
          <div className="mt-auto flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link href={`${root}/contractor-closeout?agreementId=${agreementId}`} className={actionLinkClass}>
                {t('agreement.openCloseout')}
              </Link>
              <Link href={`${root}/contractor-warranty?agreementId=${agreementId}`} className={actionLinkClass}>
                {t('agreement.openWarranty')}
              </Link>
            </div>
            {canManage ? (
              <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
                <form action={ensureAgreementCloseoutAction} className="flex min-h-[7.5rem] flex-col justify-end gap-2">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="agreementId" value={agreementId} />
                  <Button type="submit" className="min-h-11 w-full">
                    {t('agreement.startCloseout')}
                  </Button>
                </form>
                <form action={reportAgreementWarrantyAction} className="flex min-h-[7.5rem] flex-col justify-end gap-2">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="agreementId" value={agreementId} />
                  <Input name="title" required maxLength={200} placeholder={t('agreement.warrantyTitle')} />
                  <Button type="submit" className="min-h-11 w-full">
                    {t('agreement.reportWarranty')}
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

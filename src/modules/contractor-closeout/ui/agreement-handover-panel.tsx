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
  return (
    <section id="handover" className="flex scroll-mt-20 flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>{t('agreement.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('agreement.description')}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${root}/contractor-closeout?agreementId=${agreementId}`}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
            >
              {t('agreement.openCloseout')}
            </Link>
            <Link
              href={`${root}/contractor-warranty?agreementId=${agreementId}`}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-action-subtle-hover)]"
            >
              {t('agreement.openWarranty')}
            </Link>
          </div>
          {canManage ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <form action={ensureAgreementCloseoutAction} className="flex flex-col gap-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="agreementId" value={agreementId} />
                <Button type="submit">{t('agreement.startCloseout')}</Button>
              </form>
              <form action={reportAgreementWarrantyAction} className="flex flex-col gap-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="agreementId" value={agreementId} />
                <Input name="title" required maxLength={200} placeholder={t('agreement.warrantyTitle')} />
                <Button type="submit">{t('agreement.reportWarranty')}</Button>
              </form>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

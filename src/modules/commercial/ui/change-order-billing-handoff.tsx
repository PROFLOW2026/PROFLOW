import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';

export interface ChangeOrderBillingHandoffProps {
  readonly projectId: string;
  readonly changeOrderId: string;
  readonly canManageBilling: boolean;
}

export async function ChangeOrderBillingHandoff({
  projectId,
  changeOrderId,
  canManageBilling,
}: ChangeOrderBillingHandoffProps) {
  const t = await getTranslations('changes.billingHandoff');

  return (
    <Alert tone="success">
      <p className="font-medium">{t('title')}</p>
      <p className="mt-1 text-sm">{t('body')}</p>
      {canManageBilling ? (
        <div className="mt-3 flex max-w-full flex-wrap gap-2">
          <Button asChild size="sm">
            <Link
              href={`/billing/new?projectId=${projectId}&changeOrderId=${changeOrderId}`}
            >
              {t('createBilling')}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/projects/${projectId}?tab=billingPlan`}>{t('billingPlan')}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/projects/${projectId}?tab=billing`}>{t('viewBilling')}</Link>
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('noPermission')}</p>
      )}
    </Alert>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { CreateBillingPlanDialog } from './create-billing-plan-dialog';

interface BillingPlanEmptyStateProps {
  readonly projectId: string;
  readonly contractId: string;
  readonly canManage: boolean;
  readonly simplified?: boolean;
  readonly orgTemplates: readonly { id: string; name: string }[];
}

/**
 * First screen when no billing plan exists — no auto-created rows.
 */
export function BillingPlanEmptyState({
  projectId,
  contractId,
  canManage,
  simplified = false,
  orgTemplates,
}: BillingPlanEmptyStateProps) {
  const t = useTranslations('billingPlan');

  if (!canManage) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.emptyBody')}</p>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col items-start gap-6 rounded-lg bg-[var(--pf-bg-muted)]/30 px-6 py-10"
      data-testid="billing-plan-empty-state"
    >
      <div className="min-w-0 text-start">
        <h3 className="text-base font-semibold">{t('empty.title')}</h3>
        <p className="mt-1 max-w-md text-sm text-[var(--pf-text-secondary)]">
          {t('empty.description')}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <CreateBillingPlanDialog
          projectId={projectId}
          contractId={contractId}
          triggerLabel={t('empty.createPlan')}
          simplified={simplified}
          orgTemplates={orgTemplates}
          initialMode="blank"
        />
        <CreateBillingPlanDialog
          projectId={projectId}
          contractId={contractId}
          triggerLabel={t('empty.fromTemplate')}
          triggerVariant="secondary"
          simplified={simplified}
          orgTemplates={orgTemplates}
          initialMode="template"
        />
        <Button type="button" variant="secondary" asChild>
          <Link href="/imports">{t('empty.importExcel')}</Link>
        </Button>
      </div>
    </div>
  );
}

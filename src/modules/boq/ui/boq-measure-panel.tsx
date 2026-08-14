import { ClipboardList } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { getFieldMeasureWorkspace } from '../application/get-field-measure-workspace';
import { BoqMeasureClient } from './boq-measure-client';

export interface BoqMeasurePanelProps {
  readonly projectId: string;
}

export async function BoqMeasurePanel({ projectId }: BoqMeasurePanelProps) {
  const t = await getTranslations('boq.measure');
  const tCommon = await getTranslations('common');

  const view = await withOrgContext(async (context) => {
    try {
      return await getFieldMeasureWorkspace(context, projectId);
    } catch (error) {
      if (error instanceof AuthorizationError) return { denied: true as const };
      if (error instanceof NotFoundError) return { missing: true as const };
      throw error;
    }
  });

  if ('missing' in view) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  if ('denied' in view) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={t('emptyTitle')}
        description={t('noSubmitPermission')}
      />
    );
  }

  const backHref =
    view.workKind === 'job' ? `/jobs/${projectId}` : `/projects/${projectId}?tab=boq`;

  return (
    <div className="flex min-w-0 flex-col gap-4 pt-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-start">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
        </div>
        <Link href={backHref} className={cn(textNavLinkClassName, 'text-sm')}>
          {view.workKind === 'job' ? tCommon('actions.back') : t('backToBoq')}
        </Link>
      </div>

      {!view.boq ? (
        <EmptyState icon={ClipboardList} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : null}

      {view.boq && view.boq.status !== 'active' ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('inactiveHint')}</p>
      ) : null}

      {view.boq && view.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : null}

      {view.boq && view.items.length > 0 ? (
        <BoqMeasureClient
          projectId={projectId}
          boqId={view.boq.id}
          items={view.items}
          defaultPeriodLabel={view.defaultPeriodLabel}
          canSubmit={view.canSubmit}
        />
      ) : null}

      {view.canApproveProgress ? (
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('officeApproveHint')}{' '}
          <Button asChild variant="link" size="sm" className="h-auto min-h-11 px-0">
            <Link href={`/projects/${projectId}?tab=boq`}>{t('officeApproveLink')}</Link>
          </Button>
        </p>
      ) : null}
    </div>
  );
}

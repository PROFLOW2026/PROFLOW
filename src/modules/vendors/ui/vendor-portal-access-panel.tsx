'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import type { VendorContractorAccessPanel } from '@/modules/contractor-access';
import {
  ContractorAccessManager,
  type ContractorAccessActions,
} from '@/modules/contractor-access/ui/contractor-access-manager';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export function VendorPortalAccessPanel({
  panels,
  organizationName,
  actions,
}: {
  readonly panels: readonly VendorContractorAccessPanel[];
  readonly organizationName: string;
  readonly actions: ContractorAccessActions;
}) {
  const t = useTranslations('vendors.detail.portalAccess');

  if (panels.length === 0) {
    return (
      <Alert tone="info">
        <p className="text-sm">{t('empty')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('emptyHint')}</p>
      </Alert>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
      {panels.map((panel) => (
        <details
          key={panel.projectId}
          className="group rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
          open={panels.length === 1 || undefined}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[var(--pf-text-primary)]">
                {panel.projectName}
              </span>
              <span className="block text-xs text-[var(--pf-text-muted)]">
                {t('accountsCount', { count: panel.overview.accounts.length })}
              </span>
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] px-4 py-4">
            <Link
              href={`/projects/${panel.projectId}/contractor-access`}
              prefetch={false}
              className={cn(textNavLinkClassName, 'inline-flex items-center gap-1.5 self-start text-sm font-medium')}
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {t('openFullPage')}
            </Link>
            <ContractorAccessManager
              projectId={panel.projectId}
              overview={panel.overview}
              organizationName={organizationName}
              actions={actions}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

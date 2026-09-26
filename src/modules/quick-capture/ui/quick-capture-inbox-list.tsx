'use client';

import { FileText, Film, ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { pressableClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { CaptureInboxItem } from '../application/list-inbox';

function statusShape(
  status: CaptureInboxItem['status'],
): 'pending' | 'onHold' | 'completed' | 'rejected' {
  if (status === 'ready_for_review') return 'onHold';
  if (status === 'failed') return 'rejected';
  if (status === 'processing') return 'pending';
  return 'pending';
}

function statusLabelKey(status: CaptureInboxItem['status']): string {
  if (status === 'ready_for_review') return 'inbox.statusReady';
  if (status === 'failed') return 'inbox.statusFailed';
  return 'inbox.statusProcessing';
}

export function QuickCaptureInboxList({
  items,
}: {
  readonly items: readonly CaptureInboxItem[];
}) {
  const t = useTranslations('quickCapture');

  if (items.length === 0) {
    return <EmptyState title={t('inbox.empty')} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/quick-capture/${item.id}`}
            className={cn(
              pressableClassName,
              'flex min-h-11 items-center justify-between gap-3 rounded-md border border-[var(--pf-border-default)] px-3 py-2',
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <SessionIcon sessionKind={item.sessionKind} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.ownerNote?.trim() || t(`inbox.kind.${item.sessionKind}`)}
                </p>
                <p className="text-xs text-[var(--pf-text-muted)]">
                  {item.documentCount > 1 && item.sessionKind === 'images'
                    ? t('inbox.photoCount', { count: item.documentCount })
                    : null}
                  {item.sessionKind === 'video' ? t('inbox.videoBadge') : null}
                </p>
              </div>
            </div>
            <StatusBadge
              shape={statusShape(item.status)}
              label={t(statusLabelKey(item.status) as 'inbox.statusReady')}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SessionIcon({ sessionKind }: { readonly sessionKind: CaptureInboxItem['sessionKind'] }) {
  if (sessionKind === 'video') return <Film aria-hidden className="shrink-0" />;
  if (sessionKind === 'pdf' || sessionKind === 'file') {
    return <FileText aria-hidden className="shrink-0" />;
  }
  return <ImageIcon aria-hidden className="shrink-0" />;
}

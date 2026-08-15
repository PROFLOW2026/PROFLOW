'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { globalSearchAction } from '@/modules/search/application/search-actions';
import type { GlobalSearchGroup, GlobalSearchHit, SearchCommandHit } from '@/modules/search/domain/types';
import { cn } from '@/shared/ui/cn';

function formatHitMeta(hit: GlobalSearchHit): string | null {
  const parts = [hit.contextLabel, hit.status, hit.date, hit.amount && hit.currency ? `${hit.amount} ${hit.currency}` : hit.amount]
    .filter(Boolean);
  if (parts.length === 0) return hit.subtitle;
  return parts.join(' · ');
}

/**
 * Permission-safe org search + lightweight commands.
 * Mobile bottom-sheet dialog; desktop centered.
 */
export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [groups, setGroups] = React.useState<GlobalSearchGroup[]>([]);
  const [commands, setCommands] = React.useState<SearchCommandHit[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const canSearch = open && trimmed.length >= 2;
  const displayCommands = canSearch ? commands : [];
  const displayGroups = canSearch ? groups : [];
  const flatHits = displayGroups.flatMap((group) => group.hits);
  const rows: Array<{ type: 'command'; href: string } | { type: 'hit'; href: string }> = [
    ...displayCommands.map((command) => ({ type: 'command' as const, href: command.href })),
    ...flatHits.map((hit) => ({ type: 'hit' as const, href: hit.href })),
  ];
  const groupHitOffsets = displayGroups.map((_, groupIndex) =>
    displayCommands.length +
    displayGroups.slice(0, groupIndex).reduce((sum, group) => sum + group.hits.length, 0),
  );

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (!canSearch) return;

    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        setPending(true);
        try {
          const result = await globalSearchAction(trimmed);
          if (cancelled) return;
          setGroups([...result.groups]);
          setCommands([...result.commands]);
          setActiveIndex(0);
          setError(null);
        } catch {
          if (cancelled) return;
          setGroups([]);
          setCommands([]);
          setError(t('error'));
        } finally {
          if (!cancelled) setPending(false);
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [canSearch, trimmed, t]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery('');
      setGroups([]);
      setCommands([]);
      setError(null);
      setPending(false);
      setActiveIndex(0);
    }
    onOpenChange(next);
  }

  function navigate(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      const row = rows[activeIndex];
      if (row) {
        event.preventDefault();
        navigate(row.href);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        closeLabel={tCommon('actions.close')}
        mobileSheet
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('placeholder')}
            aria-label={t('title')}
            autoComplete="off"
          />
          {trimmed.length > 0 && trimmed.length < 2 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('minChars')}</p>
          ) : null}
          {pending ? <p className="text-sm text-[var(--pf-text-muted)]">{t('searching')}</p> : null}
          {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
          {!pending && !error && trimmed.length >= 2 && rows.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
          ) : null}

          {displayCommands.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
                {t('commands.title')}
              </p>
              <ul className="flex flex-col gap-1" role="listbox" aria-label={t('commands.title')}>
                {displayCommands.map((command, commandIndex) => (
                    <li key={command.id}>
                      <button
                        type="button"
                        className={cn(
                          pressableChromeClassName,
                          'flex w-full min-h-11 flex-col items-start rounded-md px-3 py-2 text-start',
                          commandIndex === activeIndex
                            ? 'bg-[var(--pf-bg-muted)]'
                            : 'hover:bg-[var(--pf-bg-muted)]',
                        )}
                        onClick={() => navigate(command.href)}
                      >
                        <span className="text-sm font-medium text-[var(--pf-text-primary)]">
                          {t(command.titleKey)}
                        </span>
                      </button>
                    </li>
                ))}
              </ul>
            </div>
          ) : null}

          {displayGroups.map((group, groupIndex) => (
            <div key={group.kind}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
                {t(`kinds.${group.kind}`)}
              </p>
              <ul className="flex flex-col gap-1" role="listbox" aria-label={t(`kinds.${group.kind}`)}>
                {group.hits.map((hit, hitIndex) => {
                  const index = (groupHitOffsets[groupIndex] ?? displayCommands.length) + hitIndex;
                  const meta = formatHitMeta(hit);
                  return (
                    <li key={`${hit.kind}:${hit.id}`}>
                      <button
                        type="button"
                        className={cn(
                          pressableChromeClassName,
                          'flex w-full min-h-11 flex-col items-start rounded-md px-3 py-2 text-start',
                          index === activeIndex
                            ? 'bg-[var(--pf-bg-muted)]'
                            : 'hover:bg-[var(--pf-bg-muted)]',
                        )}
                        onClick={() => navigate(hit.href)}
                      >
                        <span className="text-sm font-medium text-[var(--pf-text-primary)]">{hit.title}</span>
                        {meta ? (
                          <span className="text-xs text-[var(--pf-text-secondary)]">{meta}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function GlobalSearchTrigger() {
  const t = useTranslations('search');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className={cn(
          pressableChromeClassName,
          'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2',
          'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
          'active:bg-[var(--pf-action-subtle-active)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
          'sm:min-w-0 sm:px-3',
        )}
        aria-label={t('open')}
        onClick={() => setOpen(true)}
      >
        <Search className="size-4.5" aria-hidden />
        <span className="hidden text-sm sm:inline">{t('open')}</span>
        <kbd className="ms-1 hidden rounded border border-[var(--pf-border-default)] px-1.5 py-0.5 text-[0.65rem] text-[var(--pf-text-muted)] md:inline">
          ⌘K
        </kbd>
      </button>
      {open ? <GlobalSearchDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

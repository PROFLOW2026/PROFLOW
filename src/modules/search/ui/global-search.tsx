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
import type { GlobalSearchHit } from '@/modules/search/domain/types';
import { cn } from '@/shared/ui/cn';

/**
 * Permission-safe org search. Mobile bottom-sheet dialog; desktop centered.
 * Lazy-mounted from the shell so ordinary screens do not pay for Dialog until open.
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
  const [hits, setHits] = React.useState<GlobalSearchHit[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const canSearch = open && trimmed.length >= 2;
  const displayHits = trimmed.length < 2 ? [] : hits;

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
          setHits([...result.hits]);
          setError(null);
        } catch {
          if (cancelled) return;
          setHits([]);
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
      setHits([]);
      setError(null);
      setPending(false);
    }
    onOpenChange(next);
  }

  function navigate(href: string) {
    handleOpenChange(false);
    router.push(href);
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
            placeholder={t('placeholder')}
            aria-label={t('title')}
            autoComplete="off"
          />
          {trimmed.length > 0 && trimmed.length < 2 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('minChars')}</p>
          ) : null}
          {pending ? <p className="text-sm text-[var(--pf-text-muted)]">{t('searching')}</p> : null}
          {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
          {!pending && !error && trimmed.length >= 2 && displayHits.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
          ) : null}
          <ul className="flex flex-col gap-1" role="listbox" aria-label={t('results')}>
            {displayHits.map((hit) => (
              <li key={`${hit.kind}:${hit.id}`}>
                <button
                  type="button"
                  className={cn(
                    pressableChromeClassName,
                    'flex w-full min-h-11 flex-col items-start rounded-md px-3 py-2 text-start',
                    'hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
                  )}
                  onClick={() => navigate(hit.href)}
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-muted)]">
                    {t(`kinds.${hit.kind}`)}
                  </span>
                  <span className="text-sm font-medium text-[var(--pf-text-primary)]">{hit.title}</span>
                  {hit.subtitle ? (
                    <span className="text-xs text-[var(--pf-text-secondary)]">{hit.subtitle}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
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

'use client';

import { CalendarSync, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppSection } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  getCalendarFeedStatusAction,
  revokeCalendarFeedAction,
  rotateCalendarFeedAction,
} from '../actions';

export function CalendarFeedPanel({ appOrigin }: { appOrigin: string }) {
  const t = useTranslations('settings.profile.calendarFeed');
  const [hasActiveToken, setHasActiveToken] = useState(false);
  const [lastAccessedAt, setLastAccessedAt] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const status = await getCalendarFeedStatusAction();
      if (status.error) {
        setLoadError(status.error);
        return;
      }
      setLoadError(null);
      setHasActiveToken(status.hasActiveToken);
      setLastAccessedAt(status.lastAccessedAt);
      setFeedUrl(null);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const rotate = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await rotateCalendarFeedAction();
      if (result.error) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setHasActiveToken(true);
      setFeedUrl(`${appOrigin.replace(/\/$/, '')}/api/calendar/feed/${result.rawToken}`);
      setMessage(t('created'));
    });
  };

  const revoke = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await revokeCalendarFeedAction();
      if (result.error) {
        setLoadError(result.error);
        return;
      }
      setHasActiveToken(false);
      setFeedUrl(null);
      setLastAccessedAt(null);
      setMessage(t('revoked'));
    });
  };

  const copyUrl = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setMessage(t('copied'));
    } catch {
      setMessage(t('copyFailed'));
    }
  };

  return (
    <MainAppSection
      title={
        <span className="inline-flex items-start gap-2">
          <CalendarSync className="mt-0.5 size-5 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
          <span>{t('title')}</span>
        </span>
      }
      description={t('description')}
      className="w-full min-w-0"
    >
      {loadError ? (
        <Alert tone="warning">{loadError}</Alert>
      ) : null}

      {message ? (
        <Alert tone="success" role="status">
          {message}
        </Alert>
      ) : null}

      <p className="text-sm text-[var(--pf-text-muted)]">
        {hasActiveToken ? t('statusActive') : t('statusNone')}
        {lastAccessedAt ? (
          <span className="ms-1">
            · {t('lastSync', { date: new Date(lastAccessedAt).toLocaleString() })}
          </span>
        ) : null}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={pending} onClick={rotate}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          {hasActiveToken ? t('rotate') : t('create')}
        </Button>
        {hasActiveToken ? (
          <Button type="button" size="sm" variant="secondary" loading={pending} onClick={revoke}>
            <Trash2 className="size-4" aria-hidden />
            {t('revoke')}
          </Button>
        ) : null}
      </div>

      {feedUrl ? (
        <div className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-muted)]">
            {t('urlLabel')}
          </p>
          <p dir="ltr" className="break-all text-sm">
            {feedUrl}
          </p>
          <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => void copyUrl()}>
            <Copy className="size-4" aria-hidden />
            {t('copy')}
          </Button>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('urlHint')}</p>
        </div>
      ) : null}
    </MainAppSection>
  );
}

'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { OptionalModuleKey } from '@/modules/tenancy/domain/types';
import {
  dismissUnusedCapabilityAction,
  hideUnusedCapabilityAction,
  type SettingsActionState,
} from '../actions';

/**
 * Soft prompt to hide an enabled-but-unused capability.
 * Never auto-hides — hide requires an explicit action.
 */
export function UnusedCapabilitySuggestionBanner({
  moduleKey,
  canEdit,
}: {
  readonly moduleKey: OptionalModuleKey;
  readonly canEdit: boolean;
}) {
  const t = useTranslations('settings.modules');
  const tCommon = useTranslations('common');
  const moduleLabel = t(moduleKey);
  const [hideState, hideAction, hidePending] = useActionState(
    hideUnusedCapabilityAction,
    {} as SettingsActionState,
  );
  const [dismissState, dismissAction, dismissPending] = useActionState(
    dismissUnusedCapabilityAction,
    {} as SettingsActionState,
  );

  if (!canEdit) return null;

  return (
    <Alert tone="info" className="mb-4" role="status">
      <p className="text-sm font-medium">
        {t('unusedSuggestion', { module: moduleLabel })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={hideAction}>
          <input type="hidden" name="moduleKey" value={moduleKey} />
          <Button type="submit" size="sm" variant="secondary" loading={hidePending}>
            {t('unusedHide')}
          </Button>
        </form>
        <form action={dismissAction}>
          <input type="hidden" name="moduleKey" value={moduleKey} />
          <Button type="submit" size="sm" variant="ghost" loading={dismissPending}>
            {t('unusedDismiss')}
          </Button>
        </form>
      </div>
      {hideState.error || dismissState.error ? (
        <p className="mt-2 text-sm text-[var(--pf-danger)]">
          {hideState.error ?? dismissState.error}
        </p>
      ) : null}
      {hideState.ok || dismissState.ok ? (
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]" aria-live="polite">
          {hideState.message ?? dismissState.message ?? tCommon('states.saved')}
        </p>
      ) : null}
    </Alert>
  );
}

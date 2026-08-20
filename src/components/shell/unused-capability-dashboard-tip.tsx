'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import type { OptionalModuleKey } from '@/modules/tenancy/domain/types';
import {
  dismissUnusedCapabilityAction,
  type SettingsActionState,
} from '@/app/[locale]/(app)/settings/actions';

/**
 * One soft tip on the home dashboard pointing at an unused capability.
 * Dismiss stores the key in unused_capability_dismissals (same as settings).
 */
export function UnusedCapabilityDashboardTip({
  moduleKey,
  canEdit,
}: {
  readonly moduleKey: OptionalModuleKey;
  readonly canEdit: boolean;
}) {
  const t = useTranslations('settings.modules');
  const moduleLabel = t(moduleKey);
  const [state, action, pending] = useActionState(
    dismissUnusedCapabilityAction,
    {} as SettingsActionState,
  );

  if (!canEdit || state.ok) return null;

  return (
    <Alert tone="info" role="status">
      <p className="text-sm">
        {t('unusedSuggestion', { module: moduleLabel })}{' '}
        <Link href="/settings/features" className="underline underline-offset-2">
          {t('unusedOpenSettings')}
        </Link>
      </p>
      <form action={action} className="mt-2">
        <input type="hidden" name="moduleKey" value={moduleKey} />
        <Button type="submit" size="sm" variant="ghost" loading={pending}>
          {t('unusedDismiss')}
        </Button>
      </form>
      {state.error ? (
        <p className="mt-1 text-sm text-[var(--pf-danger)]">{state.error}</p>
      ) : null}
    </Alert>
  );
}
